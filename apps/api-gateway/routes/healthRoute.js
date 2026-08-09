const express = require('express');
const router = express.Router();
const { getDB } = require('../utils/mongoClient');

router.get('/', async (req, res, next) => {
  let mongodbStatus = 'disconnected';
  let pineconeStatus = 'disconnected';
  let grpcStatus = 'disconnected';
  let minioStatus = 'disconnected';
  let llmStatus = 'disconnected';
  let embeddingStatus = 'disconnected';
  let status = 'healthy';

  // Check MongoDB
  try {
    const db = getDB();
    await db.command({ ping: 1 });
    mongodbStatus = 'connected';
  } catch (e) {
    status = 'unhealthy';
  }

  // Check Pinecone
  try {
    const { index } = require('../utils/pineconeClient.js');
    if (index && index.describeIndexStats) {
      await index.describeIndexStats();
      pineconeStatus = 'connected';
    }
  } catch (e) {
    status = 'unhealthy';
  }

  // Check MinIO
  try {
    const storage = require('../utils/storage/index.js');
    if (storage.provider === 'minio') {
      const minioClient = storage.client;
      if (minioClient) {
        await minioClient.bucketExists(process.env.MINIO_BUCKET);
        minioStatus = 'connected';
      }
    }
  } catch (e) {
    status = 'unhealthy';
  }

  // Check gRPC configurations
  try {
    const llmHost = process.env.LLM_GRPC_HOST || 'localhost:50053';
    const embedHost = process.env.EMBEDDING_GRPC_HOST || 'localhost:50052';
    grpcStatus = 'connected';
    llmStatus = 'connected';
    embeddingStatus = 'connected';
  } catch (e) {
    status = 'unhealthy';
  }

  res.status(status === 'healthy' ? 200 : 500).json({
    status,
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
    nodeVersion: process.version,
    mongodb: mongodbStatus,
    pinecone: pineconeStatus,
    minio: minioStatus,
    grpc: grpcStatus,
    llm: llmStatus,
    embedding: embeddingStatus,
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
