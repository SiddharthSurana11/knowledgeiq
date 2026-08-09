const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const httpContext = require('express-http-context');
const path = require('path');

const logDir = path.join(__dirname, '../logs');

// Custom format to inject correlation ID
const correlationFormat = winston.format((info) => {
  const reqId = httpContext.get('reqId');
  if (reqId) {
    info.reqId = reqId;
  }
  return info;
});

// JSON formatter for files (compatible with Grafana/Prometheus)
const fileFormat = winston.format.combine(
  correlationFormat(),
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Colorized console formatter
const consoleFormat = winston.format.combine(
  correlationFormat(),
  winston.format.timestamp(),
  winston.format.colorize(),
  winston.format.printf(({ level, message, timestamp, reqId, stack }) => {
    const idStr = reqId ? ` [REQ:${reqId}]` : '';
    const errStr = stack ? `\n${stack}` : '';
    return `[${timestamp}] ${level}:${idStr} ${message}${errStr}`;
  })
);

// Create the main API logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: fileFormat,
  transports: [
    new winston.transports.Console({ format: consoleFormat }),
    new DailyRotateFile({
      filename: path.join(logDir, 'api-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d'
    }),
    new DailyRotateFile({
      level: 'error',
      filename: path.join(logDir, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '30d'
    })
  ]
});

// Specialized loggers for specific domains
const uploadLogger = winston.createLogger({
  level: 'info',
  format: fileFormat,
  transports: [
    new DailyRotateFile({
      filename: path.join(logDir, 'uploads-%DATE%.log'),
      datePattern: 'YYYY-MM-DD'
    })
  ]
});

const chatLogger = winston.createLogger({
  level: 'info',
  format: fileFormat,
  transports: [
    new DailyRotateFile({
      filename: path.join(logDir, 'chat-%DATE%.log'),
      datePattern: 'YYYY-MM-DD'
    })
  ]
});

const requestLoggerStream = winston.createLogger({
  level: 'http',
  format: fileFormat,
  transports: [
    new DailyRotateFile({
      filename: path.join(logDir, 'requests-%DATE%.log'),
      datePattern: 'YYYY-MM-DD'
    })
  ]
});

// Backward compatibility wrappers for existing code
module.exports = {
  info: (msg, reqId = '') => logger.info(msg, reqId ? { reqId } : {}),
  warn: (msg, reqId = '') => logger.warn(msg, reqId ? { reqId } : {}),
  error: (msg, err = null, reqId = '') => {
    if (err) {
      logger.error(msg, { error: err, stack: err.stack, reqId });
    } else {
      logger.error(msg, { reqId });
    }
  },
  http: (msg, meta) => requestLoggerStream.http(msg, meta),
  uploadLog: (msg, meta = {}) => {
    const eventPrefix = meta.eventId ? `[${meta.eventId}] ` : '';
    logger.info(`[UPLOAD] ${eventPrefix}${msg}`, meta);
    uploadLogger.info(msg, meta);
  },
  chatLog: (msg, meta = {}) => {
    const eventPrefix = meta.eventId ? `[${meta.eventId}] ` : '';
    logger.info(`[CHAT] ${eventPrefix}${msg}`, meta);
    chatLogger.info(msg, meta);
  },
  winstonLogger: logger
};
