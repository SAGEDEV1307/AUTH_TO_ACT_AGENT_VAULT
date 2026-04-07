'use strict';

const redis = require('./redis');
const { RateLimitError } = require('./errors');

async function checkRateLimit(key, maxRequests, windowSeconds) {
  const count = await redis.incr(key, windowSeconds);
  if (count > maxRequests) {
    throw new RateLimitError(`Rate limit exceeded. Max ${maxRequests} requests per ${windowSeconds}s window.`);
  }
  return { count, remaining: Math.max(0, maxRequests - count) };
}

function rateLimitMiddleware(prefix, maxRequests, windowSeconds) {
  return async (req, res, next) => {
    const identifier = req.user?.id || req.ip;
    const key = `rl:${prefix}:${identifier}`;
    try {
      const { remaining } = await checkRateLimit(key, maxRequests, windowSeconds);
      res.set('X-RateLimit-Limit', maxRequests);
      res.set('X-RateLimit-Remaining', remaining);
      next();
    } catch (err) {
      if (err.code === 'RATE_LIMITED') {
        res.set('Retry-After', windowSeconds);
        return res.status(429).json({ error: err.message, code: err.code });
      }
      next(err);
    }
  };
}

module.exports = { checkRateLimit, rateLimitMiddleware };
