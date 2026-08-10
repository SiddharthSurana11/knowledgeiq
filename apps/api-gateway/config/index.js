require('dotenv').config();

const config = {
  port: process.env.PORT || 5000,
  mongodb: {
    uri: process.env.MONGODB_URI,
    dbName: process.env.MONGODB_DB || process.env.MONGO_DB_NAME
  },
  pinecone: {
    apiKey: process.env.PINECONE_API_KEY,
    indexName: process.env.PINECONE_INDEX
  },
  storage: {
    provider: process.env.STORAGE_PROVIDER,
    endpoint: process.env.MINIO_ENDPOINT,
    bucket: process.env.MINIO_BUCKET,
    accessKey: process.env.MINIO_ACCESS_KEY,
    secretKey: process.env.MINIO_SECRET_KEY
  },
  grpc: {
    llmHost: process.env.LLM_GRPC_HOST || '127.0.0.1:50053',
    embedHost: process.env.EMBEDDING_GRPC_HOST || '127.0.0.1:50052'
  },
  limits: {
    payloadSize: '10mb',
    uploadLimitBytes: (parseInt(process.env.UPLOAD_MAX_SIZE_MB) || 100) * 1024 * 1024,
    uploadMaxMB: parseInt(process.env.UPLOAD_MAX_SIZE_MB) || 100,
    cacheTtlMs: 30000
  },
  retrieval: {
    minConfidence: parseFloat(process.env.MIN_CONFIDENCE || '0.75'),
    absoluteConfidenceFloor: parseFloat(process.env.ABSOLUTE_CONFIDENCE_FLOOR || '0.35'),
    minSupportingChunks: parseInt(process.env.MIN_SUPPORTING_CHUNKS || '1', 10),
    minTrustScore: parseInt(process.env.MIN_TRUST_SCORE || '0', 10),
    topK: parseInt(process.env.RETRIEVAL_TOP_K || '15', 10),
    hybridEnabled: process.env.HYBRID_RETRIEVAL_ENABLED === 'true',
    hybridCandidatePoolSize: parseInt(process.env.HYBRID_CANDIDATE_POOL_SIZE || '25', 10),
    rerankTopN: parseInt(process.env.RERANK_TOP_N || '10', 10),
    queryRewriteEnabled: process.env.QUERY_REWRITE_ENABLED !== 'false',
    queryRewriteTimeoutMs: parseInt(process.env.QUERY_REWRITE_TIMEOUT_MS || '3500', 10)
  },
  cors: {
    trustedOrigins: (process.env.CORS_TRUSTED_ORIGINS || '*').split(',').map(o => o.trim())
  },
  auth: {
    enabled: process.env.AUTH_ENABLED === 'true',
    jwtSecret: process.env.JWT_SECRET || 'dev_secret_key_only_override_in_prod',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1h'
  },
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || String(15 * 60 * 1000), 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10)
  },
  circuitBreaker: {
    timeoutMs: parseInt(process.env.CB_TIMEOUT_MS || '75000', 10),
    errorThresholdPercentage: parseInt(process.env.CB_ERROR_THRESHOLD || '50', 10),
    resetTimeoutMs: parseInt(process.env.CB_RESET_TIMEOUT_MS || '30000', 10),
    volumeThreshold: parseInt(process.env.CB_VOLUME_THRESHOLD || '5', 10),
    maxRetries: parseInt(process.env.CB_MAX_RETRIES || '2', 10),
    baseDelayMs: parseInt(process.env.CB_BASE_DELAY_MS || '1000', 10),
    maxDelayMs: parseInt(process.env.CB_MAX_DELAY_MS || '10000', 10)
  },
  tls: {
    grpcEnabled: process.env.GRPC_TRANSPORT_SECURITY_ENABLED === 'true'
  },
  governance: {
    staleThresholdDays: parseInt(process.env.STALE_THRESHOLD_DAYS || '180', 10)
  }
};

function validateConfig() {
  const required = [
    'MONGODB_URI',
    'MONGODB_DB',
    'PINECONE_API_KEY',
    'PINECONE_INDEX',
    'STORAGE_PROVIDER',
    'MINIO_ENDPOINT',
    'MINIO_BUCKET',
    'MINIO_ACCESS_KEY',
    'MINIO_SECRET_KEY'
  ];

  const missing = required.filter(key => !process.env[key]);
  if (missing.length > 0) {
    // Log directly to console since logger might not be fully initialized yet
    console.error(`[FATAL] Startup Error: Missing required environment configurations: ${missing.join(', ')}`);
    process.exit(1);
  }
}

module.exports = {
  config,
  validateConfig
};
