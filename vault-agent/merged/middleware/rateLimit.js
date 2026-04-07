'use strict';

const { rateLimitMiddleware } = require('../lib/rate-limit');
const { RATE_LIMITS } = require('../lib/constants');

const apiLimiter = rateLimitMiddleware(
  'api',
  RATE_LIMITS.API_MAX_REQUESTS,
  RATE_LIMITS.API_WINDOW_MS / 1000
);

const agentLimiter = rateLimitMiddleware(
  'agent',
  RATE_LIMITS.AGENT_MAX_REQUESTS,
  RATE_LIMITS.AGENT_WINDOW_MS / 1000
);

const authLimiter = rateLimitMiddleware(
  'auth',
  RATE_LIMITS.AUTH_MAX_REQUESTS,
  RATE_LIMITS.AUTH_WINDOW_MS / 1000
);

module.exports = { apiLimiter, agentLimiter, authLimiter };
