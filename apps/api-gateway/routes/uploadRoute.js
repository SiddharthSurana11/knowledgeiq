const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const tmp = require('tmp');
const { v4: uuidv4 } = require('uuid');

const { connectToDB } = require('../utils/mongoClient');
const { config } = require('../config');
const storage = require('../utils/storage/index');
const { handleUpload } = require('../utils/embeddingClient');
const logger = require('../utils/logger');
const { getCachedCategories } = require('../utils/categoryCache');

// Services
const DocumentService = require('../services/documentService');
const DuplicateDetectionService = require('../services/duplicateDetectionService');
const ContradictionDetectionService = require('../services/contradictionDetectionService');
const TrustScoreService = require('../services/trustScoreService');
const { validate, schemas } = require('../middlewares/validation');
const Joi = require('joi');

const allowedMimePatterns = [
  "pdf",
  "msword",
  "wordprocessingml.document",
  "presentationml.presentation",
  "spreadsheetml.sheet",
  "powerpoint",
  "image/jpeg",
  "image/png",
  "wps-office"
];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.limits.uploadLimitBytes },
  fileFilter: (req, file, cb) => {
    const mimetype = (file.mimetype || "").toLowerCase();
    if (allowedMimePatterns.some(pattern => mimetype.includes(pattern))) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${mimetype}`));
    }
  }
});

router.post('/', validate(schemas.uploadBodySchema, 'body'), upload.single('file'), async (req, res, next) => {
  const file = req.file;
  if (!file) {
    const err = new Error('No file provided');
    err.status = 400;
    return next(err);
  }

  if (file.originalname.length > 255) {
    const err = new Error('Filename exceeds maximum length (255 characters).');
    err.status = 400;
    return next(err);
  }

  const category = req.body.category;
  const uploadStartTime = Date.now();

  if (!file) {
    const err = new Error('Missing file payload.');
    err.status = 400;
    return next(err);
  }
  if (!category || typeof category !== 'string' || !category.trim()) {
    const err = new Error('Missing or invalid category parameter.');
    err.status = 400;
    return next(err);
  }

  logger.uploadLog(`Upload initiated: ${file.originalname}`, { eventId: 'UPLOAD_STARTED', size: file.size, mimetype: file.mimetype, category });

  const tempFile = tmp.fileSync({ postfix: path.extname(file.originalname) });
  fs.writeFileSync(tempFile.name, file.buffer);

  try {
    const db = await connectToDB();
    const categoriesList = await getCachedCategories();
    const categoryDoc = categoriesList.find(c => c.key === category.toLowerCase());
    const resolvedCategory = categoryDoc ? categoryDoc.key : category;

    const docPrep = await DocumentService.prepareDocumentUpload({
      filename: file.originalname,
      category: resolvedCategory,
      fileBuffer: file.buffer
    });
    const documentId = docPrep.documentId;

    logger.uploadLog('Validation passed', { eventId: 'VALIDATION_PASSED', documentId, resolvedCategory });

    // Duplicate Ingestion Guard Checks
    const dupStartTime = Date.now();
    let dupResult;
    try {
      dupResult = await DuplicateDetectionService.detectDuplicate({
        fileBuffer: file.buffer,
        filename: file.originalname,
        category: resolvedCategory,
        tempPath: tempFile.name,
        documentId
      });
    } catch (dupErr) {
      tempFile.removeCallback();
      logger.error(`Duplicate detection failed: ${dupErr.message}`, dupErr);
      const err = new Error(dupErr.message || 'Document extraction failed during pre-ingestion checks.');
      err.status = dupErr.status || 422;
      return next(err);
    }

    const { decision: dupDecision, fullTextVector, chunks } = dupResult;
    const duplicateDetectionLatency = Date.now() - dupStartTime;
    const dupEventId = dupDecision.duplicateStatus === 'CHECK_FAILED' ? 'DUPLICATE_DETECTION_CHECK_FAILED' : 'DUPLICATE_DETECTION_COMPLETED';
    logger.uploadLog(`Duplicate detection complete`, { eventId: dupEventId, duplicateStatus: dupDecision.duplicateStatus, latencyMs: duplicateDetectionLatency });

    if (dupDecision.duplicateStatus === 'EXACT_DUPLICATE') {
      tempFile.removeCallback();
      const err = new Error(dupDecision.duplicateReason || 'Exact duplicate document ingestion blocked.');
      err.status = 409;
      return next(err);
    }

    // Enqueue contradiction check as an async background job instead of blocking
    const contradictionJobStartTime = Date.now();
    await db.collection('contradiction_jobs').insertOne({
      documentId: docPrep.documentId,
      filename: file.originalname,
      category: resolvedCategory,
      fullTextVector,
      chunks,
      status: 'pending',
      retryCount: 0,
      createdAt: new Date(),
      processingStartedAt: null,
      completedAt: null
    });
    const contradictionEnqueueLatency = Date.now() - contradictionJobStartTime;
    logger.uploadLog('Contradiction check enqueued', { eventId: 'CONTRADICTION_JOB_ENQUEUED', latencyMs: contradictionEnqueueLatency });

    // Upload to Object Storage (MinIO)
    const storageStartTime = Date.now();
    const storageResult = await storage.upload({
      buffer: file.buffer,
      filename: file.originalname,
      mimetype: file.mimetype,
      category: resolvedCategory
    });
    const minioUploadLatency = Date.now() - storageStartTime;
    logger.uploadLog('Stored in MinIO', { eventId: 'MINIO_UPLOAD_COMPLETED', storageKey: storageResult.storageKey, latencyMs: minioUploadLatency });

    // Call Embedding Service (gRPC) to index
    logger.uploadLog('Embedding started', { eventId: 'EMBEDDING_STARTED' });
    const embeddingStartTime = Date.now();
    
    handleUpload({
      temp_path: tempFile.name,
      category: resolvedCategory,
      original_name: `${file.originalname}::${docPrep.documentId}`,
      userId: req.user ? req.user.id : null
    }, async (err, response) => {
      tempFile.removeCallback();
      const embeddingLatency = Date.now() - embeddingStartTime;

      if (err || !response || response.getStatus() !== 'completed') {
        const failureReason = err ? err.message : (response ? response.getMessage() : 'Embedding processing failed');
        logger.error(`Embedding service failure: ${failureReason}`, { eventId: 'UPLOAD_FAILED', status: response ? response.getStatus() : 'grpc_error' });
        const uploadErr = new Error(failureReason || 'Document processing failed — no extractable text found.');
        uploadErr.status = 422;
        return next(uploadErr);
      }

      logger.uploadLog('Embedding completed', { eventId: 'EMBEDDING_COMPLETED', latencyMs: embeddingLatency, status: response.getStatus() });

      logger.uploadLog('Pinecone upsert completed');
      
      const tempDoc = {
        documentId: docPrep.documentId,
        filename: file.originalname,
        category: resolvedCategory,
        status: 'active',
        uploadedAt: new Date(),
        lastReviewed: null,
        duplicateStatus: dupDecision.duplicateStatus,
        contradictionStatus: 'PENDING'
      };
      const trustResult = TrustScoreService.calculateTrustScore(tempDoc);

      const finalDoc = await DocumentService.saveDocumentMetadata({
        documentId: docPrep.documentId,
        filename: file.originalname,
        category: resolvedCategory,
        source: 'upload',
        uploadedBy: req.user?.id || null,
        version: docPrep.version,
        hash: docPrep.hash,
        status: 'active',
        effectiveDate: new Date(),
        supersedes: docPrep.supersedes || null,
        duplicateStatus: dupDecision.duplicateStatus,
        duplicateScore: dupDecision.duplicateScore,
        duplicateOf: dupDecision.duplicateOf,
        duplicateReason: dupDecision.duplicateReason,
        duplicateDetectedAt: new Date(),
        contradictionStatus: 'PENDING',
        contradictionCount: 0,
        contradictionConfidence: 0,
        contradictionDetails: [],
        lastContradictionScan: null,
        trustScore: trustResult.trustScore,
        trustBreakdown: trustResult.breakdown,
        lastTrustCalculation: trustResult.lastCalculated
      });
      logger.uploadLog('Metadata saved', { eventId: 'METADATA_SAVED', trustScore: trustResult.trustScore });

      await db.collection('resource_files').insertOne({
        filename: file.originalname,
        originalFilename: file.originalname,
        storageKey: storageResult.storageKey,
        storageProvider: storageResult.provider,
        bucket: storageResult.bucket,
        contentType: file.mimetype,
        fileSize: file.buffer.length,
        uploadedAt: new Date(),
        category: resolvedCategory,
        uploader: req.user?.id || null,
        embeddingStatus: response.getStatus() || 'unknown',
        embeddingMessage: response.getMessage() || null,
      });

      const totalLatency = Date.now() - uploadStartTime;
      logger.uploadLog('Upload finished', { eventId: 'UPLOAD_COMPLETED', totalLatencyMs: totalLatency, duplicateDetectionLatency, contradictionEnqueueLatency, minioUploadLatency, embeddingLatency });

      res.success({
        status: "completed",
        storageKey: storageResult.storageKey,
        storageProvider: storageResult.provider,
        category: resolvedCategory,
        embeddingStatus: response.getStatus(),
        embeddingMessage: response.getMessage(),
        document: finalDoc,
        duplicateWarning: dupDecision.duplicateStatus !== 'UNIQUE' ? dupDecision.duplicateReason : null,
        contradictionWarning: 'Contradiction check queued — results will update automatically.'
      });
    });

  } catch (err) {
    tempFile.removeCallback();
    next(err);
  }
});

module.exports = router;
