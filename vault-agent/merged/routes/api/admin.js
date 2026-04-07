'use strict';

const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../../middleware/auth');
const { apiKeyAuth } = require('../../middleware/apiKey');
const { grantPermission, revokePermission, setUserRole, getUserPermissions } = require('../../lib/permissions');
const { ValidationError, NotFoundError } = require('../../lib/errors');
const db = require('../../lib/database');
const redis = require('../../lib/redis');
const logger = require('../../lib/logger');

// All admin routes require auth + admin permission
router.use(apiKeyAuth, requireAuth, requireAdmin);

// GET /api/admin/users — list all users
router.get('/users', async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = (page - 1) * limit;
    const search = req.query.search;

    const conditions = [];
    const params = [];

    if (search) {
      conditions.push(`(email ILIKE $${params.length + 1} OR name ILIKE $${params.length + 1})`);
      params.push(`%${search}%`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [users, count] = await Promise.all([
      db.query(
        `SELECT id, auth0_id, email, name, picture, is_active, created_at, last_seen
         FROM users ${where} ORDER BY created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      ),
      db.query(`SELECT COUNT(*) FROM users ${where}`, params),
    ]);

    res.json({ users: users.rows, total: parseInt(count.rows[0].count), page, limit });
  } catch (err) { next(err); }
});

// GET /api/admin/users/:id — get single user with permissions
router.get('/users/:id', async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT id, auth0_id, email, name, picture, is_active, created_at, last_seen
       FROM users WHERE id = $1`,
      [req.params.id]
    );
    if (!result.rows[0]) throw new NotFoundError('User');
    const permissions = await getUserPermissions(req.params.id);
    res.json({ user: result.rows[0], permissions });
  } catch (err) { next(err); }
});

// PATCH /api/admin/users/:id — update user active status
router.patch('/users/:id', async (req, res, next) => {
  try {
    const { is_active } = req.body;
    if (typeof is_active !== 'boolean') throw new ValidationError('is_active must be a boolean');
    await db.query(`UPDATE users SET is_active = $1 WHERE id = $2`, [is_active, req.params.id]);
    await redis.del(`perms:${req.params.id}`);
    logger.info('User active status updated', { targetUser: req.params.id, is_active, by: req.user.dbId });
    res.json({ message: 'User updated' });
  } catch (err) { next(err); }
});

// POST /api/admin/permissions — grant a permission
router.post('/permissions', async (req, res, next) => {
  try {
    const { userId, permission } = req.body;
    if (!userId || !permission) throw new ValidationError('userId and permission are required');
    await grantPermission(userId, permission, req.user.dbId);
    res.json({ message: `Permission '${permission}' granted to user ${userId}` });
  } catch (err) { next(err); }
});

// DELETE /api/admin/permissions — revoke a permission
router.delete('/permissions', async (req, res, next) => {
  try {
    const { userId, permission } = req.body;
    if (!userId || !permission) throw new ValidationError('userId and permission are required');
    await revokePermission(userId, permission, req.user.dbId);
    res.json({ message: `Permission '${permission}' revoked from user ${userId}` });
  } catch (err) { next(err); }
});

// POST /api/admin/roles — set a user's role
router.post('/roles', async (req, res, next) => {
  try {
    const { userId, role } = req.body;
    if (!userId || !role) throw new ValidationError('userId and role are required');
    await setUserRole(userId, role, req.user.dbId);
    res.json({ message: `Role '${role}' assigned to user ${userId}` });
  } catch (err) { next(err); }
});

// GET /api/admin/stats — platform stats
router.get('/stats', async (req, res, next) => {
  try {
    const [users, runs, txs, keys] = await Promise.all([
      db.query(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_active) as active FROM users`),
      db.query(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='completed') as completed,
                COUNT(*) FILTER (WHERE status='failed') as failed FROM agent_runs`),
      db.query(`SELECT COUNT(*) as total FROM transactions`),
      db.query(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE revoked_at IS NULL) as active FROM api_keys`),
    ]);
    res.json({
      users: users.rows[0],
      agentRuns: runs.rows[0],
      transactions: txs.rows[0],
      apiKeys: keys.rows[0],
    });
  } catch (err) { next(err); }
});

module.exports = router;
