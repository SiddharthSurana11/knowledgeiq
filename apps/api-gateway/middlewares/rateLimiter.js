const rateLimit = require('express-rate-limit');
const { config } = require('../config');
const logger = require('../utils/logger');

/**
 * Creates a rate limiter instance
 * @param {number} maxRequests - Max requests allowed in the window
 * @param {string} type - Identifier for logging (e.g., 'Chat', 'Upload')
 */
const createRateLimiter = (maxRequests, type) => {
  return rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: maxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res, next) => {
      logger.warn(`Rate limit exceeded for ${type}`, {
        eventId: 'RATE_LIMIT_EXCEEDED',
        type,
        ip: req.ip,
        limit: maxRequests,
        windowMs: config.rateLimit.windowMs
      });

      return res.status(429).json({
        success: false,
        errorCode: 'KIQ-5029',
        message: 'Too many requests. Please try again later.',
        timestamp: new Date().toISOString()
      });
    }
  });
};

// Define specific limiters based on route needs
const standardLimiter = createRateLimiter(config.rateLimit.maxRequests, 'Standard');
const uploadLimiter = createRateLimiter(Math.max(10, Math.floor(config.rateLimit.maxRequests / 5)), 'Upload');

module.exports = {
  standardLimiter,
  uploadLimiter
};
