'use strict';

const { hashSecret, timingSafeEqual } = require('../lib/security');
const { AuthenticationError } = require('../lib/errors');
const db = require('../lib/database');
const redis = require('../lib/redis');
const logger = require('../lib/logger');

async function apiKeyAuth(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return next();

  const cacheKey = `apikey:${hashSecret(apiKey)}`;
  let keyRecord = await redis.get(cacheKey);

  if (!keyRecord) {
    const hash = hashSecret(apiKey);
    const result = await db.query(
      `SELECT ak.id, ak.user_id, ak.name, ak.permissions, ak.revoked_at,
              u.auth0_id, u.email, u.name as user_name, u.is_active
       FROM api_keys ak
       JOIN users u ON ak.user_id = u.id
       WHERE ak.key_hash = $1`,
      [hash]
    );
    if (result.rows.length === 0) {
      return next(new AuthenticationError('Invalid API key'));
    }
    keyRecord = result.rows[0];
    await redis.set(cacheKey, keyRecord, 300); // cache 5 min
  }

  if (keyRecord.revoked_at) {
    return next(new AuthenticationError('API key has been revoked'));
  }
  if (!keyRecord.is_active) {
    return next(new AuthenticationError('Account is disabled'));
  }

  // Update last used (fire and forget)
  db.query('UPDATE api_keys SET last_used = NOW() WHERE id = $1', [keyRecord.id]).catch(() => {});

  req.user = {
    id: keyRecord.auth0_id,
    dbId: keyRecord.user_id,
    email: keyRecord.email,
    name: keyRecord.user_name,
    isActive: keyRecord.is_active,
    apiKeyId: keyRecord.id,
    apiKeyName: keyRecord.name,
    apiKeyPermissions: keyRecord.permissions || [],
  };

  logger.debug('API key auth success', { keyId: keyRecord.id, userId: keyRecord.user_id });
  next();
}

module.exports = { apiKeyAuth };
