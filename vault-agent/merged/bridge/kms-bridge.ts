// bridge/kms-bridge.ts
// Typed wrapper over lib/kms.js
// KMS stores secrets in PostgreSQL encrypted with AES-256-GCM

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const kmsLib = require('../lib/kms.js') as {
  storeSecret:    (userId: string, name: string, value: string, meta?: Record<string, unknown>) => Promise<{ id: string; name: string; created_at: Date }>;
  retrieveSecret: (userId: string, name: string) => Promise<{ id: string; name: string; value: string; metadata: Record<string, unknown> } | null>;
  deleteSecret:   (userId: string, name: string) => Promise<boolean>;
  listSecrets:    (userId: string) => Promise<Array<{ id: string; name: string; metadata: Record<string, unknown>; created_at: Date }>>;
  rotateEncryption: (userId: string) => Promise<number>;
};

export interface SecretRecord {
  id:        string;
  name:      string;
  value:     string;
  metadata:  Record<string, unknown>;
}

export const storeSecret    = (userId: string, name: string, value: string, meta?: Record<string, unknown>) =>
  kmsLib.storeSecret(userId, name, value, meta);

export const retrieveSecret = (userId: string, name: string): Promise<SecretRecord | null> =>
  kmsLib.retrieveSecret(userId, name);

export const deleteSecret   = (userId: string, name: string): Promise<boolean> =>
  kmsLib.deleteSecret(userId, name);

export const listSecrets    = (userId: string) =>
  kmsLib.listSecrets(userId);

export const rotateEncryption = (userId: string): Promise<number> =>
  kmsLib.rotateEncryption(userId);
