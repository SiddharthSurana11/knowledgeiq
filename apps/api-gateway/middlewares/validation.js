const Joi = require('joi');
const logger = require('../utils/logger');

/**
 * Creates an Express middleware that validates the request against a Joi schema.
 * 
 * @param {Joi.ObjectSchema} schema - The Joi schema to validate against
 * @param {string} target - The request property to validate ('body', 'query', 'params')
 */
const validate = (schema, target = 'body') => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[target], {
      abortEarly: false,
      stripUnknown: true // Automatically remove unknown fields for security
    });

    if (error) {
      const details = error.details.map(err => err.message).join(', ');
      logger.warn(`Request validation failed on ${target}`, {
        eventId: 'VALIDATION_FAILED',
        target,
        details,
        path: req.originalUrl
      });
      return res.status(400).json({
        success: false,
        errorCode: 'KIQ-1001',
        message: `Validation failed: ${details}`,
        timestamp: new Date().toISOString()
      });
    }

    // Replace the request object with the validated/cleaned values
    req[target] = value;
    next();
  };
};

// --- Reusable Base Schemas ---
const uuidSchema = Joi.object({
  id: Joi.string().guid({ version: ['uuidv4'] }).required()
});

const objectIdSchema = Joi.object({
  id: Joi.string().regex(/^[0-9a-fA-F]{24}$/).required()
});

const sessionIdSchema = Joi.object({
  sessionId: Joi.string().regex(/^[0-9a-fA-F]{24}$/).required()
});

// --- Specific Route Schemas ---

const chatSchema = Joi.object({
  message: Joi.string().trim().min(1).max(2000).required(),
  category: Joi.string().trim().max(100).allow(null, ''),
  scope: Joi.string().valid('global', 'category', 'document').default('global'),
  documentId: Joi.string().allow(null, '').optional(),
  userId: Joi.string().max(100).allow(null, ''),
  sessionId: Joi.string().max(100).allow(null, ''),
  history: Joi.array().items(
    Joi.object({
      role: Joi.string().valid('user', 'bot', 'assistant', 'system').required(),
      text: Joi.string().allow('', null)
    }).unknown(true)
  ).max(20).default([])
});

const uploadBodySchema = Joi.object({
  category: Joi.string().trim().max(100).required()
}).unknown(true); // Multer attaches things, but this validates the body fields

const documentStatusSchema = Joi.object({
  status: Joi.string().valid('active', 'archived', 'pending_review').required()
});

const documentReviewSchema = Joi.object({
  reviewedBy: Joi.string().trim().max(100).allow(null, '')
});

const feedbackSchema = Joi.object({
  feedback: Joi.string().valid('up', 'down').required(),
  question: Joi.string().trim().min(1).max(2000).required()
}).unknown(true);

const sessionRenameSchema = Joi.object({
  name: Joi.string().trim().min(1).max(100).required()
});

const sessionMessageSchema = Joi.object({
  role: Joi.string().valid('user', 'bot').required(),
  text: Joi.string().allow('')
}).unknown(true);

module.exports = {
  validate,
  schemas: {
    uuidSchema,
    objectIdSchema,
    sessionIdSchema,
    chatSchema,
    uploadBodySchema,
    documentStatusSchema,
    documentReviewSchema,
    feedbackSchema,
    sessionRenameSchema,
    sessionMessageSchema
  }
};
