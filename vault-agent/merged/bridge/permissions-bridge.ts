// bridge/permissions-bridge.ts
// Typed wrapper over lib/permissions.js

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const permLib = require('../lib/permissions.js') as {
  getUserPermissions: (userId: string) => Promise<string[]>;
  hasPermission:      (userId: string, permission: string) => Promise<boolean>;
  requirePermission:  (userId: string, permission: string) => Promise<void>;
  grantPermission:    (userId: string, permission: string, grantedBy: string) => Promise<void>;
  revokePermission:   (userId: string, permission: string, revokedBy: string) => Promise<void>;
  getUserRole:        (userId: string) => Promise<string>;
  setUserRole:        (userId: string, role: string, setBy: string) => Promise<void>;
};

export const getUserPermissions = (userId: string): Promise<string[]> =>
  permLib.getUserPermissions(userId);

export const hasPermission = (userId: string, permission: string): Promise<boolean> =>
  permLib.hasPermission(userId, permission);

export const requirePermission = (userId: string, permission: string): Promise<void> =>
  permLib.requirePermission(userId, permission);

export const grantPermission = (userId: string, permission: string, grantedBy: string): Promise<void> =>
  permLib.grantPermission(userId, permission, grantedBy);

export const revokePermission = (userId: string, permission: string, revokedBy: string): Promise<void> =>
  permLib.revokePermission(userId, permission, revokedBy);

export const getUserRole = (userId: string): Promise<string> =>
  permLib.getUserRole(userId);

export const setUserRole = (userId: string, role: string, setBy: string): Promise<void> =>
  permLib.setUserRole(userId, role, setBy);
