const express = require('express');
const AnalyticsService = require('../services/analyticsService.js');

const router = express.Router();

// GET /api/analytics - Exposes dynamic usage, search, and knowledge trend statistics
router.get('/', async (req, res, next) => {
  try {
    const data = await AnalyticsService.getAnalyticsData();
    res.success(data);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
