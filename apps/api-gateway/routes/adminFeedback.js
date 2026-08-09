const express = require('express');
const { getDB } = require('../utils/mongoClient.js');

const router = express.Router();

// GET all feedback for the admin panel
router.get('/', async (req, res, next) => {
  try {
    const db = getDB();
    const feedbacks = await db.collection('feedback').find().toArray();
    res.success(feedbacks);
  } catch (err) {
    next(err);
  }
});

// GET feedback by tag (for advanced admin search)
router.get('/tag/:tag', async (req, res, next) => {
  try {
    const db = getDB();
    const tag = req.params.tag;
    if (!tag) {
      const err = new Error('Tag parameter is required.');
      err.status = 400;
      return next(err);
    }
    const feedbacks = await db
      .collection('feedback')
      .find({ tags: { $in: [tag] } })
      .toArray();
    res.success(feedbacks);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
