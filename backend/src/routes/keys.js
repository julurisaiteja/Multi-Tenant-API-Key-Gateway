'use strict';

const express = require('express');
const router = express.Router();
const { query } = require('../db');
const { generateApiKey } = require('../utils/keyGen');
const redisClient = require('../redis');

const ROTATION_GRACE_PERIOD_MS = 60 * 1000; // 1 minute for testability

// ─── DELETE /api/keys/:keyId ──────────────────────────────────────────────
// Immediately revoke an API key
router.delete('/:keyId', async (req, res, next) => {
  try {
    const keyId = parseInt(req.params.keyId);
    if (isNaN(keyId)) {
      return res.status(400).json({ error: 'Invalid key ID' });
    }

    const result = await query(
      `UPDATE api_keys
       SET is_active = FALSE, expires_at = NOW()
       WHERE id = $1
       RETURNING id`,
      [keyId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'API key not found' });
    }

    // Clean up Redis rate limit data for this key
    try {
      await redisClient.del(`rate_limit:${keyId}`);
    } catch (redisErr) {
      console.warn('[Keys] Could not clean Redis for revoked key:', redisErr.message);
    }

    return res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/keys/:keyId/rotate ────────────────────────────────────────
// Rotate an API key — old key valid for 1 minute grace period
router.post('/:keyId/rotate', async (req, res, next) => {
  try {
    const oldKeyId = parseInt(req.params.keyId);
    if (isNaN(oldKeyId)) {
      return res.status(400).json({ error: 'Invalid key ID' });
    }

    // Fetch the old key to copy its settings
    const oldKeyResult = await query(
      `SELECT id, tenant_id, rate_limit_per_minute, is_active
       FROM api_keys
       WHERE id = $1`,
      [oldKeyId]
    );

    if (oldKeyResult.rows.length === 0) {
      return res.status(404).json({ error: 'API key not found' });
    }

    const oldKey = oldKeyResult.rows[0];

    if (!oldKey.is_active) {
      return res.status(400).json({ error: 'Cannot rotate an inactive key' });
    }

    // Generate the new key
    const { fullKey: newFullKey, keyHash: newKeyHash, keyPrefix, lastFour } = generateApiKey();

    // Use a transaction to atomically:
    // 1. Mark old key with a grace-period expiry (don't deactivate immediately)
    // 2. Insert the new key
    const client = await require('../db').pool.connect();
    try {
      await client.query('BEGIN');

      // Set old key's expires_at to 1 minute from now (grace period)
      const graceExpiry = new Date(Date.now() + ROTATION_GRACE_PERIOD_MS);
      await client.query(
        `UPDATE api_keys
         SET expires_at = $1
         WHERE id = $2`,
        [graceExpiry, oldKeyId]
      );

      // Insert new key with same rate limit settings
      const newKeyResult = await client.query(
        `INSERT INTO api_keys
           (tenant_id, key_hash, key_prefix, last_four, rate_limit_per_minute, is_active)
         VALUES ($1, $2, $3, $4, $5, TRUE)
         RETURNING id, last_four, rate_limit_per_minute, created_at`,
        [oldKey.tenant_id, newKeyHash, keyPrefix, lastFour, oldKey.rate_limit_per_minute]
      );

      await client.query('COMMIT');

      const newKeyRecord = newKeyResult.rows[0];

      return res.status(200).json({
        newApiKey: newFullKey,
        keyRecord: {
          id: newKeyRecord.id,
          lastFour: newKeyRecord.last_four,
          rateLimitPerMinute: newKeyRecord.rate_limit_per_minute,
          createdAt: newKeyRecord.created_at
        },
        oldKeyExpiresAt: graceExpiry.toISOString(),
        message: `Old key will expire in ${ROTATION_GRACE_PERIOD_MS / 1000} seconds`
      });
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

module.exports = router;
