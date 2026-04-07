'use strict';

const { encrypt, decrypt, generateToken } = require('./security');
const db = require('./database');
const logger = require('./logger');

// KMS - Key Management Service
// Stores encrypted private keys / secrets in DB, retrieves and decrypts on demand

async function storeSecret(userId, name, secretValue, metadata = {}) {
  const encrypted = encrypt(secretValue);
  const result = await db.query(
    `INSERT INTO user_secrets (user_id, name, encrypted_value, metadata, created_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (user_id, name) DO UPDATE
       SET encrypted_value = EXCLUDED.encrypted_value,
           metadata = EXCLUDED.metadata,
           updated_at = NOW()
     RETURNING id, name, created_at`,
    [userId, name, encrypted, JSON.stringify(metadata)]
  );
  logger.info('Secret stored', { userId, name });
  return result.rows[0];
}

async function retrieveSecret(userId, name) {
  const result = await db.query(
    `SELECT id, name, encrypted_value, metadata FROM user_secrets
     WHERE user_id = $1 AND name = $2 AND deleted_at IS NULL`,
    [userId, name]
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    id: row.id,
    name: row.name,
    value: decrypt(row.encrypted_value),
    metadata: row.metadata,
  };
}

async function deleteSecret(userId, name) {
  const result = await db.query(
    `UPDATE user_secrets SET deleted_at = NOW()
     WHERE user_id = $1 AND name = $2 AND deleted_at IS NULL
     RETURNING id`,
    [userId, name]
  );
  return result.rowCount > 0;
}

async function listSecrets(userId) {
  const result = await db.query(
    `SELECT id, name, metadata, created_at, updated_at
     FROM user_secrets
     WHERE user_id = $1 AND deleted_at IS NULL
     ORDER BY name`,
    [userId]
  );
  return result.rows;
}

async function rotateEncryption(userId) {
  // Re-encrypt all secrets for a user (used after key rotation)
  const secrets = await db.query(
    `SELECT id, encrypted_value FROM user_secrets
     WHERE user_id = $1 AND deleted_at IS NULL`,
    [userId]
  );
  let rotated = 0;
  for (const row of secrets.rows) {
    const plaintext = decrypt(row.encrypted_value);
    const reEncrypted = encrypt(plaintext);
    await db.query(
      `UPDATE user_secrets SET encrypted_value = $1, updated_at = NOW() WHERE id = $2`,
      [reEncrypted, row.id]
    );
    rotated++;
  }
  logger.info('Secrets re-encrypted', { userId, count: rotated });
  return rotated;
}

module.exports = { storeSecret, retrieveSecret, deleteSecret, listSecrets, rotateEncryption };
