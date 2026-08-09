const { getDB } = require('../utils/mongoClient.js');
const { deleteVectorsByDocument } = require('../utils/pineconeClient.js');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const TrustScoreService = require('./trustScoreService.js');

class DocumentService {
  static computeHash(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  static async prepareDocumentUpload({ filename, category, fileBuffer }) {
    const db = getDB();
    const hash = this.computeHash(fileBuffer);
    const normalizedCategory = category.toLowerCase();

    // Query if the document already exists
    const existingDoc = await db.collection('documents').findOne({
      filename: filename,
      category: normalizedCategory
    });

    if (existingDoc) {
      // Syncing delete: Delete existing vectors from Pinecone to avoid orphans or duplicates
      try {
        await deleteVectorsByDocument(filename, normalizedCategory);
      } catch (err) {
        console.error(`⚠️ Failed to delete old vectors for ${filename} during sync:`, err.message);
      }

      // Mark the OLD document as superseded (keep its MongoDB record for audit trail)
      await db.collection('documents').updateOne(
        { documentId: existingDoc.documentId },
        { $set: { status: 'superseded' } }
      );

      // New document gets a fresh UUID; it supersedes the old one
      return {
        documentId: uuidv4(),
        version: existingDoc.version + 1,
        hash,
        isNew: false,
        supersedes: existingDoc.documentId
      };
    } else {
      return {
        documentId: uuidv4(),
        version: 1,
        hash,
        isNew: true,
        supersedes: null
      };
    }
  }

  static async saveDocumentMetadata({
    documentId,
    filename,
    category,
    source = 'upload',
    uploadedBy = null,
    version,
    hash,
    status = 'active',
    effectiveDate = null,
    supersedes = null,
    duplicateStatus = 'UNIQUE',
    duplicateScore = 0,
    duplicateOf = null,
    duplicateReason = null,
    duplicateDetectedAt = null,
    contradictionStatus = 'NO_CONTRADICTION',
    contradictionCount = 0,
    contradictionConfidence = 0,
    contradictionDetails = [],
    lastContradictionScan = null,
    trustScore = null,
    trustBreakdown = null,
    lastTrustCalculation = null
  }) {
    const db = getDB();
    const normalizedCategory = category.toLowerCase();

    // Dynamically calculate trust score if not pre-computed
    let finalTrustScore = trustScore;
    let finalTrustBreakdown = trustBreakdown;
    let finalLastTrustCalculation = lastTrustCalculation;

    if (finalTrustScore === null) {
      const existing = await db.collection('documents').findOne({ documentId });
      const tempDoc = {
        documentId,
        filename,
        category: normalizedCategory,
        status,
        uploadedAt: existing ? (existing.uploadedAt || new Date()) : new Date(),
        lastReviewed: existing ? existing.lastReviewed : null,
        duplicateStatus,
        contradictionStatus
      };
      const trustResult = TrustScoreService.calculateTrustScore(tempDoc);
      finalTrustScore = trustResult.trustScore;
      finalTrustBreakdown = trustResult.breakdown;
      finalLastTrustCalculation = trustResult.lastCalculated;
    }

    const docMetadata = {
      documentId,
      filename,
      category: normalizedCategory,
      source,
      uploadedBy,
      uploadedAt: new Date(),
      effectiveDate: effectiveDate || new Date(),
      supersedes,
      status,
      version,
      hash,
      duplicateStatus,
      duplicateScore,
      duplicateOf,
      duplicateReason,
      duplicateDetectedAt,
      contradictionStatus,
      contradictionCount,
      contradictionConfidence,
      contradictionDetails,
      lastContradictionScan,
      trustScore: finalTrustScore,
      trustBreakdown: finalTrustBreakdown,
      lastTrustCalculation: finalLastTrustCalculation
    };

    // For upserting metadata record:
    await db.collection('documents').updateOne(
      { documentId },
      {
        $setOnInsert: {
          lastReviewed: null,
          reviewedBy: null
        },
        $set: docMetadata
      },
      { upsert: true }
    );

    // Retrieve and return the updated document without _id
    return await db.collection('documents').findOne({ documentId }, { projection: { _id: 0 } });
  }

  static async getAllDocuments() {
    const db = getDB();
    // Exclude MongoDB internal _id in the returned array
    return await db.collection('documents').find({}, { projection: { _id: 0 } }).toArray();
  }

  static async getDocumentById(documentId) {
    const db = getDB();
    return await db.collection('documents').findOne({ documentId }, { projection: { _id: 0 } });
  }

  static async updateStatus(documentId, status) {
    const db = getDB();
    const doc = await db.collection('documents').findOne({ documentId });
    if (!doc) return null;

    const updatedDoc = { ...doc, status };
    const trustResult = TrustScoreService.calculateTrustScore(updatedDoc);

    // Perform update
    await db.collection('documents').updateOne(
      { documentId },
      {
        $set: {
          status,
          trustScore: trustResult.trustScore,
          trustBreakdown: trustResult.breakdown,
          lastTrustCalculation: trustResult.lastCalculated
        }
      }
    );
    // Return updated document without _id
    return await db.collection('documents').findOne({ documentId }, { projection: { _id: 0 } });
  }

  static async markReviewed(documentId, reviewedBy) {
    const db = getDB();
    const doc = await db.collection('documents').findOne({ documentId });
    if (!doc) return null;

    const lastReviewed = new Date();
    const updatedDoc = { ...doc, lastReviewed, reviewedBy };
    const trustResult = TrustScoreService.calculateTrustScore(updatedDoc);

    // Perform update
    await db.collection('documents').updateOne(
      { documentId },
      {
        $set: {
          lastReviewed,
          reviewedBy: reviewedBy || null,
          trustScore: trustResult.trustScore,
          trustBreakdown: trustResult.breakdown,
          lastTrustCalculation: trustResult.lastCalculated
        }
      }
    );
    // Return updated document without _id
    return await db.collection('documents').findOne({ documentId }, { projection: { _id: 0 } });
  }
}

module.exports = DocumentService;
