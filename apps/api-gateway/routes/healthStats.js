const express = require('express');
const router = express.Router();
const { getDB } = require('../utils/mongoClient');
const { config } = require('../config');

/**
 * GET /api/health/stats
 * MongoDB aggregation-powered health statistics.
 * Two separate aggregate() calls: one on `documents`, one on `contradiction_jobs`.
 */
router.get('/stats', async (req, res, next) => {
  try {
    const db = getDB();
    const staleThresholdDays = config.governance.staleThresholdDays;
    const staleDate = new Date(Date.now() - staleThresholdDays * 24 * 60 * 60 * 1000);

    // ── Aggregation 1: documents collection ────────────────────────────
    const [docAgg] = await db.collection('documents').aggregate([
      {
        $facet: {
          // Trust score global stats
          trustGlobal: [
            {
              $group: {
                _id: null,
                avg: { $avg: { $ifNull: ['$trustScore', 0] } },
                min: { $min: { $ifNull: ['$trustScore', 0] } },
                max: { $max: { $ifNull: ['$trustScore', 0] } },
                total: { $sum: 1 }
              }
            }
          ],

          // Trust score bucketed distribution (0-40, 40-70, 70-100)
          trustBuckets: [
            {
              $bucket: {
                groupBy: { $ifNull: ['$trustScore', 0] },
                boundaries: [0, 40, 70, 101],
                default: 'unknown',
                output: { count: { $sum: 1 } }
              }
            }
          ],

          // Per-category breakdown
          categoryBreakdown: [
            {
              $group: {
                _id: '$category',
                totalDocs: { $sum: 1 },
                avgTrust: { $avg: { $ifNull: ['$trustScore', 0] } },
                minTrust: { $min: { $ifNull: ['$trustScore', 0] } },
                maxTrust: { $max: { $ifNull: ['$trustScore', 0] } },
                contradictions: {
                  $sum: {
                    $cond: [
                      { $in: ['$contradictionStatus', ['CONTRADICTION', 'POSSIBLE_CONTRADICTION']] },
                      1, 0
                    ]
                  }
                },
                nearDuplicates: {
                  $sum: { $cond: [{ $eq: ['$duplicateStatus', 'NEAR_DUPLICATE'] }, 1, 0] }
                },
                partialDuplicates: {
                  $sum: { $cond: [{ $eq: ['$duplicateStatus', 'PARTIAL_DUPLICATE'] }, 1, 0] }
                },
                superseded: {
                  $sum: { $cond: [{ $eq: ['$status', 'superseded'] }, 1, 0] }
                },
                stale: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          { $ne: ['$status', 'superseded'] },
                          { $lt: [{ $ifNull: ['$effectiveDate', '$uploadedAt'] }, staleDate] }
                        ]
                      },
                      1, 0
                    ]
                  }
                }
              }
            },
            { $sort: { _id: 1 } }
          ],

          // Global duplicate counts
          duplicateStats: [
            {
              $group: {
                _id: null,
                nearDuplicates: {
                  $sum: { $cond: [{ $eq: ['$duplicateStatus', 'NEAR_DUPLICATE'] }, 1, 0] }
                },
                partialDuplicates: {
                  $sum: { $cond: [{ $eq: ['$duplicateStatus', 'PARTIAL_DUPLICATE'] }, 1, 0] }
                }
              }
            }
          ],

          // Global freshness stats
          freshnessStats: [
            {
              $group: {
                _id: null,
                supersededCount: {
                  $sum: { $cond: [{ $eq: ['$status', 'superseded'] }, 1, 0] }
                },
                staleCount: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          { $ne: ['$status', 'superseded'] },
                          { $lt: [{ $ifNull: ['$effectiveDate', '$uploadedAt'] }, staleDate] }
                        ]
                      },
                      1, 0
                    ]
                  }
                }
              }
            }
          ]
        }
      }
    ]).toArray();

    // ── Aggregation 2: contradiction_jobs collection ───────────────────
    const contradictionPipeline = await db.collection('contradiction_jobs').aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]).toArray();

    // ── Shape response ─────────────────────────────────────────────────
    const trustGlobal = docAgg.trustGlobal[0] || { avg: 0, min: 0, max: 0, total: 0 };
    const duplicateStats = docAgg.duplicateStats[0] || { nearDuplicates: 0, partialDuplicates: 0 };
    const freshnessStats = docAgg.freshnessStats[0] || { supersededCount: 0, staleCount: 0 };

    // Map trust buckets to labeled ranges
    const trustDistribution = { '0-40': 0, '40-70': 0, '70-100': 0 };
    for (const bucket of docAgg.trustBuckets) {
      if (bucket._id === 0) trustDistribution['0-40'] = bucket.count;
      else if (bucket._id === 40) trustDistribution['40-70'] = bucket.count;
      else if (bucket._id === 70) trustDistribution['70-100'] = bucket.count;
    }

    // Map contradiction job statuses
    const contradictionJobs = { pending: 0, processing: 0, completed: 0, failed: 0 };
    for (const row of contradictionPipeline) {
      if (contradictionJobs.hasOwnProperty(row._id)) {
        contradictionJobs[row._id] = row.count;
      }
    }

    // Shape category breakdown
    const categoryBreakdown = docAgg.categoryBreakdown.map(cat => ({
      category: cat._id || 'uncategorized',
      totalDocs: cat.totalDocs,
      avgTrust: Math.round(cat.avgTrust),
      minTrust: cat.minTrust,
      maxTrust: cat.maxTrust,
      contradictions: cat.contradictions,
      nearDuplicates: cat.nearDuplicates,
      partialDuplicates: cat.partialDuplicates,
      superseded: cat.superseded,
      stale: cat.stale
    }));

    res.success({
      trust: {
        average: Math.round(trustGlobal.avg),
        min: trustGlobal.min,
        max: trustGlobal.max,
        totalDocuments: trustGlobal.total,
        distribution: trustDistribution
      },
      contradictionJobs,
      duplicates: {
        nearDuplicates: duplicateStats.nearDuplicates,
        partialDuplicates: duplicateStats.partialDuplicates,
        total: duplicateStats.nearDuplicates + duplicateStats.partialDuplicates
      },
      freshness: {
        supersededCount: freshnessStats.supersededCount,
        staleCount: freshnessStats.staleCount,
        staleThresholdDays
      },
      categoryBreakdown
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/health/issues
 * Flat list of actionable items for admin: contradictions, duplicates, stale docs.
 */
router.get('/issues', async (req, res, next) => {
  try {
    const db = getDB();
    const staleThresholdDays = config.governance.staleThresholdDays;
    const staleDate = new Date(Date.now() - staleThresholdDays * 24 * 60 * 60 * 1000);

    // Query documents matching any issue condition
    const issueDocs = await db.collection('documents').find({
      status: { $ne: 'superseded' },
      $or: [
        { contradictionStatus: { $in: ['CONTRADICTION', 'POSSIBLE_CONTRADICTION'] } },
        { duplicateStatus: { $in: ['NEAR_DUPLICATE', 'PARTIAL_DUPLICATE'] } },
        { effectiveDate: { $lt: staleDate } },
        // Fallback for docs without effectiveDate — use uploadedAt
        { effectiveDate: { $exists: false }, uploadedAt: { $lt: staleDate } }
      ]
    }, {
      projection: {
        _id: 0,
        documentId: 1,
        filename: 1,
        category: 1,
        contradictionStatus: 1,
        duplicateStatus: 1,
        effectiveDate: 1,
        uploadedAt: 1,
        lastContradictionScan: 1,
        duplicateDetectedAt: 1
      }
    }).toArray();

    // Map each document to one or more issue items
    const issues = [];
    for (const doc of issueDocs) {
      const docEffective = doc.effectiveDate || doc.uploadedAt;

      if (doc.contradictionStatus === 'CONTRADICTION' || doc.contradictionStatus === 'POSSIBLE_CONTRADICTION') {
        issues.push({
          documentId: doc.documentId,
          filename: doc.filename,
          category: doc.category,
          issueType: 'CONTRADICTION',
          severity: doc.contradictionStatus === 'CONTRADICTION' ? 'high' : 'medium',
          timestamp: doc.lastContradictionScan || doc.uploadedAt
        });
      }

      if (doc.duplicateStatus === 'NEAR_DUPLICATE' || doc.duplicateStatus === 'PARTIAL_DUPLICATE') {
        issues.push({
          documentId: doc.documentId,
          filename: doc.filename,
          category: doc.category,
          issueType: 'DUPLICATE',
          severity: doc.duplicateStatus === 'NEAR_DUPLICATE' ? 'high' : 'medium',
          timestamp: doc.duplicateDetectedAt || doc.uploadedAt
        });
      }

      if (docEffective && docEffective < staleDate) {
        issues.push({
          documentId: doc.documentId,
          filename: doc.filename,
          category: doc.category,
          issueType: 'STALE',
          severity: 'low',
          timestamp: docEffective
        });
      }
    }

    // Sort by severity (high first), then by timestamp (newest first)
    const severityOrder = { high: 0, medium: 1, low: 2 };
    issues.sort((a, b) => {
      const sevDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (sevDiff !== 0) return sevDiff;
      return new Date(b.timestamp) - new Date(a.timestamp);
    });

    res.success({
      totalIssues: issues.length,
      issues
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
