const express = require('express');
const cors = require('cors');
const httpContext = require('express-http-context');

// Configuration
const { config, validateConfig } = require('./config');

// Logger & Utils
const logger = require('./utils/logger.js');
const { connectToDB } = require('./utils/mongoClient.js');
const storage = require('./utils/storage/index.js');
const { seedCategories } = require('./utils/categorySeeder.js');
const { getCachedCategories } = require('./utils/categoryCache.js');

// Middlewares
const correlationIdMiddleware = require('./middlewares/correlationId');
const requestLoggerMiddleware = require('./middlewares/requestLogger');
const { applySecurityHeaders, inputSanitizer, jsonLimiter, urlencodedLimiter } = require('./middlewares/security');
const { jsonSyntaxErrorHandler, globalErrorHandler, responseWrapper } = require('./middlewares/errorHandler');
const { standardLimiter, uploadLimiter } = require('./middlewares/rateLimiter');
const authMiddleware = require('./middlewares/auth');

// Routes
const healthRoute = require('./routes/healthRoute.js');
const uploadRoute = require('./routes/uploadRoute.js');
const chatRoute = require('./routes/chatRoute.js');
const feedbackRoute = require('./routes/feedback.js');
const adminFeedbackRoute = require('./routes/adminFeedback.js');
const sessionRoute = require('./routes/sessionRoute.js');
const documentsRoute = require('./routes/documents.js');
const dashboardRoute = require('./routes/dashboard.js');
const analyticsRoute = require('./routes/analytics.js');
const healthStatsRoute = require('./routes/healthStats.js');

// Handle uncaught exceptions and rejections
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception', err);
  process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', reason);
});

// App setup
const app = express();
const PORT = config.port;

// Base Middlewares
app.use(httpContext.middleware);
app.use(correlationIdMiddleware);
app.use(applySecurityHeaders);

// Dynamic CORS based on config
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || config.cors.trustedOrigins.includes('*') || config.cors.trustedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
};
app.use(cors(corsOptions));

// Parsers & Formatters
app.use(jsonLimiter);
app.use(urlencodedLimiter);
app.use(jsonSyntaxErrorHandler); // Catch JSON parsing errors early
app.use(inputSanitizer);
app.use(responseWrapper);

// Request Tracing
app.use(requestLoggerMiddleware);

// Mount Routes
app.use('/health', healthRoute);
app.use('/api/upload', authMiddleware, uploadLimiter, uploadRoute);
app.use('/api/chat', authMiddleware, standardLimiter, chatRoute);
app.use('/api/feedback', authMiddleware, standardLimiter, feedbackRoute);
app.use('/api/admin-feedback', authMiddleware, standardLimiter, adminFeedbackRoute);
app.use('/api/sessions', authMiddleware, standardLimiter, sessionRoute);
app.use('/api/documents', authMiddleware, standardLimiter, documentsRoute);
app.use('/api/dashboard', authMiddleware, standardLimiter, dashboardRoute);
app.use('/api/analytics', authMiddleware, standardLimiter, analyticsRoute);
app.use('/api/health', authMiddleware, standardLimiter, healthStatsRoute);

// Dynamic categories endpoint
app.get('/api/categories', async (req, res, next) => {
  try {
    const categories = await getCachedCategories();
    res.success(categories);
  } catch (err) {
    next(err);
  }
});

const { startContradictionWorker } = require('./workers/contradictionWorker.js');

// Global Error Handler
app.use(globalErrorHandler);

// Startup Self-Invoker
(async () => {
  try {
    validateConfig();
    const db = await connectToDB();
    // Ensure compound index for health aggregation queries (idempotent)
    if (db && typeof db.collection === 'function') {
      await db.collection('documents').createIndex(
        { status: 1, contradictionStatus: 1, duplicateStatus: 1 },
        { background: true }
      );
    }
    startContradictionWorker();
    await seedCategories();
    await storage.init();
    app.listen(PORT, () => {
      logger.info(`Backend running at http://localhost:${PORT}`);
    });
  } catch (err) {
    logger.error('Failed to start application', err);
    process.exit(1);
  }
})();

module.exports = app; // Export for testing
