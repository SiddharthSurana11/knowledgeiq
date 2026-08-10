const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

const fs = require('fs');

function resolveProtoPath(filename) {
  const candidates = [
    path.resolve(__dirname, '../../../protos', filename),
    path.resolve(__dirname, '../../protos', filename),
    path.resolve(__dirname, '../protos', filename),
    path.resolve('/protos', filename),
    path.resolve('/app/protos', filename)
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[0];
}

const PROTO_PATH = resolveProtoPath('llm_service.proto');
const { config } = require('../config');
const CircuitBreaker = require('opossum');
const { withRetry } = require('./retryHelper');
const logger = require('./logger');

const LLM_GRPC_HOST = config.grpc.llmHost;

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});

const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
const credentials = config.tls.grpcEnabled ? grpc.credentials.createSsl() : grpc.credentials.createInsecure();
const client = new protoDescriptor.LLMService(LLM_GRPC_HOST, credentials);

client.waitForReady(Date.now() + 15000, (err) => {
  if (err) logger.warn('[LLMClient] gRPC LLM service not ready at startup — will attempt connection on query request');
  else logger.info('✅ gRPC LLM client connected!');
});

const _getLLMResponse = ({ user_query, retrieved_content = [], memory_block = '', is_refusal = false, userId = null }) => {
  return new Promise((resolve, reject) => {
    const req = {
      user_query,
      memory_block,
      is_refusal,
      retrieved_content: (retrieved_content || []).map(chunk => ({
        score: typeof chunk.score === 'number' ? chunk.score : 0.0,
        text: String(chunk.text || chunk.content || ''),
        category: String(chunk.category || ''),
        filename: String(chunk.filename || ''),
        page: String(chunk.page || ''),
        chunk_index: typeof chunk.chunk_index === 'number' ? chunk.chunk_index : 0,
        document_id: String(chunk.documentId || chunk.document_id || '')
      }))
    };

    const meta = new grpc.Metadata();
    if (userId) {
      meta.add('x-user-id', userId);
    }

    client.GenerateResponse(req, meta, (err, response) => {
      if (err) return reject(err);
      resolve({
        answer: response.answer,
        follow_up: response.follow_up,
        document_hits: response.document_hits || [],
        resource_type: response.resource_type,
        telemetry_json: response.telemetry_json
      });
    });
  });
};

const breakerOptions = {
  timeout: config.circuitBreaker.timeoutMs, 
  errorThresholdPercentage: config.circuitBreaker.errorThresholdPercentage,
  resetTimeout: config.circuitBreaker.resetTimeoutMs,
  volumeThreshold: config.circuitBreaker.volumeThreshold
};

const llmBreaker = new CircuitBreaker(_getLLMResponse, breakerOptions);

llmBreaker.fallback((err) => {
  if (err && (err.code === 'EOPENBREAKER' || err.code === 'ETIMEDOUT')) {
    const fallbackErr = new Error('LLM Service is temporarily unavailable.');
    fallbackErr.code = 'KIQ-5003';
    fallbackErr.status = 503;
    return Promise.reject(fallbackErr);
  }
  return Promise.reject(err);
});

function getLLMResponse(args) {
  return withRetry('LLMService', () => llmBreaker.fire(args));
}

function _analyzeContent({ system_prompt, content, task_type }) {
  return new Promise((resolve, reject) => {
    const req = {
      system_prompt,
      content,
      task_type
    };
    client.analyzeContent(req, (err, response) => {
      if (err) return reject(err);
      resolve(response);
    });
  });
}

const analyzeBreaker = new CircuitBreaker(_analyzeContent, breakerOptions);

async function analyzeContent(args) {
  return withRetry('LLMService.analyzeContent', () => analyzeBreaker.fire(args));
}

async function rewriteQuery({ user_query, memory_block = '' }, timeoutMs = 3500) {
  const system_prompt = 
    "You are a query rewriting module for an enterprise document search engine. " +
    "Your goal is to convert follow-up user queries into concise, standalone, search-optimized search queries. " +
    "Use the provided conversation history to resolve pronouns, references, or implicit context (e.g. 'what about that policy' -> 'what about the Microsoft AI Governance Policy'). " +
    "Output ONLY the single rewritten search query string. Do NOT add conversational greetings, explanations, or quotes. " +
    "If the query is already a clear standalone question or no context is required, return the exact original query.";

  const content = memory_block 
    ? `Recent Conversation History:\n${memory_block}\n\nUser Query to Rewrite: ${user_query}`
    : `User Query to Rewrite: ${user_query}`;

  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Query rewrite timeout exceeded')), timeoutMs);
  });

  try {
    const response = await Promise.race([
      analyzeContent({ system_prompt, content, task_type: 'query_rewriting' }),
      timeoutPromise
    ]);

    if (response && response.result) {
      const rewritten = response.result.trim().replace(/^["']|["']$/g, '');
      if (rewritten && rewritten.length > 0) {
        return rewritten;
      }
    }
    return null;
  } catch (err) {
    logger.warn(`[QueryRewriter] gRPC call failed or timed out: ${err.message}. Falling back to raw user query.`);
    return null;
  }
}

module.exports = { getLLMResponse, rewriteQuery };
