const logger = require('../utils/logger');

function requestLoggerMiddleware(req, res, next) {
  const startTime = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const meta = {
      method: req.method,
      endpoint: req.originalUrl,
      status: res.statusCode,
      durationMs: duration,
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.get('user-agent')
    };

    if (res.statusCode >= 500) {
      logger.http(`[HTTP] ${req.method} ${req.originalUrl} - 5xx Error`, meta);
    } else if (res.statusCode >= 400) {
      logger.http(`[HTTP] ${req.method} ${req.originalUrl} - 4xx Warning`, meta);
    } else {
      logger.http(`[HTTP] ${req.method} ${req.originalUrl} - OK`, meta);
    }
  });
  
  next();
}

module.exports = requestLoggerMiddleware;
