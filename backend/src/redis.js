'use strict';

const Redis = require('ioredis');

const redisClient = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    if (times > 10) return null; // stop retrying
    return Math.min(times * 100, 3000);
  },
  reconnectOnError(err) {
    const targetErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT'];
    return targetErrors.some((e) => err.message.includes(e));
  }
});

redisClient.on('connect', () => console.log('[Redis] Connected'));
redisClient.on('error', (err) => console.error('[Redis] Error:', err.message));
redisClient.on('reconnecting', () => console.log('[Redis] Reconnecting...'));

module.exports = redisClient;
