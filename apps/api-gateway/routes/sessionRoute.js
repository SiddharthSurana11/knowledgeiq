const express = require('express');
const { getDB } = require('../utils/mongoClient.js');
const { ObjectId } = require('mongodb');
const { validate, schemas } = require('../middlewares/validation');

const router = express.Router();

// Helper to generate a clean 3-5 word title from prompt
function generatePredictiveTitle(userMessage) {
  if (!userMessage) return 'New Chat Session';
  const STOPWORDS = new Set(['what', 'is', 'are', 'how', 'does', 'do', 'tell', 'me', 'about', 'the', 'a', 'an', 'in', 'on', 'of', 'for', 'to', 'with', 'and', 'or', 'which', 'where', 'when', 'who', 'why', 'can', 'should', 'would', 'could']);
  
  let cleaned = userMessage.replace(/[^\w\s]/g, '').trim();
  let words = cleaned.split(/\s+/);
  let meaningful = words.filter(w => !STOPWORDS.has(w.toLowerCase()));
  
  let selected = meaningful.length >= 2 ? meaningful.slice(0, 4) : words.slice(0, 4);
  return selected.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

// GET all session previews (most recent first)
router.get('/', async (req, res, next) => {
  try {
    const db = getDB();
    const sessions = await db.collection('chat_sessions')
      .find({}, { projection: { name: 1, messages: 1, createdAt: 1 } })
      .sort({ createdAt: -1 })
      .toArray();

    const previews = sessions.map(session => ({
      id: session._id.toString(),
      name: session.name || null,
      createdAt: session.createdAt,
      messages: session.messages?.slice(-1) || [],
    }));

    res.success(previews);
  } catch (err) {
    next(err);
  }
});

// POST new session
router.post('/', async (req, res, next) => {
  try {
    const db = getDB();
    const newSession = {
      name: '',
      createdAt: new Date().toISOString(),
      messages: [
        { role: 'bot', text: "Hi there. I'm KnowledgeIQ. Ask me anything about your enterprise documents, guidelines, or architectural specifications." }
      ]
    };
    const result = await db.collection('chat_sessions').insertOne(newSession);
    res.success({
      id: result.insertedId.toString(),
      ...newSession
    }, 201);
  } catch (err) {
    next(err);
  }
});

// GET session by ID
router.get('/:sessionId', validate(schemas.sessionIdSchema, 'params'), async (req, res, next) => {
  try {
    const db = getDB();
    const sessionId = req.params.sessionId;
    const session = await db.collection('chat_sessions').findOne({ _id: new ObjectId(sessionId) });
    if (!session) {
      const err = new Error('Session not found.');
      err.status = 404;
      return next(err);
    }
    res.success({ ...session, id: session._id.toString() });
  } catch (err) {
    next(err);
  }
});

// PATCH rename session
router.patch('/:sessionId', validate(schemas.sessionIdSchema, 'params'), validate(schemas.sessionRenameSchema, 'body'), async (req, res, next) => {
  try {
    const db = getDB();
    const sessionId = req.params.sessionId;
    const { name } = req.body;

    const result = await db.collection('chat_sessions').updateOne(
      { _id: new ObjectId(sessionId) },
      { $set: { name: name.trim() } }
    );
    if (result.matchedCount === 0) {
      const err = new Error('Session not found.');
      err.status = 404;
      return next(err);
    }
    res.success({ status: 'Session renamed', name: name.trim() });
  } catch (err) {
    next(err);
  }
});

// DELETE session
router.delete('/:sessionId', validate(schemas.sessionIdSchema, 'params'), async (req, res, next) => {
  try {
    const db = getDB();
    const sessionId = req.params.sessionId;

    const result = await db.collection('chat_sessions').deleteOne({ _id: new ObjectId(sessionId) });
    if (result.deletedCount === 0) {
      const err = new Error('Session not found.');
      err.status = 404;
      return next(err);
    }
    res.success({ status: 'Session deleted', sessionId });
  } catch (err) {
    next(err);
  }
});

// POST add message to session
router.post('/:sessionId/messages', validate(schemas.sessionIdSchema, 'params'), validate(schemas.sessionMessageSchema, 'body'), async (req, res, next) => {
  try {
    const db = getDB();
    const sessionId = req.params.sessionId;
    const newMessage = req.body;

    const session = await db.collection('chat_sessions').findOne({ _id: new ObjectId(sessionId) });
    if (!session) {
      const err = new Error('Session not found.');
      err.status = 404;
      return next(err);
    }

    const updates = { $push: { messages: newMessage } };

    // Auto-generate session name on first user message if session is unnamed
    if (newMessage.role === 'user' && (!session.name || session.name.trim() === '')) {
      const autoTitle = generatePredictiveTitle(newMessage.text);
      updates.$set = { name: autoTitle };
    }

    await db.collection('chat_sessions').updateOne(
      { _id: new ObjectId(sessionId) },
      updates
    );
    res.success({ status: 'Message added', name: updates.$set?.name || session.name || null });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
