const { getDB } = require('../utils/mongoClient.js');

class AnalyticsService {
  static async getAnalyticsData() {
    const db = getDB();
    const now = new Date();

    // 1. FEATURE 1: Search Analytics
    const searchStats = await db.collection('search_logs').aggregate([
      {
        $group: {
          _id: null,
          avgResponseTime: { $avg: "$responseTime" },
          avgPineconeLatency: { $avg: "$pineconeLatency" },
          avgLlmLatency: { $avg: "$llmLatency" },
          avgTotalTokens: { $avg: "$telemetry.total_tokens" },
          total: { $sum: 1 },
          successful: { $sum: { $cond: [{ $gt: ["$resultsReturned", 0] }, 1, 0] } }
        }
      }
    ]).toArray();

    const searchMetrics = searchStats[0] || { avgResponseTime: 0, avgPineconeLatency: 0, avgLlmLatency: 0, avgTotalTokens: 0, total: 0, successful: 0 };
    const searchSuccessRate = searchMetrics.total > 0 ? Math.round((searchMetrics.successful / searchMetrics.total) * 100) : 100;

    // 2. FEATURE 4: Popular Searches (Top 20) — Grouped by raw user query
    const popularSearches = await db.collection('search_logs').aggregate([
      { $group: { _id: { $ifNull: ["$rawQuery", "$query"] }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 20 },
      { $project: { query: "$_id", count: 1, _id: 0 } }
    ]).toArray();

    // 3. FEATURE 5: Failed Searches (Top failed) — Grouped by raw user query
    const failedSearches = await db.collection('search_logs').aggregate([
      { $match: { resultsReturned: 0 } },
      { $group: { _id: { $ifNull: ["$rawQuery", "$query"] }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 20 },
      { $project: { query: "$_id", count: 1, _id: 0 } }
    ]).toArray();

    // 4. FEATURE 6: Category Usage - Searches
    const categorySearchStats = await db.collection('search_logs').aggregate([
      { $match: { category: { $ne: "all" } } },
      { $group: { _id: "$category", count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]).toArray();

    const mostSearchedCategory = categorySearchStats.length > 0 ? categorySearchStats[0]._id : '—';
    const leastSearchedCategory = categorySearchStats.length > 0 ? categorySearchStats[categorySearchStats.length - 1]._id : '—';

    // 5. Fetch all documents to compute Upload, Growth, Trends and Category metadata stats
    const docs = await db.collection('documents').find({}).toArray();
    const totalDocs = docs.length;

    // FEATURE 2: Upload Analytics details
    const activeContributors = new Set(docs.map(d => d.uploadedBy).filter(Boolean)).size || 1;
    const sumTrust = docs.reduce((acc, curr) => acc + (curr.trustScore || 0), 0);
    const avgTrustScore = totalDocs > 0 ? Math.round(sumTrust / totalDocs) : 100;

    const exactDuplicates = docs.filter(d => d.duplicateStatus === 'EXACT_DUPLICATE').length;
    const partialDuplicates = docs.filter(d => d.duplicateStatus === 'PARTIAL_DUPLICATE').length;
    const duplicateUploadRate = totalDocs > 0 ? Math.round(((exactDuplicates + partialDuplicates) / totalDocs) * 100) : 0;

    // Uploads per category
    const categoryCounts = {};
    const categoryTrustSums = {};
    docs.forEach(d => {
      const cat = d.category || 'other';
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
      categoryTrustSums[cat] = (categoryTrustSums[cat] || 0) + (d.trustScore || 0);
    });

    const categoryStatsList = Object.keys(categoryCounts).map(cat => ({
      category: cat,
      totalDocs: categoryCounts[cat],
      avgTrustScore: Math.round(categoryTrustSums[cat] / categoryCounts[cat])
    }));

    // Find category usages
    let mostUploadedCategory = '—';
    let highestTrustCategory = '—';
    let lowestTrustCategory = '—';

    if (categoryStatsList.length > 0) {
      const sortedByUpload = [...categoryStatsList].sort((a, b) => b.totalDocs - a.totalDocs);
      mostUploadedCategory = sortedByUpload[0].category;

      const sortedByTrust = [...categoryStatsList].sort((a, b) => b.avgTrustScore - a.avgTrustScore);
      highestTrustCategory = sortedByTrust[0].category;
      lowestTrustCategory = sortedByTrust[sortedByTrust.length - 1].category;
    }

    // FEATURE 3: Knowledge Growth (Last 24h, 7d, 30d)
    const msIn24h = 24 * 3600 * 1000;
    const msIn7d = 7 * msIn24h;
    const msIn30d = 30 * msIn24h;

    const added24h = docs.filter(d => d.uploadedAt && (now - new Date(d.uploadedAt)) <= msIn24h).length;
    const added7d = docs.filter(d => d.uploadedAt && (now - new Date(d.uploadedAt)) <= msIn7d).length;
    const added30d = docs.filter(d => d.uploadedAt && (now - new Date(d.uploadedAt)) <= msIn30d).length;

    // Category growth in last 30 days
    const categoryGrowth = {};
    docs.filter(d => d.uploadedAt && (now - new Date(d.uploadedAt)) <= msIn30d).forEach(d => {
      const cat = d.category || 'other';
      categoryGrowth[cat] = (categoryGrowth[cat] || 0) + 1;
    });

    // FEATURE 7: Knowledge Trends (Weekly over 12 weeks & Monthly over 12 months)
    const uploadsPerDay = {};
    const uploadsPerMonth = {};
    const weeklyTrends = [];
    const monthlyTrends = [];

    // Daily & Monthly grouping buckets
    docs.forEach(d => {
      if (!d.uploadedAt) return;
      const dObj = new Date(d.uploadedAt);
      
      // Daily (for last 30 days)
      const dayKey = dObj.toISOString().slice(0, 10);
      uploadsPerDay[dayKey] = (uploadsPerDay[dayKey] || 0) + 1;

      // Monthly
      const monthKey = dObj.toISOString().slice(0, 7); // YYYY-MM
      uploadsPerMonth[monthKey] = (uploadsPerMonth[monthKey] || 0) + 1;
    });

    // Build Monthly Trend Data for the last 12 months
    for (let i = 11; i >= 0; i--) {
      const targetDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = targetDate.toISOString().slice(0, 7);
      const label = targetDate.toLocaleString('default', { month: 'short', year: '2-digit' });
      monthlyTrends.push({
        label,
        key,
        count: uploadsPerMonth[key] || 0
      });
    }

    // Build Weekly Trend Data for the last 12 weeks
    for (let i = 11; i >= 0; i--) {
      const targetDate = new Date(now.getTime() - i * 7 * msIn24h);
      // Calculate start and end of week (Sunday to Saturday)
      const startOfWeek = new Date(targetDate.setDate(targetDate.getDate() - targetDate.getDay()));
      const endOfWeek = new Date(startOfWeek.getTime() + 6 * msIn24h);
      
      const startLabel = startOfWeek.toLocaleDateString('default', { month: 'short', day: 'numeric' });
      const endLabel = endOfWeek.toLocaleDateString('default', { month: 'short', day: 'numeric' });
      const label = `${startLabel} - ${endLabel}`;

      let weeklyCount = 0;
      docs.forEach(d => {
        if (!d.uploadedAt) return;
        const uTime = new Date(d.uploadedAt).getTime();
        if (uTime >= startOfWeek.getTime() && uTime <= endOfWeek.getTime() + 24*3600*1000) {
          weeklyCount++;
        }
      });

      weeklyTrends.push({
        label,
        count: weeklyCount
      });
    }

    // Build Daily upload lists for last 30 days
    const dailyUploadsList = [];
    for (let i = 29; i >= 0; i--) {
      const targetDate = new Date(now.getTime() - i * msIn24h);
      const key = targetDate.toISOString().slice(0, 10);
      const label = targetDate.toLocaleDateString('default', { month: 'short', day: 'numeric' });
      dailyUploadsList.push({
        label,
        key,
        count: uploadsPerDay[key] || 0
      });
    }

    return {
      searchAnalytics: {
        totalQueries: searchMetrics.total,
        averageResponseTimeMs: Math.round(searchMetrics.avgResponseTime || 0),
        averagePineconeLatencyMs: Math.round(searchMetrics.avgPineconeLatency || 0),
        averageLlmLatencyMs: Math.round(searchMetrics.avgLlmLatency || 0),
        averageTotalTokens: Math.round(searchMetrics.avgTotalTokens || 0),
        successRate: searchSuccessRate
      },
      uploadAnalytics: {
        uploadsPerDay: dailyUploadsList,
        uploadsPerCategory: categoryStatsList,
        uploadsPerMonth: monthlyTrends,
        activeContributors,
        averageTrustScore: avgTrustScore,
        duplicateUploadRate: duplicateUploadRate
      },
      knowledgeGrowth: {
        added24h,
        added7d,
        added30d,
        categoryGrowth
      },
      popularSearches,
      failedSearches,
      categoryUsage: {
        mostSearchedCategory,
        leastSearchedCategory,
        mostUploadedCategory,
        highestTrustCategory,
        lowestTrustCategory
      },
      knowledgeTrends: {
        weeklyTrends,
        monthlyTrends
      }
    };
  }
}

module.exports = AnalyticsService;
