'use strict';

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { slidingWindowRateLimit } = require('../middleware/rateLimiter');
const { auditLogger } = require('../middleware/auditLogger');

/**
 * GET /api/protected
 *
 * A protected test endpoint that demonstrates the full pipeline:
 * 1. authenticate      — validates the Bearer token against DB
 * 2. auditLogger       — logs the request to audit_logs (via res.on('finish'))
 * 3. slidingWindowRateLimit — enforces per-key rate limits via Redis
 *
 * The auditLogger is registered before the rate limiter so that
 * both 200 and 429 responses are captured in the audit log.
 */
router.get(
  '/',
  authenticate,
  auditLogger,
  slidingWindowRateLimit,
  (req, res) => {
    res.status(200).json({
      message: 'Access granted!',
      tenant: req.tenant,
      keyInfo: {
        id: req.apiKey.id,
        lastFour: req.apiKey.last_four,
        rateLimitPerMinute: req.apiKey.rate_limit_per_minute
      },
      timestamp: new Date().toISOString()
    });
  }
);

module.exports = router;
