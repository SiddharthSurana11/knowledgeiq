const express = require('express');
const DashboardService = require('../services/dashboardService.js');

const router = express.Router();

// GET /api/dashboard - Returns aggregated governance dashboard statistics
router.get('/', async (req, res, next) => {
  try {
    const data = await DashboardService.getDashboardData();
    res.success(data);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
