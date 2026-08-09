const express = require('express');

function applySecurityHeaders(req, res, next) {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'");
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
}

function sanitizeInput(val) {
  if (typeof val === 'string') {
    return val.replace(/<[^>]*>/g, '').trim();
  }
  if (Array.isArray(val)) {
    return val.map(sanitizeInput);
  }
  if (typeof val === 'object' && val !== null) {
    const sanitized = {};
    for (const k in val) {
      sanitized[k] = sanitizeInput(val[k]);
    }
    return sanitized;
  }
  return val;
}

function inputSanitizer(req, res, next) {
  if (req.body) req.body = sanitizeInput(req.body);
  if (req.query) req.query = sanitizeInput(req.query);
  next();
}

module.exports = {
  applySecurityHeaders,
  inputSanitizer,
  jsonLimiter: express.json({ limit: '10mb' }),
  urlencodedLimiter: express.urlencoded({ limit: '10mb', extended: true })
};
