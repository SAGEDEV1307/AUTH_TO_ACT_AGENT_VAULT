'use strict';

const { getSession } = require('./session-manager');
const { AuthenticationError } = require('../lib/errors');
const logger = require('../lib/logger');

async function authenticateMCPRequest(req) {
  // Support both session ID header and API key
  const sessionId = req.headers['x-mcp-session'];
  if (sessionId) {
    const session = await getSession(sessionId);
    if (!session) throw new AuthenticationError('Invalid or expired MCP session');
    return { sessionId, userId: session.userId, session };
  }
  // Fall back to API key auth (handled by middleware)
  if (req.user) {
    return { userId: req.user.dbId, session: null };
  }
  throw new AuthenticationError('MCP authentication required');
}

module.exports = { authenticateMCPRequest };
