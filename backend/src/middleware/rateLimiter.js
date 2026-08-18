'use strict';

const redisClient = require('../redis');

const WINDOW_SIZE_MS = 60 * 1000; // 60-second sliding window

/**
 * Sliding Window Rate Limiter — implemented from first principles using
 * Redis Sorted Sets (no external rate-limiting library).
 *
 * Algorithm:
 *  1. Build a per-key sorted set: rate_limit:{keyId}
 *  2. In a single MULTI/EXEC transaction:
 *     a. ZREMRANGEBYSCORE → evict timestamps older than the current window
 *     b. ZADD             → record current request timestamp
 *     c. ZCARD            → count requests in the window
 *     d. PEXPIRE          → set TTL so the key auto-cleans from Redis
 *  3. Compare count to the key's rate_limit_per_minute
 *  4. If exceeded → 429 with Retry-After header
 *
 * This middleware must run AFTER the `authenticate` middleware so that
 * `req.apiKey` is available.
 */
async function slidingWindowRateLimit(req, res, next) {
  try {
    const apiKeyId = req.apiKey.id;
    const limit = req.apiKey.rate_limit_per_minute;
    const now = Date.now(); // milliseconds
    const windowStart = now - WINDOW_SIZE_MS;

    // Unique sorted set key per API key
    const redisKey = `rate_limit:${apiKeyId}`;

    // Use a unique member to allow multiple requests at the exact same millisecond
    const member = `${now}-${Math.random().toString(36).slice(2, 9)}`;

    // Execute atomically using MULTI/EXEC pipeline
    const pipeline = redisClient.multi();
    pipeline.zremrangebyscore(redisKey, 0, windowStart); // evict stale entries
    pipeline.zadd(redisKey, now, member);                // record this request
    pipeline.zcard(redisKey);                            // count in window
    pipeline.pexpire(redisKey, WINDOW_SIZE_MS * 2);      // auto-cleanup TTL

    const results = await pipeline.exec();

    // results[2] is [error, count] from ZCARD
    if (!results || results[2][0]) {
      console.error('[RateLimit] Redis pipeline error:', results);
      // Fail open — allow request if Redis is unavailable
      return next();
    }

    const requestCount = results[2][1];

    // Attach rate limit info to response headers (informational)
    res.setHeader('X-RateLimit-Limit', limit);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, limit - requestCount));
    res.setHeader('X-RateLimit-Window', '60s');

    if (requestCount > limit) {
      // Calculate when the oldest request will expire from the window
      // so the client knows when to retry
      const oldestScore = await redisClient.zrange(redisKey, 0, 0, 'WITHSCORES');
      let retryAfterMs = WINDOW_SIZE_MS;

      if (oldestScore && oldestScore.length >= 2) {
        const oldestTimestamp = parseInt(oldestScore[1]);
        retryAfterMs = Math.max(0, (oldestTimestamp + WINDOW_SIZE_MS) - now);
      }

      const retryAfterSeconds = Math.ceil(retryAfterMs / 1000);

      res.setHeader('Retry-After', retryAfterSeconds);

      // Store status for audit logging
      req.rateLimitExceeded = true;
      req.responseStatus = 429;

      return res.status(429).json({
        error: 'Too Many Requests',
        message: `Rate limit of ${limit} requests per minute exceeded.`,
        retryAfter: retryAfterSeconds
      });
    }

    req.responseStatus = 200;
    next();
  } catch (err) {
    console.error('[RateLimit] Unexpected error:', err.message);
    // Fail open to avoid blocking all traffic on Redis failure
    next();
  }
}

module.exports = { slidingWindowRateLimit };
