const logger = require('../utils/logger');
const { config } = require('../config');
const httpContext = require('express-http-context');

// Maps standard HTTP statuses to structured KIQ codes
function getKiqCode(status) {
  switch(status) {
    case 400: return 'KIQ-1001'; // INVALID_INPUT
    case 401: return 'KIQ-2001'; // AUTH_REQUIRED
    case 403: return 'KIQ-2003'; // FORBIDDEN
    case 404: return 'KIQ-3004'; // NOT_FOUND
    case 409: return 'KIQ-4009'; // CONFLICT
    case 413: return 'KIQ-1013'; // UPLOAD_TOO_LARGE
    case 422: return 'KIQ-1022'; // UNPROCESSABLE
    case 429: return 'KIQ-5029'; // RATE_LIMITED
    case 503: return 'KIQ-5003'; // SERVICE_UNAVAILABLE (Circuit breaker)
    default: return 'KIQ-9999'; // INTERNAL_ERROR
  }
}

function jsonSyntaxErrorHandler(err, req, res, next) {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    const kiqCode = getKiqCode(400);
    logger.warn(`JSON Syntax Error: ${err.message}`);
    return res.status(400).json({
      success: false,
      errorCode: kiqCode,
      message: 'The request body contains malformed JSON.',
      requestId: httpContext.get('reqId') || 'unknown',
      correlationId: httpContext.get('correlationId') || 'unknown',
      timestamp: new Date().toISOString()
    });
  }
  next(err);
}

function globalErrorHandler(err, req, res, next) {
  if (err.code === 'LIMIT_FILE_SIZE') {
    const reqId = httpContext.get('reqId') || 'unknown';
    const configuredLimit = config.limits.uploadMaxMB;
    let receivedFileSizeMB;
    
    if (req.file && req.file.size) {
      receivedFileSizeMB = req.file.size / (1024 * 1024);
    } else if (req.headers['content-length']) {
      receivedFileSizeMB = parseInt(req.headers['content-length']) / (1024 * 1024);
    }

    logger.uploadLog('File too large', { 
      eventId: 'UPLOAD_REJECTED_FILE_TOO_LARGE',
      reason: 'LIMIT_FILE_SIZE',
      requestId: reqId,
      filename: req.file && req.file.originalname ? req.file.originalname : 'unknown',
      fileSize: req.file && req.file.size ? req.file.size : req.headers['content-length'],
      configuredLimit,
      userIp: req.ip || req.connection?.remoteAddress
    });

    return res.status(413).json({
      success: false,
      errorCode: getKiqCode(413),
      message: "The selected file exceeds the maximum upload size.",
      maxUploadSizeMB: configuredLimit,
      receivedFileSizeMB: receivedFileSizeMB ? parseFloat(receivedFileSizeMB.toFixed(1)) : undefined,
      requestId: reqId,
      correlationId: httpContext.get('correlationId') || 'unknown',
      timestamp: new Date().toISOString()
    });
  }

  const status = err.status || err.statusCode || 500;
  const errorCode = err.code || getKiqCode(status);
  
  if (status >= 500) {
    logger.error(`[${errorCode}] Internal Server Error`, err);
  } else {
    logger.warn(`[${errorCode}] ${err.message}`);
  }

  res.status(status).json({
    success: false,
    errorCode,
    message: err.message || 'An internal server error occurred.',
    requestId: httpContext.get('reqId') || 'unknown',
    correlationId: httpContext.get('correlationId') || 'unknown',
    timestamp: new Date().toISOString()
  });
}

// Wrapper for response standard format
function responseWrapper(req, res, next) {
  res.success = (data, status = 200) => {
    return res.status(status).json({
      success: true,
      data,
      timestamp: new Date().toISOString()
    });
  };
  next();
}

module.exports = {
  jsonSyntaxErrorHandler,
  globalErrorHandler,
  responseWrapper
};
