const { Pinecone } = require('@pinecone-database/pinecone');
const { getEmbeddingForText } = require('./embeddingClient.js');
const { config } = require('../config');
const CircuitBreaker = require('opossum');
const { withRetry } = require('./retryHelper');
const logger = require('./logger');
const { scoreBM25 } = require('./bm25');
const { fuseRankings } = require('./rrfFusion');
const { rerankCandidates } = require('./rerankClient');
const { getDB } = require('./mongoClient.js');
require('dotenv').config();

const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const PINECONE_INDEX = process.env.PINECONE_INDEX || 'chatbot-index';

if (!PINECONE_API_KEY) throw new Error('❌ Pinecone API key missing!');
const pinecone = new Pinecone({ apiKey: PINECONE_API_KEY });
const index = pinecone.Index(PINECONE_INDEX);

async function _upsertVectors(vectors) {
  if (!Array.isArray(vectors) || vectors.length === 0) throw new Error('Vectors required');
  return await index.upsert(vectors);
}

async function _queryVectors(vector, topK = 5) {
  if (!Array.isArray(vector)) throw new Error('Query vector must be an array');
  return await index.query({ vector, topK, includeMetadata: true });
}

async function _deleteVectors(ids) {
  if (!Array.isArray(ids) || ids.length === 0) throw new Error('IDs required');
  return await index.deleteMany(ids);
}

/**
 * Diversity filter: max 2 chunks per document, fill remaining slots with best rejected chunks.
 * Returns up to `limit` chunks sorted by score descending.
 */
function applyDiversityFilter(chunks, limit = 5) {
  const diverseChunks = [];
  const rejectedChunks = [];
  const docCounts = {};

  for (const chunk of chunks) {
    const rawDocId = chunk.filename || 'unknown';
    const docId = rawDocId.toLowerCase().replace(/[^a-z0-9]/g, '');
    docCounts[docId] = (docCounts[docId] || 0) + 1;
    if (docCounts[docId] <= 2) {
      diverseChunks.push(chunk);
    } else {
      rejectedChunks.push(chunk);
    }
    if (diverseChunks.length === limit) break;
  }

  // Fill remaining slots with best rejected chunks
  let i = 0;
  while (diverseChunks.length < limit && i < rejectedChunks.length) {
    diverseChunks.push(rejectedChunks[i]);
    i++;
  }

  diverseChunks.sort((a, b) => (b.rankScore || b.score) - (a.rankScore || a.score));
  return diverseChunks.slice(0, limit);
}

