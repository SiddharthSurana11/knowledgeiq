const { config } = require('../config');
const AuthProvider = require('../services/authProvider');
const logger = require('../utils/logger');

function authMiddleware(req, res, next) {
  if (!config.auth.enabled) {
    // If auth is disabled (e.g. local dev), proceed without user
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    logger.warn('Unauthorized access attempt: Missing or invalid token format');
    return res.status(401).json({
      success: false,
      errorCode: 'KIQ-2001',
      message: 'Authentication required. Please provide a valid Bearer token.',
      timestamp: new Date().toISOString()
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const user = AuthProvider.verifyToken(token);
    req.user = user;
    next();
  } catch (err) {
    logger.warn(`Unauthorized access attempt: ${err.message}`);
    return res.status(401).json({
      success: false,
      errorCode: 'KIQ-2001',
      message: 'Invalid or expired authentication token.',
      timestamp: new Date().toISOString()
    });
  }
}

module.exports = authMiddleware;
