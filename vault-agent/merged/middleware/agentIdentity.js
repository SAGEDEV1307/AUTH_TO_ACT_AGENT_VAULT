'use strict';

const { AuthenticationError, AuthorizationError } = require('../lib/errors');
const db = require('../lib/database');
const redis = require('../lib/redis');
const logger = require('../lib/logger');

// Verifies that the caller is an authorized agent identity
async function agentIdentityAuth(req, res, next) {
  const agentId = req.headers['x-agent-id'];
  const agentToken = req.headers['x-agent-token'];

  if (!agentId || !agentToken) return next();

  const cacheKey = `agent:${agentId}`;
  let agent = await redis.get(cacheKey);

  if (!agent) {
    const result = await db.query(
      `SELECT ai.id, ai.user_id, ai.name, ai.token_hash, ai.permissions,
              ai.revoked_at, u.is_active
       FROM agent_identities ai
       JOIN users u ON ai.user_id = u.id
       WHERE ai.id = $1`,
      [agentId]
    );
    if (result.rows.length === 0) {
      return next(new AuthenticationError('Unknown agent identity'));
    }
    agent = result.rows[0];
    await redis.set(cacheKey, agent, 120);
  }

  if (agent.revoked_at) {
    return next(new AuthenticationError('Agent identity revoked'));
  }
  if (!agent.is_active) {
    return next(new AuthenticationError('Agent owner account disabled'));
  }

  const { hashSecret } = require('../lib/security');
  const tokenHash = hashSecret(agentToken);
  const { timingSafeEqual } = require('../lib/security');
  if (!timingSafeEqual(tokenHash, agent.token_hash)) {
    return next(new AuthenticationError('Invalid agent token'));
  }

  db.query('UPDATE agent_identities SET last_used = NOW() WHERE id = $1', [agent.id]).catch(() => {});

  req.agent = {
    id: agent.id,
    userId: agent.user_id,
    name: agent.name,
    permissions: agent.permissions || [],
  };

  logger.debug('Agent identity verified', { agentId: agent.id });
  next();
}

function requireAgentPermission(permission) {
  return (req, res, next) => {
    if (!req.agent) {
      return next(new AuthenticationError('Agent authentication required'));
    }
    if (!req.agent.permissions.includes(permission) && !req.agent.permissions.includes('admin')) {
      return next(new AuthorizationError(`Agent missing permission: ${permission}`));
    }
    next();
  };
}

module.exports = { agentIdentityAuth, requireAgentPermission };