async function getRelevantChunks(userQuery, topK = 5, category = null, scope = 'global', documentId = null, resolvedFilename = null) {
  const hybridEnabled = config.retrieval.hybridEnabled;

  // When hybrid is enabled, fetch a larger candidate pool; otherwise use original topK
  const candidatePoolSize = hybridEnabled ? config.retrieval.hybridCandidatePoolSize : topK;

  const embedding = await getEmbeddingForText(userQuery);
  const queryOptions = {
    vector: embedding,
    topK: candidatePoolSize,
    includeMetadata: true
  };
  
  const filters = [];
  if (scope === 'category' && category) {
    filters.push({ category: { $eq: category.toLowerCase() } });
  } else if (scope === 'document' && (documentId || resolvedFilename)) {
    const docConditions = [];
    if (documentId) docConditions.push({ documentId: { $eq: documentId } });
    if (resolvedFilename) docConditions.push({ filename: { $eq: resolvedFilename } });
    filters.push(docConditions.length === 1 ? docConditions[0] : { $or: docConditions });
  }
  
  if (filters.length > 0) {
    queryOptions.filter = filters.length === 1 ? filters[0] : { $and: filters };
  }

  const results = await index.query(queryOptions);
  let chunks = (results.matches || []).map(match => ({
    score: match.score,
    vectorScore: match.score,
    text: match.metadata?.text,
    category: match.metadata?.category,
    filename: match.metadata?.filename,
    documentId: match.metadata?.documentId,
    chunk_id: match.id,
    page: match.metadata?.page
  }));

  const STOPWORDS = new Set([
    'the', 'how', 'was', 'are', 'can', 'all', 'for', 'and', 'not', 'you', 'who', 'why',
    'our', 'its', 'has', 'had', 'any', 'out', 'may', 'use', 'what', 'which', 'where',
    'when', 'with', 'from', 'this', 'that', 'they', 'them', 'have', 'been', 'does', 'tell',
    'about', 'like', 'some', 'than', 'more', 'into', 'just', 'over', 'also', 'your'
  ]);

  // ═══════════════════════════════════════════════════════════════════
  // LEGACY PATH — exact original behavior when hybrid retrieval is off
  // ═══════════════════════════════════════════════════════════════════
  let hasLexicalMatch = false;
  if (!hybridEnabled) {
    // Lexical re-ranking: filter out common stopwords, keep short content words (six, PII, ISO, SOC)
    const queryWords = userQuery.toLowerCase().split(/\s+/).filter(w => w.length >= 3 && !STOPWORDS.has(w));
    chunks.forEach(chunk => {
      let boost = 0;
      const target = `${chunk.filename || ''} ${chunk.category || ''} ${chunk.text || ''}`.toLowerCase();
      for (const word of queryWords) {
        if (target.includes(word)) {
          boost += 0.05; // 5% boost per matched content word
          hasLexicalMatch = true;
        }
      }
      boost = Math.min(boost, 0.20);
      chunk.score = chunk.score * (1 + boost);
    });

    chunks.sort((a, b) => b.score - a.score);
    const finalChunks = applyDiversityFilter(chunks, 4);
    finalChunks.hasLexicalMatch = hasLexicalMatch;
    return finalChunks;
  }

  // ═══════════════════════════════════════════════════════════════════
  // HYBRID PATH — BM25 + RRF + Cross-Encoder Reranking
  // ═══════════════════════════════════════════════════════════════════

  // Step 1: BM25 scoring on candidate chunk TEXT CONTENT (not filename/category)
  const candidateTexts = chunks.map(c => c.text || '');
  const bm25Results = scoreBM25(userQuery, candidateTexts);

  // Step 2: Build ranked lists for RRF
  // Vector-ranked list (already sorted by Pinecone similarity score)
  const vectorRanked = chunks.map(c => ({ id: c.chunk_id, score: c.score }));

  // BM25-ranked list (sorted by BM25 score)
  const bm25Ranked = bm25Results.map(r => ({ id: chunks[r.index].chunk_id, score: r.score }));

  // Step 3: Reciprocal Rank Fusion
  const rrfFused = fuseRankings(vectorRanked, bm25Ranked, 60);

  // Build a lookup from chunk_id to chunk object for quick access
  const chunkById = {};
  for (const chunk of chunks) {
    chunkById[chunk.chunk_id] = chunk;
  }

  // Reorder chunks by RRF score
  const rrfOrderedChunks = rrfFused
    .filter(r => chunkById[r.id])
    .map(r => {
      const chunk = chunkById[r.id];
      return { ...chunk, score: r.rrfScore }; // Replace score with RRF score
    });

  // Helper: Sigmoid normalization to map unbounded cross-encoder logits to [0, 1]
  const sigmoid = (x) => 1 / (1 + Math.exp(-x));

  // Step 4: Cross-encoder reranking on top N candidates
  const rerankTopN = config.retrieval.rerankTopN;
  const topCandidates = rrfOrderedChunks.slice(0, rerankTopN);

  const rerankTexts = topCandidates.map(c => c.text || '');
  const rerankScores = await rerankCandidates(userQuery, rerankTexts);

  let finalRanked;
  if (rerankScores && rerankScores.length === topCandidates.length) {
    // Apply sigmoid-normalized cross-encoder scores (bounded in [0, 1])
    finalRanked = topCandidates.map((chunk, idx) => {
      const rawLogit = rerankScores[idx];
      const normalizedScore = sigmoid(rawLogit);
      return {
        ...chunk,
        vectorScore: chunk.vectorScore || chunk.score,
        rawRerankScore: rawLogit,
        score: Math.min(1.0, Math.max(0.0, normalizedScore)) // Bounded [0, 1] for chatRoute minConfidence & UI %
      };
    });
    finalRanked.sort((a, b) => b.score - a.score);
    logger.info('[HybridRetrieval] Cross-encoder reranking applied successfully with Sigmoid score normalization.');
  } else {
    // Fallback: use RRF ordering, but preserve original vector similarity score in `score`
    // so chatRoute.js minConfidence (0.75) and confidence display work correctly
    finalRanked = topCandidates.map(chunk => ({
      ...chunk,
      score: chunk.vectorScore || chunk.score // Retain vector similarity score in [0, 1]
    }));
    logger.warn('[HybridRetrieval] Cross-encoder reranking unavailable — using RRF fusion ordering with vector score fallback.');
  }

  // ═══════════════════════════════════════════════════════════════════
  // Step 5: RECENCY-WEIGHTED RANKING (hybrid path only)
  // Blends cross-encoder confidence with document recency for sort order.
  //   rankScore = 0.75 * score + 0.25 * recencyWeight
  // IMPORTANT: `score` (confidence) is NOT modified — it remains the
  // pure normalized cross-encoder score for the hallucination guard in
  // chatRoute.js. Only `rankScore` is used for sorting.
  // ═══════════════════════════════════════════════════════════════════
  try {
    const docIds = [...new Set(finalRanked.map(c => c.documentId).filter(Boolean))];
    if (docIds.length > 0) {
      const db = getDB();
      const docs = await db.collection('documents')
        .find({ documentId: { $in: docIds } }, { projection: { documentId: 1, effectiveDate: 1 } })
        .toArray();

      const effectiveDateByDocId = {};
      for (const doc of docs) {
        if (doc.effectiveDate) effectiveDateByDocId[doc.documentId] = new Date(doc.effectiveDate);
      }

      const now = Date.now();
      for (const chunk of finalRanked) {
        const effDate = effectiveDateByDocId[chunk.documentId];
        if (effDate) {
          const daysSince = (now - effDate.getTime()) / (1000 * 60 * 60 * 24);
          const recencyWeight = Math.exp(-daysSince / 365);
          chunk.rankScore = 0.75 * chunk.score + 0.25 * recencyWeight;
        } else {
          // No effectiveDate found — rank by score alone
          chunk.rankScore = chunk.score;
        }
      }
      finalRanked.sort((a, b) => b.rankScore - a.rankScore);
      logger.info('[HybridRetrieval] Recency-weighted ranking applied.');
    } else {
      // No documentIds on chunks — rank by score alone
      for (const chunk of finalRanked) { chunk.rankScore = chunk.score; }
    }
  } catch (recencyErr) {
    // Graceful fallback: skip recency weighting entirely, rank by cross-encoder score alone
    logger.warn('[HybridRetrieval] Recency weighting unavailable — effectiveDate lookup failed: %s. Falling back to cross-encoder score ranking.', recencyErr.message);
    for (const chunk of finalRanked) { chunk.rankScore = chunk.score; }
  }

  // Step 6: Apply diversity filter and return top 5
  return applyDiversityFilter(finalRanked, 5);
}

