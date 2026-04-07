'use strict';

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../../middleware/auth');
const { apiKeyAuth } = require('../../middleware/apiKey');
const { requirePermission } = require('../../lib/permissions');
const { PERMISSIONS } = require('../../lib/constants');
const { ValidationError } = require('../../lib/errors');
const walletService = require('../../services/blockchain/wallet');
const txService = require('../../services/blockchain/transactions');
const gasService = require('../../services/blockchain/gas');

// GET /api/blockchain/balance — get ETH balance for user's wallet
router.get('/balance', apiKeyAuth, requireAuth, async (req, res, next) => {
  try {
    await requirePermission(req.user.dbId, PERMISSIONS.BLOCKCHAIN_READ);
    const chainId = parseInt(req.query.chainId) || parseInt(process.env.CHAIN_ID) || 1;
    const balance = await walletService.getWalletBalance(req.user.dbId, chainId);
    res.json(balance);
  } catch (err) { next(err); }
});

// GET /api/blockchain/transactions — get transaction history
router.get('/transactions', apiKeyAuth, requireAuth, async (req, res, next) => {
  try {
    await requirePermission(req.user.dbId, PERMISSIONS.BLOCKCHAIN_READ);
    const chainId = req.query.chainId ? parseInt(req.query.chainId) : null;
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const result = await txService.getTransactionHistory(req.user.dbId, { chainId, page, limit });
    res.json(result);
  } catch (err) { next(err); }
});

// GET /api/blockchain/tx/:hash — get a specific transaction
router.get('/tx/:hash', apiKeyAuth, requireAuth, async (req, res, next) => {
  try {
    await requirePermission(req.user.dbId, PERMISSIONS.BLOCKCHAIN_READ);
    const chainId = parseInt(req.query.chainId) || parseInt(process.env.CHAIN_ID) || 1;
    const tx = await txService.getTransactionByHash(req.params.hash, chainId);
    if (!tx) return res.status(404).json({ error: 'Transaction not found' });
    res.json(tx);
  } catch (err) { next(err); }
});

// GET /api/blockchain/gas — get current gas prices
router.get('/gas', apiKeyAuth, requireAuth, async (req, res, next) => {
  try {
    await requirePermission(req.user.dbId, PERMISSIONS.BLOCKCHAIN_READ);
    const chainId = parseInt(req.query.chainId) || parseInt(process.env.CHAIN_ID) || 1;
    const gas = await gasService.getGasPrice(chainId);
    res.json(gas);
  } catch (err) { next(err); }
});

// POST /api/blockchain/send — send ETH transaction
router.post('/send', apiKeyAuth, requireAuth, async (req, res, next) => {
  try {
    await requirePermission(req.user.dbId, PERMISSIONS.BLOCKCHAIN_SEND);
    const { to, value, chainId } = req.body;
    if (!to) throw new ValidationError('to address is required');
    if (!value) throw new ValidationError('value is required');
    const result = await txService.sendTransaction(req.user.dbId, {
      to, value: String(value),
      chainId: chainId || parseInt(process.env.CHAIN_ID) || 1,
    });
    res.json(result);
  } catch (err) { next(err); }
});

// POST /api/blockchain/wallet — create a new wallet
router.post('/wallet', apiKeyAuth, requireAuth, async (req, res, next) => {
  try {
    const chainId = parseInt(req.body.chainId) || parseInt(process.env.CHAIN_ID) || 1;
    const wallet = await walletService.createWallet(req.user.dbId, chainId);
    res.status(201).json(wallet);
  } catch (err) { next(err); }
});

module.exports = router;
