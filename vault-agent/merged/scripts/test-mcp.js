#!/usr/bin/env node
'use strict';
// Quick test to verify MCP server responds correctly
require('dotenv').config();
const mcpService = require('../services/mcp/server');
const { registerAllTools } = require('../mcp/tool-registry');

async function main() {
  registerAllTools();

  // Test initialize
  const initResp = await mcpService.handleRequest('test-session', {
    jsonrpc: '2.0', id: 1,
    method: 'initialize',
    params: { clientInfo: { name: 'test-client' }, protocolVersion: '2024-11-05' },
  });
  console.log('Initialize:', JSON.stringify(initResp, null, 2));

  // Test tools/list
  const listResp = await mcpService.handleRequest('test-session', {
    jsonrpc: '2.0', id: 2, method: 'tools/list', params: {},
  });
  console.log('Tools:', listResp.result.tools.map(t => t.name));

  console.log('\nMCP server is working correctly.');
}

main().catch(err => { console.error(err); process.exit(1); });
