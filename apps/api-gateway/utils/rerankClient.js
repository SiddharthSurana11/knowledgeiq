// utils/rerankClient.js — gRPC client for the RerankCandidates RPC method.

const embedding_pb = require('../services/grpcClients/embedding_pb.js');
const embedding_grpc_pb = require('../services/grpcClients/embedding_grpc_pb.js');
const grpc = require('@grpc/grpc-js');

const { config } = require('../config');
const CircuitBreaker = require('opossum');
const { withRetry } = require('./retryHelper');
const logger = require('./logger');

const EMBEDDING_GRPC_HOST = config.grpc.embedHost;
const credentials = config.tls.grpcEnabled ? grpc.credentials.createSsl() : grpc.credentials.createInsecure();
const client = new embedding_grpc_pb.EmbeddingServiceClient(EMBEDDING_GRPC_HOST, credentials);

/**
 * Internal function: calls RerankCandidates gRPC method.
 * @param {string} query
 * @param {string[]} candidateTexts
 * @returns {Promise<number[]>} Array of cross-encoder relevance scores (same order as candidates).
 */
function _rerankCandidates(query, candidateTexts) {
  return new Promise((resolve, reject) => {
    const req = new embedding_pb.RerankRequest();
    req.setQuery(query);
    req.setCandidateTextsList(candidateTexts);

    client.rerankCandidates(req, (err, res) => {
      if (err) return reject(err);
      const scores = res.getScoresList();
      resolve(scores);
    });
  });
}

const breakerOptions = {
  timeout: config.circuitBreaker.timeoutMs,
  errorThresholdPercentage: config.circuitBreaker.errorThresholdPercentage,
  resetTimeout: config.circuitBreaker.resetTimeoutMs,
  volumeThreshold: config.circuitBreaker.volumeThreshold
};

const cbRerank = new CircuitBreaker(_rerankCandidates, breakerOptions);

// Graceful fallback: return null to signal caller to skip reranking
cbRerank.fallback(() => {
  logger.warn('[RerankClient] Circuit breaker open or timeout — skipping cross-encoder reranking.');
  return null;
});

/**
 * Rerank candidate texts using the cross-encoder model via gRPC.
 * Returns null if the call fails or circuit breaker is open (caller should fallback to RRF ordering).
 *
 * @param {string} query
 * @param {string[]} candidateTexts
 * @returns {Promise<number[]|null>}
 */
async function rerankCandidates(query, candidateTexts) {
  try {
    return await withRetry('Embedding.rerank', () => cbRerank.fire(query, candidateTexts));
  } catch (err) {
    logger.warn(`[RerankClient] Reranking failed after retries: ${err.message}. Falling back to RRF ordering.`);
    return null;
  }
}

module.exports = { rerankCandidates };
