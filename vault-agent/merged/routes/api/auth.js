'use strict';

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../../middleware/auth');
const db = require('../../lib/database');
const logger = require('../../lib/logger');

// GET /api/auth/me — return current user profile
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT id, auth0_id, email, name, picture, created_at, last_seen FROM users WHERE id = $1`,
      [req.user.dbId]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'User not found' });
    res.json({ user: result.rows[0] });
  } catch (err) { next(err); }
});

// GET /api/auth/permissions — return current user's permissions
router.get('/permissions', requireAuth, async (req, res, next) => {
  try {
    const { getUserPermissions, getUserRole } = require('../../lib/permissions');
    const [permissions, role] = await Promise.all([
      getUserPermissions(req.user.dbId),
      getUserRole(req.user.dbId),
    ]);
    res.json({ permissions, role });
  } catch (err) { next(err); }
});

// POST /api/auth/logout — invalidate session/cache
router.post('/logout', requireAuth, async (req, res, next) => {
  try {
    const redis = require('../../lib/redis');
    await redis.del(`perms:${req.user.dbId}`);
    logger.info('User logged out', { userId: req.user.dbId });
    res.json({ message: 'Logged out successfully' });
  } catch (err) { next(err); }
});

module.exports = router;
