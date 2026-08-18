'use strict';

const { hashKey } = require('../utils/keyGen');
const { query } = require('../db');

/**
 * Authentication Middleware
 *
 * Extracts the Bearer token from the Authorization header,
 * hashes it with SHA-256, and looks it up in the database.
 *
 * Attaches `req.apiKey` and `req.tenant` on success.
 * Returns 401 Unauthorized on failure.
 */
async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];

    // Validate header presence and format
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authorization: Bearer <token> header is required'
      });
    }

    const providedKey = authHeader.slice(7).trim();

    if (!providedKey) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'API key must not be empty'
      });
    }

    // Hash the provided key for database lookup (SHA-256)
    const keyHash = hashKey(providedKey);

    // Lookup active key — handles grace period via expires_at check
    const result = await query(
      `SELECT
         ak.id,
         ak.tenant_id,
         ak.key_prefix,
         ak.last_four,
         ak.rate_limit_per_minute,
         ak.is_active,
         ak.expires_at,
         t.name AS tenant_name
       FROM api_keys ak
       JOIN tenants t ON t.id = ak.tenant_id
       WHERE ak.key_hash = $1
         AND ak.is_active = TRUE
         AND (ak.expires_at IS NULL OR ak.expires_at > NOW())`,
      [keyHash]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or expired API key'
      });
    }

    // Attach key info to the request for downstream middleware
    req.apiKey = result.rows[0];
    req.tenant = {
      id: result.rows[0].tenant_id,
      name: result.rows[0].tenant_name
    };

    next();
  } catch (err) {
    console.error('[Auth] Error during authentication:', err.message);
    next(err);
  }
}

module.exports = { authenticate };
