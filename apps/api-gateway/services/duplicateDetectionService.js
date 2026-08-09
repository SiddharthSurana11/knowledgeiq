const { getDB } = require('../utils/mongoClient.js');
const { handleUpload } = require('../utils/embeddingClient.js');
const crypto = require('crypto');

class DuplicateDetectionService {
  static computeHash(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  static checkNearOrPartialDuplicate(tempPath, category, originalName) {
    return new Promise((resolve, reject) => {
      handleUpload({
        temp_path: tempPath,
        category: category + '|check',
        original_name: originalName
      }, (err, response) => {
        if (err) return reject(err);
        resolve(response);
      });
    });
  }

  static async detectDuplicate({ fileBuffer, filename, category, tempPath, documentId }) {
    const db = getDB();
    const hash = this.computeHash(fileBuffer);
    const normalizedCategory = category.toLowerCase();

    // ---- Level 1 Check: Exact Duplicate (SHA-256) ----
    const exactMatch = await db.collection('documents').findOne({
      hash: hash,
      category: normalizedCategory
    });

    if (exactMatch) {
      const decision = {
        duplicateStatus: 'EXACT_DUPLICATE',
        duplicateScore: 100,
        duplicateOf: exactMatch.documentId,
        duplicateReason: `This document has already been uploaded and indexed (${exactMatch.filename}).`
      };

      console.log(`[Duplicate Engine] documentId: ${documentId} | decision: ${decision.duplicateStatus} | score: ${decision.duplicateScore}`);
      return {
        decision,
        fullTextVector: [],
        chunks: []
      };
    }

    // ---- Level 2 & 3 Check: Near & Partial Duplicate (gRPC + Pinecone) ----
    try {
      const response = await this.checkNearOrPartialDuplicate(tempPath, normalizedCategory, filename);
      if (response.getStatus() === 'duplicate_report') {
        const report = JSON.parse(response.getMessage());

        // Resolve the documentId of the matched source file from filename and category
        let duplicateOfId = null;
        if (report.duplicate.duplicateOf) {
          const matchedDoc = await db.collection('documents').findOne({
            filename: report.duplicate.duplicateOf,
            category: normalizedCategory
          });
          if (matchedDoc) {
            duplicateOfId = matchedDoc.documentId;
          }
        }

        const decision = {
          duplicateStatus: report.duplicate.duplicateStatus,
          duplicateScore: report.duplicate.duplicateScore,
          duplicateOf: duplicateOfId,
          duplicateReason: report.duplicate.duplicateReason
        };

        console.log(`[Duplicate Engine] documentId: ${documentId} | decision: ${decision.duplicateStatus} | score: ${decision.duplicateScore}`);
        return {
          decision,
          fullTextVector: report.full_text_vector || [],
          chunks: report.chunks || []
        };
      } else if (response.getStatus() === 'failed') {
        const msg = response.getMessage() || 'Document text extraction failed.';
        const err = new Error(msg);
        err.isExtractionFailure = true;
        throw err;
      } else {
        throw new Error(`Invalid gRPC response status: ${response.getStatus()}`);
      }
    } catch (err) {
      if (err.isExtractionFailure) {
        // Explicit text extraction failure — must abort upload pipeline
        throw err;
      }
      console.error('⚠️ Semantic duplicate detection check unavailable:', err.message);
      // Fallback to CHECK_FAILED state if Pinecone/vector check fails at runtime
      const decision = {
        duplicateStatus: 'CHECK_FAILED',
        duplicateScore: 0,
        duplicateOf: null,
        duplicateReason: `Semantic duplicate check unavailable: ${err.message}`
      };
      return {
        decision,
        fullTextVector: [],
        chunks: []
      };
    }
  }
}

module.exports = DuplicateDetectionService;
