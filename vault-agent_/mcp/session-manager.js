'use strict';

const { v4: uuidv4 } = require('uuid');
const redis = require('../lib/redis');
const logger = require('../lib/logger');

const SESSION_TTL = 3600; // 1 hour

async function createSession(userId, clientInfo = {}) {
  const sessionId = uuidv4();
  const session = {
    id: sessionId,
    userId,
    clientInfo,
    createdAt: new Date().toISOString(),
  };
  await redis.set(`mcp:session:${sessionId}`, session, SESSION_TTL);
  logger.info('MCP session created', { sessionId, userId });
  return session;
}

async function getSession(sessionId) {
  return redis.get(`mcp:session:${sessionId}`);
}

async function refreshSession(sessionId) {
  await redis.expire(`mcp:session:${sessionId}`, SESSION_TTL);
}

async function destroySession(sessionId) {
  await redis.del(`mcp:session:${sessionId}`);
  logger.info('MCP session destroyed', { sessionId });
}

async function getUserSessions(userId) {
  const keys = await redis.keys(`mcp:session:*`);
  const sessions = [];
  for (const key of keys) {
    const s = await redis.get(key);
    if (s && s.userId === userId) sessions.push(s);
  }
  return sessions;
}

module.exports = { createSession, getSession, refreshSession, destroySession, getUserSessions };
