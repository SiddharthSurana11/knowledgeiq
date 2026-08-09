// utils/embeddingClient.js

const grpc = require('@grpc/grpc-js');
const embedding_pb = require('../services/grpcClients/embedding_pb.js');
const embedding_grpc_pb = require('../services/grpcClients/embedding_grpc_pb.js');

const { config } = require('../config');
const CircuitBreaker = require('opossum');
const { withRetry } = require('./retryHelper');

// Host of your Python embedding service
const EMBEDDING_GRPC_HOST = config.grpc.embedHost;

const credentials = config.tls.grpcEnabled ? grpc.credentials.createSsl() : grpc.credentials.createInsecure();
const client = new embedding_grpc_pb.EmbeddingServiceClient(EMBEDDING_GRPC_HOST, credentials);

function _handleUpload({ temp_path, category, original_name, userId }) {
  return new Promise((resolve, reject) => {
    const req = new embedding_pb.HandleUploadRequest();
    req.setTempPath(temp_path);
    req.setCategory(category);
    req.setOriginalName(original_name);

    const meta = new grpc.Metadata();
    if (userId) meta.add('x-user-id', userId);

    client.handleUpload(req, meta, (err, response) => {
      if (err) return reject(err);
      resolve(response);
    });
  });
}

function _getEmbeddingForText(text) {
  return new Promise((resolve, reject) => {
    const req = new embedding_pb.GetEmbeddingRequest();
    req.setText(text);
    client.getEmbedding(req, (err, res) => {
      if (err) return reject(err);
      const vector = res.getVectorList();
      resolve(vector);
    });
  });
}

const breakerOptions = {
  timeout: config.circuitBreaker.timeoutMs, 
  errorThresholdPercentage: config.circuitBreaker.errorThresholdPercentage,
  resetTimeout: config.circuitBreaker.resetTimeoutMs,
  volumeThreshold: config.circuitBreaker.volumeThreshold
};

const cbUpload = new CircuitBreaker(_handleUpload, breakerOptions);
const cbEmbedding = new CircuitBreaker(_getEmbeddingForText, breakerOptions);

// Convert callback pattern for handleUpload back to original format to avoid breaking uploadRoute.js immediately
function handleUpload(args, callback) {
  withRetry('Embedding.handleUpload', () => cbUpload.fire(args))
    .then(res => callback(null, res))
    .catch(err => callback(err, null));
}

function getEmbeddingForText(text) {
  return withRetry('Embedding.getTextEmbedding', () => cbEmbedding.fire(text));
}

module.exports = {
  handleUpload,
  getEmbeddingForText
};