async function _deleteVectorsByDocument(documentId, filename = null, category = null) {
  if (!documentId && !filename) throw new Error('documentId or filename required');
  const filter = {};
  if (documentId) {
    filter.documentId = { $eq: documentId };
  } else if (filename) {
    filter.filename = { $eq: filename };
    if (category) {
      filter.category = { $eq: category.toLowerCase() };
    }
  }
  return await index.deleteMany(filter);
}

const breakerOptions = {
  timeout: config.circuitBreaker.timeoutMs, 
  errorThresholdPercentage: config.circuitBreaker.errorThresholdPercentage,
  resetTimeout: config.circuitBreaker.resetTimeoutMs,
  volumeThreshold: config.circuitBreaker.volumeThreshold
};

const cbUpsert = new CircuitBreaker(_upsertVectors, breakerOptions);
const cbQuery = new CircuitBreaker(_queryVectors, breakerOptions);
const cbDelete = new CircuitBreaker(_deleteVectors, breakerOptions);
const cbDeleteByDoc = new CircuitBreaker(_deleteVectorsByDocument, breakerOptions);

// Graceful fallback for query operations
cbQuery.fallback(() => {
  const err = new Error('Pinecone Service unavailable.');
  err.code = 'KIQ-5003';
  err.status = 503;
  return Promise.reject(err);
});

async function upsertVectors(vectors) { return withRetry('Pinecone.upsert', () => cbUpsert.fire(vectors)); }
async function queryVectors(vector, topK) { return withRetry('Pinecone.query', () => cbQuery.fire(vector, topK)); }
async function deleteVectors(ids) { return withRetry('Pinecone.delete', () => cbDelete.fire(ids)); }
async function deleteVectorsByDocument(filename, category) { return withRetry('Pinecone.deleteByDoc', () => cbDeleteByDoc.fire(filename, category)); }

module.exports = {
  index,
  upsertVectors,
  queryVectors,
  deleteVectors,
  deleteVectorsByDocument,
  getRelevantChunks
};
