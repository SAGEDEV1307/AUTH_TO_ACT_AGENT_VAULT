'use strict';

// MCP HTTP/SSE endpoint handler (mounted in Express)
const { v4: uuidv4 } = require('uuid');
const mcpService = require('../services/mcp/server');
const { authenticateMCPRequest } = require('./auth-handler');
const { createSession, refreshSession, destroySession } = require('./session-manager');
const { registerAllTools } = require('./tool-registry');
const logger = require('../lib/logger');

// Initialize tools on first import
registerAllTools();

// SSE stream handler — clients connect here for streaming
async function sseHandler(req, res) {
  try {
    const auth = await authenticateMCPRequest(req);
    const session = await createSession(auth.userId, { remoteAddress: req.ip });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-MCP-Session', session.id);
    res.flushHeaders();

    // Send initialized event
    const initMsg = await mcpService.handleRequest(session.id, {
      jsonrpc: '2.0', id: 1,
      method: 'initialize',
      params: { clientInfo: { name: 'remote-client' }, protocolVersion: '2024-11-05' },
    });
    res.write(`data: ${JSON.stringify(initMsg)}\n\n`);

    // Keep-alive ping
    const ping = setInterval(() => {
      res.write(': ping\n\n');
      refreshSession(session.id).catch(() => {});
    }, 30000);

    req.on('close', () => {
      clearInterval(ping);
      destroySession(session.id).catch(() => {});
      mcpService.removeSession(session.id);
    });

    // Store send function for POST handler to use
    req.mcpSessionId = session.id;
    req.mcpSend = (msg) => res.write(`data: ${JSON.stringify(msg)}\n\n`);

  } catch (err) {
    logger.warn('MCP SSE auth failed', { error: err.message });
    res.status(401).json({ error: err.message });
  }
}

// POST handler — receive JSON-RPC messages, respond via SSE
async function messageHandler(req, res) {
  try {
    const auth = await authenticateMCPRequest(req);
    const sessionId = req.headers['x-mcp-session'];
    if (!sessionId) return res.status(400).json({ error: 'x-mcp-session header required' });

    const message = req.body;
    const response = await mcpService.handleRequest(sessionId, message);
    res.json(response);
  } catch (err) {
    logger.warn('MCP message handler error', { error: err.message });
    res.status(err.statusCode || 500).json({ error: err.message });
  }
}

module.exports = { sseHandler, messageHandler };
