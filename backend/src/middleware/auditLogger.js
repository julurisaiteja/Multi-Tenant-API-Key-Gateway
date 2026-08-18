'use strict';

const { query } = require('../db');

/**
 * Audit Logger Middleware
 *
 * Records every authenticated request to the audit_logs table,
 * including rate-limited (429) requests as specified in requirement 9.
 *
 * Must run AFTER authenticate and rateLimiter so that both
 * `req.apiKey` and `req.responseStatus` are available.
 *
 * Uses res.on('finish') to capture the actual status code sent.
 */
function auditLogger(req, res, next) {
  res.on('finish', async () => {
    try {
      if (!req.apiKey) return; // unauthenticated requests are not logged

      const statusCode = res.statusCode;
      const endpoint = req.originalUrl || req.url;
      const apiKeyId = req.apiKey.id;

      await query(
        `INSERT INTO audit_logs (api_key_id, endpoint, status_code)
         VALUES ($1, $2, $3)`,
        [apiKeyId, endpoint, statusCode]
      );
    } catch (err) {
      // Non-fatal — don't block the response
      console.error('[AuditLogger] Failed to write audit log:', err.message);
    }
  });

  next();
}

module.exports = { auditLogger };
