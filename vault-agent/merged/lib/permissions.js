'use strict';

const { PERMISSIONS, ROLES, ROLE_PERMISSIONS } = require('./constants');
const db = require('./database');
const redis = require('./redis');
const logger = require('./logger');

const CACHE_TTL = 300; // 5 minutes

async function getUserPermissions(userId) {
  const cacheKey = `perms:${userId}`;
  const cached = await redis.get(cacheKey);
  if (cached) return cached;

  const result = await db.query(
    `SELECT p.name FROM permissions p
     JOIN user_permissions up ON p.id = up.permission_id
     WHERE up.user_id = $1 AND up.revoked_at IS NULL
     UNION
     SELECT p.name FROM permissions p
     JOIN role_permissions rp ON p.id = rp.permission_id
     JOIN user_roles ur ON rp.role_id = ur.role_id
     WHERE ur.user_id = $1`,
    [userId]
  );

  const perms = result.rows.map(r => r.name);
  await redis.set(cacheKey, perms, CACHE_TTL);
  return perms;
}

async function hasPermission(userId, permission) {
  const perms = await getUserPermissions(userId);
  return perms.includes(permission) || perms.includes(PERMISSIONS.ADMIN);
}

async function requirePermission(userId, permission) {
  const allowed = await hasPermission(userId, permission);
  if (!allowed) {
    const { AuthorizationError } = require('./errors');
    throw new AuthorizationError(`Missing required permission: ${permission}`);
  }
}

async function grantPermission(userId, permission, grantedBy) {
  const permResult = await db.query(
    `SELECT id FROM permissions WHERE name = $1`, [permission]
  );
  if (permResult.rows.length === 0) {
    throw new Error(`Unknown permission: ${permission}`);
  }
  const permId = permResult.rows[0].id;

  await db.query(
    `INSERT INTO user_permissions (user_id, permission_id, granted_by, granted_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (user_id, permission_id) DO UPDATE
       SET revoked_at = NULL, granted_by = EXCLUDED.granted_by, granted_at = NOW()`,
    [userId, permId, grantedBy]
  );

  await redis.del(`perms:${userId}`);
  logger.info('Permission granted', { userId, permission, grantedBy });
}

async function revokePermission(userId, permission, revokedBy) {
  await db.query(
    `UPDATE user_permissions up
     SET revoked_at = NOW(), revoked_by = $3
     FROM permissions p
     WHERE up.permission_id = p.id
       AND up.user_id = $1
       AND p.name = $2`,
    [userId, permission, revokedBy]
  );
  await redis.del(`perms:${userId}`);
  logger.info('Permission revoked', { userId, permission, revokedBy });
}

async function getUserRole(userId) {
  const result = await db.query(
    `SELECT r.name FROM roles r
     JOIN user_roles ur ON r.id = ur.role_id
     WHERE ur.user_id = $1
     ORDER BY r.level DESC
     LIMIT 1`,
    [userId]
  );
  return result.rows[0]?.name || ROLES.USER;
}

async function setUserRole(userId, role, setBy) {
  if (!Object.values(ROLES).includes(role)) {
    throw new Error(`Invalid role: ${role}`);
  }
  await db.transaction(async (client) => {
    const roleResult = await client.query(`SELECT id FROM roles WHERE name = $1`, [role]);
    if (roleResult.rows.length === 0) throw new Error(`Role not found: ${role}`);
    const roleId = roleResult.rows[0].id;
    await client.query(`DELETE FROM user_roles WHERE user_id = $1`, [userId]);
    await client.query(
      `INSERT INTO user_roles (user_id, role_id, set_by, set_at) VALUES ($1, $2, $3, NOW())`,
      [userId, roleId, setBy]
    );
  });
  await redis.del(`perms:${userId}`);
  logger.info('User role updated', { userId, role, setBy });
}

module.exports = {
  getUserPermissions,
  hasPermission,
  requirePermission,
  grantPermission,
  revokePermission,
  getUserRole,
  setUserRole,
};
