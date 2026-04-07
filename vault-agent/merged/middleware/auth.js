'use strict';

const { extractBearerToken, getUserFromToken } = require('../lib/auth');
const { AuthenticationError } = require('../lib/errors');
const db = require('../lib/database');
const redis = require('../lib/redis');
const logger = require('../lib/logger');

// Attach user to req if token is valid. Does NOT block if missing.
async function attachUser(req, res, next) {
  const token = extractBearerToken(req);
  if (!token) return next();
  try {
    const user = await getUserFromToken(token);
    // Sync user to DB (upsert)
    const result = await db.query(
      `INSERT INTO users (auth0_id, email, name, picture, last_seen)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (auth0_id) DO UPDATE
         SET email = EXCLUDED.email,
             name = EXCLUDED.name,
             picture = EXCLUDED.picture,
             last_seen = NOW()
       RETURNING id, auth0_id, email, name, is_active`,
      [user.id, user.email, user.name, user.picture]
    );
    req.user = { ...user, dbId: result.rows[0].id, isActive: result.rows[0].is_active };
    next();
  } catch (err) {
    logger.warn('attachUser failed', { error: err.message });
    next(); // don't block — requireAuth will catch it
  }
}

// Block if user not authenticated
function requireAuth(req, res, next) {
  if (!req.user) {
    return next(new AuthenticationError());
  }
  if (!req.user.isActive) {
    return next(new AuthenticationError('Account is disabled'));
  }
  next();
}

// Block if user is not admin
async function requireAdmin(req, res, next) {
  if (!req.user) return next(new AuthenticationError());
  try {
    const { hasPermission } = require('../lib/permissions');
    const isAdmin = await hasPermission(req.user.dbId, 'admin');
    if (!isAdmin) return next(new (require('../lib/errors').AuthorizationError)('Admin access required'));
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { attachUser, requireAuth, requireAdmin };
