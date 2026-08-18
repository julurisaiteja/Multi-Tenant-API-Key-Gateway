'use strict';

const express = require('express');
const router = express.Router();
const { query } = require('../db');
const { generateApiKey } = require('../utils/keyGen');

// ─── POST /api/tenants/:tenantId/keys ──────────────────────────────────────
// Issue a new API key for a tenant
router.post('/:tenantId/keys', async (req, res, next) => {
  try {
    const tenantId = parseInt(req.params.tenantId);
    if (isNaN(tenantId)) {
      return res.status(400).json({ error: 'Invalid tenant ID' });
    }

    const { rateLimitPerMinute = 100 } = req.body;

    if (typeof rateLimitPerMinute !== 'number' || rateLimitPerMinute < 1) {
      return res.status(400).json({
        error: 'rateLimitPerMinute must be a positive integer'
      });
    }

    // Verify tenant exists
    const tenantResult = await query(
      'SELECT id FROM tenants WHERE id = $1',
      [tenantId]
    );

    if (tenantResult.rows.length === 0) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Generate a cryptographically secure API key
    const { fullKey, keyHash, keyPrefix, lastFour } = generateApiKey();

    // Store ONLY the hash — never the plaintext key
    const insertResult = await query(
      `INSERT INTO api_keys
         (tenant_id, key_hash, key_prefix, last_four, rate_limit_per_minute, is_active)
       VALUES ($1, $2, $3, $4, $5, TRUE)
       RETURNING id, last_four, rate_limit_per_minute, created_at`,
      [tenantId, keyHash, keyPrefix, lastFour, rateLimitPerMinute]
    );

    const keyRecord = insertResult.rows[0];

    // Return the plaintext key ONE TIME — it will never be retrievable again
    return res.status(201).json({
      apiKey: fullKey,
      keyRecord: {
        id: keyRecord.id,
        lastFour: keyRecord.last_four,
        rateLimitPerMinute: keyRecord.rate_limit_per_minute,
        createdAt: keyRecord.created_at
      }
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/tenants/:tenantId/keys ──────────────────────────────────────
// List all keys for a tenant (masked)
router.get('/:tenantId/keys', async (req, res, next) => {
  try {
    const tenantId = parseInt(req.params.tenantId);
    if (isNaN(tenantId)) {
      return res.status(400).json({ error: 'Invalid tenant ID' });
    }

    const result = await query(
      `SELECT
         id,
         key_prefix,
         last_four,
         rate_limit_per_minute,
         is_active,
         expires_at,
         created_at
       FROM api_keys
       WHERE tenant_id = $1
       ORDER BY created_at DESC`,
      [tenantId]
    );

    const keys = result.rows.map((row) => ({
      id: row.id,
      maskedKey: `${row.key_prefix}...${row.last_four}`,
      rateLimitPerMinute: row.rate_limit_per_minute,
      isActive: row.is_active,
      expiresAt: row.expires_at,
      createdAt: row.created_at
    }));

    return res.status(200).json(keys);
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/tenants/:tenantId/audit-logs ────────────────────────────────
// Paginated audit log for a tenant
router.get('/:tenantId/audit-logs', async (req, res, next) => {
  try {
    const tenantId = parseInt(req.params.tenantId);
    if (isNaN(tenantId)) {
      return res.status(400).json({ error: 'Invalid tenant ID' });
    }

    const page = Math.max(1, parseInt(req.query.page || '1'));
    const limit = Math.min(100, parseInt(req.query.limit || '50'));
    const offset = (page - 1) * limit;

    const result = await query(
      `SELECT
         al.id,
         al.api_key_id,
         ak.key_prefix || '...' || ak.last_four AS masked_key,
         al.endpoint,
         al.status_code,
         al.timestamp
       FROM audit_logs al
       JOIN api_keys ak ON ak.id = al.api_key_id
       WHERE ak.tenant_id = $1
       ORDER BY al.timestamp DESC
       LIMIT $2 OFFSET $3`,
      [tenantId, limit, offset]
    );

    const countResult = await query(
      `SELECT COUNT(*) AS total
       FROM audit_logs al
       JOIN api_keys ak ON ak.id = al.api_key_id
       WHERE ak.tenant_id = $1`,
      [tenantId]
    );

    return res.status(200).json({
      logs: result.rows,
      pagination: {
        page,
        limit,
        total: parseInt(countResult.rows[0].total),
        totalPages: Math.ceil(parseInt(countResult.rows[0].total) / limit)
      }
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/tenants/:tenantId/usage ─────────────────────────────────────
// Hourly usage data for Chart.js visualization
router.get('/:tenantId/usage', async (req, res, next) => {
  try {
    const tenantId = parseInt(req.params.tenantId);
    if (isNaN(tenantId)) {
      return res.status(400).json({ error: 'Invalid tenant ID' });
    }

    const result = await query(
      `SELECT
         date_trunc('hour', al.timestamp) AS hour,
         COUNT(*) AS request_count,
         SUM(CASE WHEN al.status_code = 200 THEN 1 ELSE 0 END) AS success_count,
         SUM(CASE WHEN al.status_code = 429 THEN 1 ELSE 0 END) AS rate_limited_count
       FROM audit_logs al
       JOIN api_keys ak ON ak.id = al.api_key_id
       WHERE ak.tenant_id = $1
         AND al.timestamp >= NOW() - INTERVAL '24 hours'
       GROUP BY date_trunc('hour', al.timestamp)
       ORDER BY hour ASC`,
      [tenantId]
    );

    return res.status(200).json(result.rows);
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/tenants ────────────────────────────────────────────────────
// List all tenants (for the frontend selector)
router.get('/', async (req, res, next) => {
  try {
    const result = await query(
      'SELECT id, name, created_at FROM tenants ORDER BY id ASC',
      []
    );
    return res.status(200).json(result.rows);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
