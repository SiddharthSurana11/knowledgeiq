const { getDB } = require('../utils/mongoClient.js');

class DashboardService {
  static async getDashboardData() {
    const db = getDB();

    // 1. Fetch categories
    const categoriesList = await db.collection('categories').find({}).toArray();
    const categoriesCount = categoriesList.length;

    // 2. Fetch all document metadata
    const docs = await db.collection('documents').find({}).toArray();
    const totalDocs = docs.length;

    const activeDocs = docs.filter(d => d.status === 'active').length;
    const archivedDocs = docs.filter(d => d.status === 'archived').length;

    const sumTrust = docs.reduce((acc, curr) => acc + (curr.trustScore || 0), 0);
    const avgTrustScore = totalDocs > 0 ? Math.round(sumTrust / totalDocs) : 100;

    const pendingReviewDocs = docs.filter(d => !d.lastReviewed).length;
    const duplicateDocs = docs.filter(d => d.duplicateStatus && d.duplicateStatus !== 'UNIQUE').length;
    const contradictoryDocs = docs.filter(d => d.contradictionStatus && ['CONTRADICTION', 'POSSIBLE_CONTRADICTION'].includes(d.contradictionStatus)).length;

    // Calculate reviewed this month (calendar month)
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const reviewedThisMonth = docs.filter(d => d.lastReviewed && new Date(d.lastReviewed) >= startOfMonth).length;

    // 3. Trust Score Distribution Bands
    const distribution = {
      '0–20': 0,
      '21–40': 0,
      '41–60': 0,
      '61–80': 0,
      '81–100': 0
    };
    docs.forEach(d => {
      const score = d.trustScore !== undefined ? d.trustScore : 0;
      if (score <= 20) distribution['0–20']++;
      else if (score <= 40) distribution['21–40']++;
      else if (score <= 60) distribution['41–60']++;
      else if (score <= 80) distribution['61–80']++;
      else distribution['81–100']++;
    });

    // 4. Category Analytics
    const categoryAnalytics = categoriesList.map(cat => {
      const catKey = cat.key.toLowerCase();
      const catDocs = docs.filter(d => d.category === catKey);
      const catTotal = catDocs.length;
      const catSumTrust = catDocs.reduce((acc, curr) => acc + (curr.trustScore || 0), 0);
      const catAvgTrust = catTotal > 0 ? Math.round(catSumTrust / catTotal) : 100;
      const catDuplicates = catDocs.filter(d => d.duplicateStatus && d.duplicateStatus !== 'UNIQUE').length;
      const catContradictions = catDocs.filter(d => d.contradictionStatus && ['CONTRADICTION', 'POSSIBLE_CONTRADICTION'].includes(d.contradictionStatus)).length;
      const catPendingReview = catDocs.filter(d => !d.lastReviewed).length;

      let lastUploadDate = null;
      if (catTotal > 0) {
        const dates = catDocs.map(d => d.uploadedAt ? new Date(d.uploadedAt).getTime() : 0);
        lastUploadDate = new Date(Math.max(...dates));
      }

      return {
        categoryName: cat.name || cat.key,
        totalDocuments: catTotal,
        averageTrustScore: catAvgTrust,
        duplicates: catDuplicates,
        contradictions: catContradictions,
        pendingReview: catPendingReview,
        lastUploadDate
      };
    });

    // 5. Recent Activity (Latest 10 uploads)
    const recentActivity = [...docs]
      .sort((a, b) => new Date(b.uploadedAt || 0) - new Date(a.uploadedAt || 0))
      .slice(0, 10)
      .map(d => ({
        filename: d.filename,
        category: d.category,
        uploadedBy: d.uploadedBy || 'system',
        uploadedAt: d.uploadedAt,
        trustScore: d.trustScore !== undefined ? d.trustScore : 100,
        status: d.status || 'active'
      }));

    // 6. Review Queue (needs review status, contradictions, or low trust scores)
    const reviewQueue = docs
      .filter(d => d.status === 'pending_review' || (d.contradictionStatus && d.contradictionStatus !== 'NO_CONTRADICTION') || (d.trustScore !== undefined && d.trustScore < 70))
      .map(d => {
        const reasons = [];
        if (d.status === 'pending_review') reasons.push('Status: Pending Review');
        if (d.contradictionStatus && d.contradictionStatus !== 'NO_CONTRADICTION') reasons.push(`Factual Conflict: ${d.contradictionStatus}`);
        if (d.trustScore !== undefined && d.trustScore < 70) reasons.push('Low Trust Score (<70)');

        return {
          filename: d.filename,
          category: d.category,
          reason: reasons.join(', '),
          trustScore: d.trustScore !== undefined ? d.trustScore : 100,
          lastReviewed: d.lastReviewed || null
        };
      });

    // 7. Top Healthy Documents (Top 10 highest trust score)
    const topHealthy = [...docs]
      .sort((a, b) => (b.trustScore || 0) - (a.trustScore || 0))
      .slice(0, 10)
      .map(d => ({
        filename: d.filename,
        trustScore: d.trustScore !== undefined ? d.trustScore : 100
      }));

    // 8. Highest Risk Documents (Top 10 lowest trust score)
    const highestRisk = [...docs]
      .sort((a, b) => (a.trustScore || 0) - (b.trustScore || 0))
      .slice(0, 10)
      .map(d => ({
        filename: d.filename,
        trustScore: d.trustScore !== undefined ? d.trustScore : 100
      }));

    // 9. Duplicate Overview grouped
    const duplicatesGrouped = {
      EXACT_DUPLICATE: docs.filter(d => d.duplicateStatus === 'EXACT_DUPLICATE').map(d => ({ filename: d.filename, category: d.category, score: d.duplicateScore })),
      NEAR_DUPLICATE: docs.filter(d => d.duplicateStatus === 'NEAR_DUPLICATE').map(d => ({ filename: d.filename, category: d.category, score: d.duplicateScore })),
      PARTIAL_DUPLICATE: docs.filter(d => d.duplicateStatus === 'PARTIAL_DUPLICATE').map(d => ({ filename: d.filename, category: d.category, score: d.duplicateScore }))
    };

    // 10. Contradiction Overview grouped
    const contradictionsGrouped = {
      CONTRADICTION: docs.filter(d => d.contradictionStatus === 'CONTRADICTION').map(d => ({ filename: d.filename, category: d.category })),
      POSSIBLE_CONTRADICTION: docs.filter(d => d.contradictionStatus === 'POSSIBLE_CONTRADICTION').map(d => ({ filename: d.filename, category: d.category })),
      NO_CONTRADICTION: docs.filter(d => !d.contradictionStatus || d.contradictionStatus === 'NO_CONTRADICTION' || d.contradictionStatus === 'PENDING').map(d => ({ filename: d.filename, category: d.category }))
    };

    return {
      summary: {
        totalDocuments: totalDocs,
        activeDocuments: activeDocs,
        archivedDocuments: archivedDocs,
        categories: categoriesCount,
        averageTrustScore: avgTrustScore,
        pendingReview: pendingReviewDocs,
        duplicates: duplicateDocs,
        contradictions: contradictoryDocs,
        reviewedThisMonth
      },
      healthDistribution: distribution,
      categoryAnalytics,
      recentActivity,
      reviewQueue,
      topHealthy,
      highestRisk,
      duplicatesGrouped,
      contradictionsGrouped
    };
  }
}

module.exports = DashboardService;
