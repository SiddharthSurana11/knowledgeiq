const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

const PROTO_PATH = path.resolve(__dirname, '../../../protos/llm_service.proto');
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

module.exports = { getLLMResponse };
