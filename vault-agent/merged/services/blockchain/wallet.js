'use strict';

const { ethers } = require('ethers');
const { getProvider } = require('./provider');
const { decrypt } = require('../../lib/security');
const db = require('../../lib/database');
const logger = require('../../lib/logger');

async function getWalletForUser(userId, chainId) {
  const result = await db.query(
    `SELECT encrypted_private_key, address FROM user_wallets WHERE user_id = $1 LIMIT 1`,
    [userId]
  );
  if (result.rows.length === 0) throw new Error('No wallet found for user');
  const row = result.rows[0];
  const privateKey = decrypt(row.encrypted_private_key);
  const provider = getProvider(chainId);
  return new ethers.Wallet(privateKey, provider);
}

async function createWallet(userId, chainId) {
  const wallet = ethers.Wallet.createRandom();
  const { encrypt } = require('../../lib/security');
  const encryptedKey = encrypt(wallet.privateKey);

  const result = await db.query(
    `INSERT INTO user_wallets (user_id, address, encrypted_private_key, chain_id, created_at)
     VALUES ($1, $2, $3, $4, NOW())
     RETURNING id, address, created_at`,
    [userId, wallet.address, encryptedKey, chainId]
  );

  logger.info('Wallet created', { userId, address: wallet.address, chainId });
  return { id: result.rows[0].id, address: wallet.address, createdAt: result.rows[0].created_at };
}

async function getWalletBalance(userId, chainId) {
  const wallet = await getWalletForUser(userId, chainId);
  const balance = await wallet.provider.getBalance(wallet.address);
  return {
    address: wallet.address,
    wei: balance.toString(),
    ether: ethers.formatEther(balance),
  };
}

async function importWallet(userId, privateKey, chainId) {
  const { encrypt } = require('../../lib/security');
  let wallet;
  try {
    wallet = new ethers.Wallet(privateKey);
  } catch {
    throw new Error('Invalid private key');
  }
  const encryptedKey = encrypt(privateKey);
  const result = await db.query(
    `INSERT INTO user_wallets (user_id, address, encrypted_private_key, chain_id, imported, created_at)
     VALUES ($1, $2, $3, $4, true, NOW())
     ON CONFLICT (user_id, address) DO UPDATE SET chain_id = EXCLUDED.chain_id
     RETURNING id, address`,
    [userId, wallet.address, encryptedKey, chainId]
  );
  logger.info('Wallet imported', { userId, address: wallet.address });
  return { id: result.rows[0].id, address: wallet.address };
}

module.exports = { getWalletForUser, createWallet, getWalletBalance, importWallet };
