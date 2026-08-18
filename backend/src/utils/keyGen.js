'use strict';

const crypto = require('crypto');

const KEY_PREFIX = 'sk_live_';

/**
 * Generate a cryptographically secure API key.
 * Format: sk_live_<base64url-encoded random bytes>
 *
 * @returns {{ fullKey: string, keyHash: string, keyPrefix: string, lastFour: string }}
 */
function generateApiKey() {
  // 32 bytes → 256 bits of entropy
  const randomBytes = crypto.randomBytes(32);

  // Base64 URL-safe encoding (RFC 4648 §5): replace + with - and / with _
  const encoded = randomBytes
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, ''); // strip padding

  const fullKey = `${KEY_PREFIX}${encoded}`;
  const keyHash = hashKey(fullKey);
  const lastFour = fullKey.slice(-4);

  return { fullKey, keyHash, keyPrefix: KEY_PREFIX, lastFour };
}

/**
 * Compute the SHA-256 hash of an API key.
 * This is what is stored in the database — never the raw key.
 *
 * @param {string} key - The full plaintext API key
 * @returns {string} Hex-encoded SHA-256 hash
 */
function hashKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

module.exports = { generateApiKey, hashKey };
