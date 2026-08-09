const jwt = require('jsonwebtoken');
const { config } = require('../config');
const logger = require('../utils/logger');

/**
 * Provider-agnostic Authentication Service
 * 
 * Currently uses local JWT. Can be extended to use JWKS (Auth0, Okta, etc.)
 * by swapping out the verify implementation without affecting downstream routes.
 */
class AuthProvider {
  /**
   * Verify a token and return the decoded user payload
   * @param {string} token - The JWT token to verify
   * @returns {object} The decoded user object
   */
  static verifyToken(token) {
    try {
      // Future: If using Auth0/Okta, this would fetch JWKS and verify against remote keys
      const decoded = jwt.verify(token, config.auth.jwtSecret);
      return decoded;
    } catch (err) {
      logger.error('AuthProvider Error: Token verification failed', err);
      throw new Error('Invalid token');
    }
  }

  /**
   * For testing purposes, generate a mock token
   * @param {object} payload - Data to encode (e.g. { id, role, org })
   */
  static generateTestToken(payload) {
    return jwt.sign(payload, config.auth.jwtSecret, {
      expiresIn: config.auth.jwtExpiresIn
    });
  }
}

module.exports = AuthProvider;
