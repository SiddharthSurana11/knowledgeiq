const express = require('express');
const { getDB } = require('../utils/mongoClient.js');
const { ObjectId } = require('mongodb');
const { validate, schemas } = require('../middlewares/validation');

const router = express.Router();

// POST /feedback - Insert feedback
router.post('/', validate(schemas.feedbackSchema, 'body'), async (req, res, next) => {
  const { feedback, question } = req.body;

  try {
    const db = getDB();
    const feedbackEntry = {
      timestamp: new Date().toISOString(),
      reviewed: false,
      ...req.body,
    };
    const result = await db.collection('feedback').insertOne(feedbackEntry);
    res.success({ message: 'Feedback saved to MongoDB.', id: result.insertedId });
  } catch (err) {
    next(err);
  }
});

// PATCH /feedback/:id/reviewed - Mark as reviewed by MongoDB ObjectId
router.patch('/:id/reviewed', validate(schemas.objectIdSchema, 'params'), async (req, res, next) => {
  try {
    const db = getDB();
    const id = req.params.id;

    const result = await db.collection('feedback').updateOne(
      { _id: new ObjectId(id) },
      { $set: { reviewed: true } }
    );
    if (result.matchedCount === 0) {
      const err = new Error('Feedback record not found.');
      err.status = 404;
      return next(err);
    }

    res.success({ message: 'Marked as reviewed' });
  } catch (err) {
    next(err);
  }
});

// GET /feedback/admin-feedback - Fetch all feedbacks (admin)
router.get('/admin-feedback', async (req, res, next) => {
  try {
    const db = getDB();
    const data = await db.collection('feedback').find().toArray();
    res.success(data);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
