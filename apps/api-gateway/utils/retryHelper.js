const { config } = require('../config');
const logger = require('./logger');

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const isTransientError = (err) => {
  // Do not retry validation (400), Auth (401, 403), etc.
  if (err.status && err.status >= 400 && err.status < 500 && err.status !== 429) {
    return false;
  }
  return true;
};

async function withRetry(operationName, fn) {
  let attempt = 0;
  const maxRetries = config.circuitBreaker.maxRetries;
  const baseDelayMs = config.circuitBreaker.baseDelayMs;
  const maxDelayMs = config.circuitBreaker.maxDelayMs;

  while (attempt <= maxRetries) {
    try {
      return await fn();
    } catch (err) {
      if (!isTransientError(err) || attempt >= maxRetries) {
        throw err;
      }
      
      attempt++;
      // Exponential backoff with full jitter
      const backoff = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt));
      const jitter = Math.random() * backoff;
      const sleepTime = Math.floor(jitter);
      
      logger.warn(`[Retry - ${operationName}] Attempt ${attempt} failed. Retrying in ${sleepTime}ms. Error: ${err.message}`);
      await delay(sleepTime);
    }
  }
}

module.exports = { withRetry, isTransientError };
