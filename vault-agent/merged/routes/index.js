'use strict';

const express = require('express');
const router = express.Router();

const authRoutes      = require('./api/auth');
const agentRoutes     = require('./api/agent');
const blockchainRoutes = require('./api/blockchain');
const keysRoutes      = require('./api/keys');
const adminRoutes     = require('./api/admin');
const mcpServer       = require('../mcp/server');
const db              = require('../lib/database');
const redis           = require('../lib/redis');

// Health check — no auth required
router.get('/health', async (req, res) => {
  try {
    const [dbOk, redisOk] = await Promise.allSettled([
      db.healthCheck(),
      redis.healthCheck(),
    ]);
    const status = dbOk.status === 'fulfilled' && redisOk.status === 'fulfilled' ? 'ok' : 'degraded';
    res.status(status === 'ok' ? 200 : 503).json({
      status,
      db: dbOk.status === 'fulfilled' ? 'ok' : 'error',
      redis: redisOk.status === 'fulfilled' ? 'ok' : 'error',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  } catch {
    res.status(503).json({ status: 'error' });
  }
});

// API routes
router.use('/api/auth',       authRoutes);
router.use('/api/agent',      agentRoutes);
router.use('/api/blockchain', blockchainRoutes);
router.use('/api/keys',       keysRoutes);
router.use('/api/admin',      adminRoutes);

// MCP endpoints
router.get('/mcp/sse',        mcpServer.sseHandler);
router.post('/mcp/message',   mcpServer.messageHandler);

module.exports = router;
