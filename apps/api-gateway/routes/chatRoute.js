const express = require('express');
const { getRelevantChunks } = require('../utils/pineconeClient.js');
const { getLLMResponse, rewriteQuery } = require('../utils/llmClient.js');
const { getDB } = require('../utils/mongoClient.js');
const logger = require('../utils/logger.js');
const { config } = require('../config');
const { startSpan, endSpan } = require('../utils/tracing');

const { validate, schemas } = require('../middlewares/validation');

const router = express.Router();

router.post('/', validate(schemas.chatSchema), async (req, res, next) => {
  const { message, history, userId, category, scope, documentId } = req.body;
  const overallStartTime = Date.now();
  
  logger.chatLog('Query received', { eventId: 'CHAT_REQUEST_RECEIVED', query: message, scope, category, documentId, userId });

  // OTel: top-level chat span
  const chatSpan = startSpan('chat.request', { 'http.request_id': req.id, 'chat.query': message, 'chat.scope': scope || 'global' });

  try {
    // 1. Extract memory block once (used for both query rewriter and downstream LLM answer generation)
    const validMessages = (history || [])
      .filter(msg => msg && (msg.role === 'user' || msg.role === 'bot'))
      .filter(msg => msg.text && !msg.text.includes('[No response returned') && !msg.text.includes('⚠️ No response') && !msg.text.includes('❌ Failed'));

    const chatHistory = validMessages
      .map((msg, idx, arr) =>
        msg.role === 'user'
          ? { user: msg.text, bot: arr[idx + 1]?.role === 'bot' ? arr[idx + 1].text.slice(0, 120) : '' }
          : null
      ).filter(Boolean)
      .slice(-2);

    const memory_block = chatHistory.map(pair => `User: ${pair.user}\nBot: ${pair.bot}`).join('\n');

    // 2. Query Rewriter Step (Fail-Open)
    let searchQuery = message;
    let isRewritten = false;
    let rewriteLatency = 0;

    if (config.retrieval.queryRewriteEnabled) {
      const rewriteSpan = startSpan('chat.query_rewrite', { 'http.request_id': req.id, 'chat.raw_query': message });
      const rewriteStartTime = Date.now();

      try {
        const rewritten = await rewriteQuery({ user_query: message, memory_block }, config.retrieval.queryRewriteTimeoutMs);
        if (rewritten && rewritten.trim()) {
          searchQuery = rewritten.trim();
          isRewritten = searchQuery.toLowerCase() !== message.toLowerCase();
        }
        rewriteLatency = Date.now() - rewriteStartTime;

        endSpan(rewriteSpan, {
          'chat.raw_query': message,
          'chat.rewritten_query': searchQuery,
          'chat.is_rewritten': isRewritten,
          'chat.rewrite_latency_ms': rewriteLatency
        });

        logger.chatLog('Query rewrite completed', {
          eventId: 'QUERY_REWRITE_COMPLETED',
          rawQuery: message,
          searchQuery,
          isRewritten,
          latencyMs: rewriteLatency
        });
      } catch (rewriteErr) {
        rewriteLatency = Date.now() - rewriteStartTime;
        endSpan(rewriteSpan, { 'chat.rewrite_failed': true, 'error': rewriteErr.message });
        logger.warn('[QueryRewriter] Error during query rewrite — falling back to raw user query', { error: rewriteErr.message });
        searchQuery = message;
      }
    } else {
      logger.chatLog('Query rewriter disabled via QUERY_REWRITE_ENABLED', { eventId: 'QUERY_REWRITE_SKIPPED' });
    }

    // 3. Document Retrieval using searchQuery (rewritten or fallback raw message)
    logger.chatLog('Retriever started', { eventId: 'PINECONE_RETRIEVAL_STARTED', searchQuery });
    let resolvedDocId = documentId;
    let resolvedFilename = documentId;
    if (scope === 'document' && documentId) {
      try {
        const db = getDB();
        const doc = await db.collection('documents').findOne({
          $or: [
            { documentId: documentId },
            { filename: documentId }
          ]
        });
        if (doc) {
          resolvedDocId = doc.documentId || documentId;
          resolvedFilename = doc.filename || documentId;
        }
      } catch (e) {
        logger.error('Error resolving document metadata for Pinecone filter', { error: e.message });
      }
    }

    const retrievalSpan = startSpan('chat.pinecone_retrieval', { 'http.request_id': req.id });
    const pineconeStartTime = Date.now();
    const chunks = await getRelevantChunks(searchQuery, config.retrieval.topK, category, scope, resolvedDocId, resolvedFilename);
    const pineconeLatency = Date.now() - pineconeStartTime;
    endSpan(retrievalSpan, { 'retrieval.chunk_count': chunks.length, 'retrieval.top_score': chunks[0]?.score || 0, 'retrieval.latency_ms': pineconeLatency, 'retrieval.hybrid_enabled': config.retrieval.hybridEnabled });
    
    // Evaluate retrieval stats
    const topScore = chunks.length > 0 ? chunks[0].score : 0;
    logger.chatLog('Top K retrieved', { eventId: 'PINECONE_RETRIEVAL_COMPLETED', count: chunks.length, topScore, latencyMs: pineconeLatency });

    // Retrieve trust scores of chunks in parallel
    const db = getDB();
    const trustSpan = startSpan('chat.trust_score_fetch', { 'http.request_id': req.id });
    const trustScoreStartTime = Date.now();
    
    // Fetch trust scores of chunks in a single batched MongoDB query using $in
    const filenames = Array.from(new Set((chunks || []).map(c => c.filename).filter(Boolean)));
    const fetchedDocs = filenames.length > 0
      ? await db.collection('documents').find({ filename: { $in: filenames } }).toArray()
      : [];

    const docsByFilename = {};
    for (const doc of fetchedDocs) {
      if (doc && doc.filename) docsByFilename[doc.filename] = doc;
    }

    const trustScoreLatency = Date.now() - trustScoreStartTime;
    endSpan(trustSpan, { 'trust.doc_count': fetchedDocs.length, 'trust.latency_ms': trustScoreLatency });
    logger.chatLog('Trust scores fetched', { eventId: 'TRUST_SCORE_FETCH_COMPLETED', latencyMs: trustScoreLatency });

    let topResultTrustScore = 0;
    if (chunks && chunks.length > 0 && chunks[0].filename) {
       const topDoc = docsByFilename[chunks[0].filename];
       if (topDoc && topDoc.trustScore !== undefined) {
         topResultTrustScore = topDoc.trustScore;
       }
    }

    // Evaluate hallucination guard thresholds
    const minConfidence = config.retrieval?.minConfidence || 0.45;
    const absoluteFloor = config.retrieval?.absoluteConfidenceFloor || 0.35;
    const minChunks = config.retrieval?.minSupportingChunks || 1;
    const minTrustScore = config.retrieval?.minTrustScore || 0;
    
    let isRefusal = false;
    const effectiveFloor = (scope === 'document' && chunks.hasLexicalMatch) ? 0.15 : absoluteFloor;
    const allowBypass = chunks.length >= 1 && topResultTrustScore >= 70 && topScore >= 0.30;

    if (topScore < effectiveFloor || (!allowBypass && (chunks.length < minChunks || topScore < minConfidence || topResultTrustScore < minTrustScore))) {
      logger.chatLog('Insufficient retrieval confidence, flagging for refusal', { eventId: 'HALLUCINATION_GUARD_TRIGGERED', topScore, absoluteFloor: effectiveFloor, chunksLen: chunks.length, topResultTrustScore });
      isRefusal = true;
    }

    // --- Call your Python LLMService ---
    logger.chatLog('LLM request sent', { eventId: 'LLM_REQUEST_SENT', historyLength: chatHistory.length });
    const llmSpan = startSpan('chat.llm_generate', { 'http.request_id': req.id, 'llm.is_refusal': isRefusal });
    const llmStartTime = Date.now();
    
    const reply = await getLLMResponse({
      user_query: message,
      retrieved_content: chunks,
      memory_block,
      is_refusal: isRefusal,
      userId: req.user ? req.user.id : null
    });
    
    const llmLatency = Date.now() - llmStartTime;
    const totalLatency = Date.now() - overallStartTime;

    let telemetry = {};
    const rawTelemetry = reply.telemetryJson || reply.telemetry_json;
    if (rawTelemetry) {
      try {
        telemetry = typeof rawTelemetry === 'string' ? JSON.parse(rawTelemetry) : rawTelemetry;
      } catch (e) {
        logger.error('Failed to parse telemetry JSON', e);
      }
    }

    const providerName = telemetry.provider_name || telemetry.model_name || 'unknown';
    const promptTokens = typeof telemetry.prompt_tokens === 'number' ? telemetry.prompt_tokens : 0;
    const completionTokens = typeof telemetry.completion_tokens === 'number' ? telemetry.completion_tokens : 0;

    endSpan(llmSpan, {
      'llm.latency_ms': llmLatency,
      'llm.provider': providerName,
      'llm.prompt_tokens': promptTokens,
      'llm.completion_tokens': completionTokens
    });
    logger.chatLog('LLM response received', { eventId: 'LLM_RESPONSE_RECEIVED', latencyMs: llmLatency, telemetry });

    // Log query in search_logs
    await db.collection('search_logs').insertOne({
      query: searchQuery,
      rawQuery: message,
      isRewritten,
      rewriteLatency,
      category: category || 'all',
      scope: scope || 'global',
      documentId: resolvedDocId || null,
      sessionId: req.body.sessionId || userId || null,
      timestamp: new Date(),
      resultsReturned: chunks.length,
      responseTime: totalLatency, // legacy total field
      pineconeLatency,
      trustScoreLatency,
      llmLatency,
      totalLatency,
      topResultTrustScore,
      telemetry
    });

    logger.chatLog('Response returned', { eventId: 'CHAT_RESPONSE_SENT', totalLatencyMs: totalLatency });

    // Enrich document hits mapping directly from original chunks
    const enrichedHits = [];
    const processedChunks = new Set();
    
    for (const [index, chunk] of chunks.entries()) {
      if (!chunk.filename || processedChunks.has(chunk.chunk_id)) continue;
      processedChunks.add(chunk.chunk_id);
      
      const doc = docsByFilename[chunk.filename];
      enrichedHits.push({
        filename: chunk.filename,
        chunk_index: index + 1,
        chunk_id: chunk.chunk_id,
        confidence: Math.round(chunk.score * 100),
        raw_score: chunk.score,
        category: chunk.category || doc?.category || 'general',
        documentId: chunk.documentId || doc?.documentId,
        page: chunk.page,
        trust_score: doc?.trustScore !== undefined ? doc.trustScore : 100
      });
    }

    res.success({
      reply: reply.answer,
      follow_up: reply.followUp || reply.follow_up,
      document_hits: enrichedHits,
      resource_type: reply.resourceType || reply.resource_type,
      is_refusal: isRefusal
    });
    // End top-level chat span on success
    endSpan(chatSpan, { 'chat.total_latency_ms': totalLatency, 'chat.chunks_returned': chunks.length, 'chat.is_refusal': isRefusal });
  } catch (error) {
    endSpan(chatSpan, {}, error);
    logger.error('Chat workflow failed', error);
    next(error);
  }
});

module.exports = router;
