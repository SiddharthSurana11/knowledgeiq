const httpContext = require('express-http-context');
const { v4: uuidv4 } = require('uuid');

function correlationIdMiddleware(req, res, next) {
  // Use existing header if provided, otherwise generate a new UUID
  const reqId = req.headers['x-request-id'] || uuidv4();
  
  // Attach to req for direct access
  req.id = reqId;
  
  // Set in httpContext for global async access
  httpContext.set('reqId', reqId);
  
  // Set in response header
  res.setHeader('X-Request-Id', reqId);
  
  next();
}

module.exports = correlationIdMiddleware;
