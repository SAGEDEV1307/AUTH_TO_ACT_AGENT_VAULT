'use strict';

const { ethers } = require('ethers');
const { getWalletForUser } = require('./wallet');
const { getProvider } = require('./provider');
const { getGasPrice } = require('./gas');
const db = require('../../lib/database');
const logger = require('../../lib/logger');
const { BlockchainError } = require('../../lib/errors');

async function sendTransaction(userId, { to, value, data = '0x', chainId }) {
  if (!ethers.isAddress(to)) throw new BlockchainError('Invalid recipient address');

  const wallet = await getWalletForUser(userId, chainId);
  const feeData = await wallet.provider.getFeeData();

  const tx = {
    to,
    value: ethers.parseEther(String(value)),
    data,
    maxFeePerGas: feeData.maxFeePerGas,
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
  };

  logger.info('Sending transaction', { userId, to, value, chainId });

  let sentTx;
  try {
    sentTx = await wallet.sendTransaction(tx);
  } catch (err) {
    throw new BlockchainError(`Transaction failed: ${err.message}`);
  }

  // Record in DB
  const dbRecord = await db.query(
    `INSERT INTO transactions (user_id, tx_hash, from_address, to_address, value_ether, chain_id, status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending', NOW())
     RETURNING id`,
    [userId, sentTx.hash, wallet.address, to, value, chainId]
  );

  // Wait for confirmation async
  sentTx.wait(1).then(receipt => {
    const status = receipt.status === 1 ? 'confirmed' : 'failed';
    db.query(
      `UPDATE transactions SET status = $1, block_number = $2, gas_used = $3, confirmed_at = NOW()
       WHERE tx_hash = $4`,
      [status, receipt.blockNumber, receipt.gasUsed.toString(), sentTx.hash]
    ).catch(err => logger.error('Failed to update tx status', { error: err.message }));
  }).catch(err => {
    logger.error('Transaction confirmation error', { hash: sentTx.hash, error: err.message });
  });

  return {
    txHash: sentTx.hash,
    from: wallet.address,
    to,
    value,
    chainId,
    status: 'pending',
    dbId: dbRecord.rows[0].id,
  };
}

async function getTransactionHistory(userId, { chainId, page = 1, limit = 20 } = {}) {
  const offset = (page - 1) * limit;
  const conditions = ['user_id = $1'];
  const params = [userId];

  if (chainId) {
    conditions.push(`chain_id = $${params.length + 1}`);
    params.push(chainId);
  }

  const result = await db.query(
    `SELECT tx_hash, from_address, to_address, value_ether, chain_id, status,
            block_number, gas_used, created_at, confirmed_at
     FROM transactions
     WHERE ${conditions.join(' AND ')}
     ORDER BY created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  const countResult = await db.query(
    `SELECT COUNT(*) FROM transactions WHERE ${conditions.join(' AND ')}`,
    params
  );

  return {
    transactions: result.rows,
    total: parseInt(countResult.rows[0].count),
    page,
    limit,
  };
}

async function getTransactionByHash(txHash, chainId) {
  const provider = getProvider(chainId);
  const [tx, receipt] = await Promise.all([
    provider.getTransaction(txHash),
    provider.getTransactionReceipt(txHash),
  ]);
  if (!tx) return null;
  return {
    hash: tx.hash,
    from: tx.from,
    to: tx.to,
    value: ethers.formatEther(tx.value),
    gasLimit: tx.gasLimit.toString(),
    blockNumber: tx.blockNumber,
    status: receipt ? (receipt.status === 1 ? 'confirmed' : 'failed') : 'pending',
    gasUsed: receipt?.gasUsed.toString(),
  };
}

module.exports = { sendTransaction, getTransactionHistory, getTransactionByHash };
