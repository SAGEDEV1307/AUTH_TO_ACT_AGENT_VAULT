'use strict';

const logger = require('../../lib/logger');

// MCP (Model Context Protocol) server implementation
// Exposes tools over SSE so external MCP clients can connect

class MCPServer {
  constructor() {
    this.tools = new Map();
    this.sessions = new Map();
  }

  registerTool(name, description, schema, handler) {
    this.tools.set(name, { name, description, schema, handler });
    logger.info('MCP tool registered', { name });
  }

  async handleRequest(sessionId, message) {
    const { method, params, id } = message;
    try {
      switch (method) {
        case 'initialize':
          return this.handleInitialize(sessionId, params, id);
        case 'tools/list':
          return this.handleToolsList(id);
        case 'tools/call':
          return this.handleToolCall(sessionId, params, id);
        case 'ping':
          return { jsonrpc: '2.0', id, result: {} };
        default:
          return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } };
      }
    } catch (err) {
      logger.error('MCP request error', { method, error: err.message });
      return { jsonrpc: '2.0', id, error: { code: -32000, message: err.message } };
    }
  }

  handleInitialize(sessionId, params, id) {
    this.sessions.set(sessionId, {
      clientInfo: params?.clientInfo,
      createdAt: new Date(),
      lastActivity: new Date(),
    });
    logger.info('MCP session initialized', { sessionId, client: params?.clientInfo?.name });
    return {
      jsonrpc: '2.0', id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'authorized-to-act', version: '1.0.0' },
      },
    };
  }

  handleToolsList(id) {
    const tools = Array.from(this.tools.values()).map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: t.schema,
    }));
    return { jsonrpc: '2.0', id, result: { tools } };
  }

  async handleToolCall(sessionId, params, id) {
    const { name, arguments: args } = params;
    const tool = this.tools.get(name);
    if (!tool) {
      return { jsonrpc: '2.0', id, error: { code: -32602, message: `Unknown tool: ${name}` } };
    }

    const session = this.sessions.get(sessionId);
    if (session) session.lastActivity = new Date();

    logger.info('MCP tool call', { sessionId, tool: name });
    const result = await tool.handler(args, { sessionId });
    return {
      jsonrpc: '2.0', id,
      result: {
        content: [{ type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result) }],
        isError: false,
      },
    };
  }

  getSessionCount() {
    return this.sessions.size;
  }

  removeSession(sessionId) {
    this.sessions.delete(sessionId);
    logger.info('MCP session removed', { sessionId });
  }
}

// Singleton
const mcpServer = new MCPServer();
module.exports = mcpServer;
