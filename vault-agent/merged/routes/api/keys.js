'use strict';

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../../middleware/auth');
const { apiKeyAuth } = require('../../middleware/apiKey');
const { generateApiKey, hashSecret } = require('../../lib/security');
const { requirePermission } = require('../../lib/permissions');
const { PERMISSIONS } = require('../../lib/constants');
const { ValidationError, NotFoundError } = require('../../lib/errors');
const db = require('../../lib/database');
const redis = require('../../lib/redis');

// GET /api/keys — list user's API keys
router.get('/', apiKeyAuth, requireAuth, async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT id, name, permissions, last_used, created_at, revoked_at
       FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.user.dbId]
    );
    res.json({ keys: result.rows });
  } catch (err) { next(err); }
});

// POST /api/keys — create a new API key
router.post('/', apiKeyAuth, requireAuth, async (req, res, next) => {
  try {
    const { name, permissions = [] } = req.body;
    if (!name || name.trim().length === 0) throw new ValidationError('name is required');
    if (name.length > 64) throw new ValidationError('name must be 64 characters or less');

    const rawKey = generateApiKey();
    const keyHash = hashSecret(rawKey);

    const result = await db.query(
      `INSERT INTO api_keys (user_id, name, key_hash, permissions, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING id, name, permissions, created_at`,
      [req.user.dbId, name.trim(), keyHash, JSON.stringify(permissions)]
    );

    res.status(201).json({
      ...result.rows[0],
      key: rawKey, // Only shown once — user must save this
      message: 'Save this key — it will not be shown again',
    });
  } catch (err) { next(err); }
});

// DELETE /api/keys/:id — revoke an API key
router.delete('/:id', apiKeyAuth, requireAuth, async (req, res, next) => {
  try {
    const result = await db.query(
      `UPDATE api_keys SET revoked_at = NOW()
       WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL
       RETURNING id, key_hash`,
      [req.params.id, req.user.dbId]
    );
    if (result.rowCount === 0) throw new NotFoundError('API key');

    // Invalidate cache
    await redis.del(`apikey:${result.rows[0].key_hash}`);
    res.json({ message: 'API key revoked' });
  } catch (err) { next(err); }
});

module.exports = router;
