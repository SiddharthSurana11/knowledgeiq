const express = require('express');
const DocumentService = require('../services/documentService.js');
const { validate, schemas } = require('../middlewares/validation');

const router = express.Router();

// GET /api/documents - Retrieve all documents metadata (no MongoDB _id exposed)
router.get('/', async (req, res, next) => {
  try {
    const docs = await DocumentService.getAllDocuments();
    res.success(docs);
  } catch (err) {
    next(err);
  }
});

// GET /api/documents/:id - Retrieve a single document by its UUID documentId
router.get('/:id', validate(schemas.uuidSchema, 'params'), async (req, res, next) => {
  try {
    const id = req.params.id;

    const doc = await DocumentService.getDocumentById(id);
    if (!doc) {
      const err = new Error('Document not found.');
      err.status = 404;
      return next(err);
    }
    res.success(doc);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/documents/:id/status - Update a document's status
router.patch('/:id/status', validate(schemas.uuidSchema, 'params'), validate(schemas.documentStatusSchema, 'body'), async (req, res, next) => {
  try {
    const id = req.params.id;
    const { status } = req.body;

    const updatedDoc = await DocumentService.updateStatus(id, status);
    if (!updatedDoc) {
      const err = new Error('Document not found.');
      err.status = 404;
      return next(err);
    }

    res.success({
      message: 'Status updated successfully.',
      document: updatedDoc
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/documents/:id/review - Log a review event for a document
router.patch('/:id/review', validate(schemas.uuidSchema, 'params'), validate(schemas.documentReviewSchema, 'body'), async (req, res, next) => {
  try {
    const id = req.params.id;
    const { reviewedBy } = req.body;

    const updatedDoc = await DocumentService.markReviewed(id, reviewedBy);
    if (!updatedDoc) {
      const err = new Error('Document not found.');
      err.status = 404;
      return next(err);
    }

    res.success({
      message: 'Document review logged successfully.',
      document: updatedDoc
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/documents/:id/duplicates - Retrieve duplicate details and related document metadata
router.get('/:id/duplicates', validate(schemas.uuidSchema, 'params'), async (req, res, next) => {
  try {
    const id = req.params.id;

    const doc = await DocumentService.getDocumentById(id);
    if (!doc) {
      const err = new Error('Document not found.');
      err.status = 404;
      return next(err);
    }

    let relatedDocument = null;
    if (doc.duplicateOf) {
      relatedDocument = await DocumentService.getDocumentById(doc.duplicateOf);
    }

    res.success({
      duplicateStatus: doc.duplicateStatus || 'UNIQUE',
      duplicateScore: doc.duplicateScore || 0,
      duplicateReason: doc.duplicateReason || 'No duplicate records found.',
      duplicateOf: doc.duplicateOf || null,
      relatedDocument
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/documents/:id/contradictions - Retrieve contradiction scan details and conflicting document metadata
router.get('/:id/contradictions', validate(schemas.uuidSchema, 'params'), async (req, res, next) => {
  try {
    const id = req.params.id;

    const doc = await DocumentService.getDocumentById(id);
    if (!doc) {
      const err = new Error('Document not found.');
      err.status = 404;
      return next(err);
    }

    res.success({
      document: {
        documentId: doc.documentId,
        filename: doc.filename,
        category: doc.category,
        uploadedBy: doc.uploadedBy,
        uploadedAt: doc.uploadedAt,
        status: doc.status,
        version: doc.version,
        hash: doc.hash
      },
      contradictionSummary: {
        status: doc.contradictionStatus || 'NO_CONTRADICTION',
        count: doc.contradictionCount || 0,
        confidence: doc.contradictionConfidence || 0,
        lastContradictionScan: doc.lastContradictionScan || null
      },
      contradictionDetails: doc.contradictionDetails || []
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/documents/:id/trust - Retrieve the Trust Score, breakdown, status, and calculation dates
router.get('/:id/trust', validate(schemas.uuidSchema, 'params'), async (req, res, next) => {
  try {
    const id = req.params.id;

    const doc = await DocumentService.getDocumentById(id);
    if (!doc) {
      const err = new Error('Document not found.');
      err.status = 404;
      return next(err);
    }

    res.success({
      documentId: doc.documentId,
      filename: doc.filename,
      trustScore: doc.trustScore !== undefined ? doc.trustScore : 0,
      breakdown: doc.trustBreakdown || {
        duplicatePenalty: 0,
        contradictionPenalty: 0,
        reviewBonus: 0,
        agePenalty: 0,
        statusPenalty: 0
      },
      duplicateStatus: doc.duplicateStatus || 'UNIQUE',
      contradictionStatus: doc.contradictionStatus || 'NO_CONTRADICTION',
      status: doc.status || 'active',
      lastReviewed: doc.lastReviewed || null,
      uploadedAt: doc.uploadedAt || null,
      lastTrustCalculation: doc.lastTrustCalculation || null
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
