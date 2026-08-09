/**
 * contradictionWorker.js — Background poller for async contradiction detection jobs.
 *
 * Polls the `contradiction_jobs` MongoDB collection every 10 seconds for pending jobs.
 * Runs the existing ContradictionDetectionService logic and updates document trust scores.
 * Includes stuck-job recovery: jobs stuck in 'processing' for >2 minutes are reset to 'pending'.
 */

const { getDB } = require('../utils/mongoClient');
const ContradictionDetectionService = require('../services/contradictionDetectionService');
const TrustScoreService = require('../services/trustScoreService');
const logger = require('../utils/logger');

const POLL_INTERVAL_MS = 10_000;  // 10 seconds
const STALE_PROCESSING_MS = 2 * 60 * 1000;  // 2 minutes
const MAX_RETRIES = 3;

async function pollContradictionJobs() {
  try {
    const db = getDB();

    // ── Stuck-job recovery ───────────────────────────────────────────────
    // Reset any jobs stuck in 'processing' for longer than 2 minutes
    const staleThreshold = new Date(Date.now() - STALE_PROCESSING_MS);
    const staleResult = await db.collection('contradiction_jobs').updateMany(
      {
        status: 'processing',
        processingStartedAt: { $lt: staleThreshold }
      },
      {
        $set: { status: 'pending', processingStartedAt: null },
        $inc: { retryCount: 1 }
      }
    );
    if (staleResult.modifiedCount > 0) {
      logger.warn(`[ContradictionWorker] Reset ${staleResult.modifiedCount} stale processing job(s) back to pending.`);
    }

    // ── Pick next pending job ────────────────────────────────────────────
    const job = await db.collection('contradiction_jobs').findOneAndUpdate(
      { status: 'pending', retryCount: { $lt: MAX_RETRIES } },
      {
        $set: {
          status: 'processing',
          processingStartedAt: new Date()
        }
      },
      { sort: { createdAt: 1 }, returnDocument: 'after' }
    );

    if (!job) return; // No pending jobs

    logger.info(`[ContradictionWorker] Processing job for documentId: ${job.documentId}`);

    try {
      // ── Run contradiction detection (same service, unchanged logic) ────
      const contradictionResult = await ContradictionDetectionService.detectContradictions({
        fullTextVector: job.fullTextVector,
        chunks: job.chunks,
        filename: job.filename,
        category: job.category,
        documentId: job.documentId
      });

      // ── Mark job completed ─────────────────────────────────────────────
      await db.collection('contradiction_jobs').updateOne(
        { _id: job._id },
        {
          $set: {
            status: 'completed',
            completedAt: new Date(),
            result: contradictionResult
          }
        }
      );

      // ── Update document with contradiction results + recalculate trust ─
      const doc = await db.collection('documents').findOne({ documentId: job.documentId });
      if (doc) {
        const updatedDoc = {
          ...doc,
          contradictionStatus: contradictionResult.contradictionStatus,
          contradictionCount: contradictionResult.contradictionCount,
          contradictionConfidence: contradictionResult.contradictionConfidence,
          contradictionDetails: contradictionResult.contradictionDetails,
          lastContradictionScan: contradictionResult.lastContradictionScan
        };
        const trustResult = TrustScoreService.calculateTrustScore(updatedDoc);

        await db.collection('documents').updateOne(
          { documentId: job.documentId },
          {
            $set: {
              contradictionStatus: contradictionResult.contradictionStatus,
              contradictionCount: contradictionResult.contradictionCount,
              contradictionConfidence: contradictionResult.contradictionConfidence,
              contradictionDetails: contradictionResult.contradictionDetails,
              lastContradictionScan: contradictionResult.lastContradictionScan,
              trustScore: trustResult.trustScore,
              trustBreakdown: trustResult.breakdown,
              lastTrustCalculation: trustResult.lastCalculated
            }
          }
        );

        logger.info(`[ContradictionWorker] Completed: documentId=${job.documentId}, status=${contradictionResult.contradictionStatus}, trustScore=${trustResult.trustScore}`);
      }

    } catch (processingErr) {
      // ── Handle failure ─────────────────────────────────────────────────
      const currentRetryCount = (job.retryCount || 0) + 1;

      if (currentRetryCount >= MAX_RETRIES) {
        await db.collection('contradiction_jobs').updateOne(
          { _id: job._id },
          {
            $set: {
              status: 'failed',
              failedAt: new Date(),
              lastError: processingErr.message
            },
            $inc: { retryCount: 1 }
          }
        );
        logger.error(`[ContradictionWorker] FAILED permanently after ${MAX_RETRIES} retries. documentId=${job.documentId}, error: ${processingErr.message}`);
      } else {
        // Reset to pending for retry
        await db.collection('contradiction_jobs').updateOne(
          { _id: job._id },
          {
            $set: {
              status: 'pending',
              processingStartedAt: null,
              lastError: processingErr.message
            },
            $inc: { retryCount: 1 }
          }
        );
        logger.warn(`[ContradictionWorker] Retry ${currentRetryCount}/${MAX_RETRIES} queued for documentId=${job.documentId}: ${processingErr.message}`);
      }
    }

  } catch (err) {
    const isTransientNet = err.message && (
      err.message.includes('ENOTFOUND') || 
      err.message.includes('ECONNRESET') || 
      err.message.includes('EAI_AGAIN') ||
      err.message.includes('ETIMEDOUT')
    );
    if (isTransientNet) {
      logger.warn(`[ContradictionWorker] Transient MongoDB connection drop during idle poll: ${err.message}. Retrying next tick.`);
    } else {
      logger.error(`[ContradictionWorker] Poll tick error: ${err.message}`);
    }
  }
}

function startContradictionWorker() {
  logger.info(`[ContradictionWorker] Started — polling every ${POLL_INTERVAL_MS / 1000}s`);
  setInterval(pollContradictionJobs, POLL_INTERVAL_MS);
}

module.exports = { startContradictionWorker };
