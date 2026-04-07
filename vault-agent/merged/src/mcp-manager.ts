// src/mcp/mcp-manager.ts
// ================================================================
// MODULE 12: MCP SERVER MANAGER
// Manages connections to all MCP servers:
//  - DeepSeek MCP server (deepseek-mcp-server via npx)
//  - Ollama MCP bridge (local DeepSeek-R1)
//  - Filesystem MCP server
//  - Memory MCP server
// Agent can invoke any tool from any MCP server.
// ================================================================

import { Client }               from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { config }  from './config.js';
import { Logger }  from './logger.js';

const log = new Logger('mcp-manager');

// ── MCP CLIENT REGISTRY ────────────────────────────────────────────
interface MCPConnection {
  name:      string;
  client:    Client;
  transport: StdioClientTransport | StreamableHTTPClientTransport;
  tools:     string[];
  status:    'connected' | 'disconnected' | 'error';
}

const connections = new Map<string, MCPConnection>();

// ── CONNECT TO DEEPSEEK MCP (stdio via npx) ───────────────────────
async function connectDeepSeekMCP(): Promise<void> {
  if (!config.llm.deepseekKey) {
    log.warn('SYSTEM_START', 'DeepSeek MCP: no API key — skipping', {});
    return;
  }

  const transport = new StdioClientTransport({
    command: 'npx',
    args:    ['-y', 'deepseek-mcp-server'],
    env:     {
      ...process.env,
      DEEPSEEK_API_KEY:                config.llm.deepseekKey,
      DEEPSEEK_BASE_URL:               'https://api.deepseek.com',
      DEEPSEEK_DEFAULT_MODEL:          config.llm.deepseekModel,
      DEEPSEEK_ENABLE_REASONER_FALLBACK: 'true',
      DEEPSEEK_FALLBACK_MODEL:         'deepseek-chat',
      CONVERSATION_MAX_MESSAGES:       '200',
    } as NodeJS.ProcessEnv,
  });

  const client = new Client(
    { name: 'autonomous-agent', version: '1.0.0' },
    { capabilities: { tools: {} } },
  );

  try {
    await client.connect(transport);
    const toolList = await client.listTools();
    const toolNames = toolList.tools.map(t => t.name);

    connections.set('deepseek', {
      name:      'deepseek',
      client,
      transport,
      tools:     toolNames,
      status:    'connected',
    });

    log.info('SYSTEM_START', `DeepSeek MCP connected — ${toolNames.length} tools`, {
      tools: toolNames,
    });
  } catch (err) {
    log.exception(err, { context: 'connect_deepseek_mcp' });
  }
}

// ── CONNECT TO OLLAMA MCP (stdio) ─────────────────────────────────
async function connectOllamaMCP(): Promise<void> {
  // Ollama MCP bridge — connects local Ollama to MCP protocol
  // https://github.com/patruff/ollama-mcp-bridge
  const transport = new StdioClientTransport({
    command: 'npx',
    args:    ['-y', 'ollama-mcp-server'],
    env:     {
      ...process.env,
      OLLAMA_HOST: config.llm.ollamaHost,
    } as NodeJS.ProcessEnv,
  });

  const client = new Client(
    { name: 'autonomous-agent-ollama', version: '1.0.0' },
    { capabilities: { tools: {} } },
  );

  try {
    await client.connect(transport);
    const toolList  = await client.listTools();
    const toolNames = toolList.tools.map(t => t.name);

    connections.set('ollama', {
      name:   'ollama',
      client,
      transport,
      tools:  toolNames,
      status: 'connected',
    });

    log.info('SYSTEM_START', `Ollama MCP connected — ${toolNames.length} tools`, {
      tools: toolNames,
      model: config.llm.ollamaModel,
    });
  } catch (err) {
    log.exception(err, { context: 'connect_ollama_mcp' });
  }
}

// ── CONNECT TO FILESYSTEM MCP ─────────────────────────────────────
async function connectFilesystemMCP(): Promise<void> {
  const transport = new StdioClientTransport({
    command: 'npx',
    args:    ['-y', '@modelcontextprotocol/server-filesystem', './data'],
    env:     process.env as NodeJS.ProcessEnv,
  });

  const client = new Client(
    { name: 'autonomous-agent-fs', version: '1.0.0' },
    { capabilities: { tools: {} } },
  );

  try {
    await client.connect(transport);
    const toolList  = await client.listTools();
    const toolNames = toolList.tools.map(t => t.name);

    connections.set('filesystem', {
      name:   'filesystem',
      client,
      transport,
      tools:  toolNames,
      status: 'connected',
    });

    log.info('SYSTEM_START', `Filesystem MCP connected — ${toolNames.length} tools`, {
      tools: toolNames,
    });
  } catch (err) {
    log.exception(err, { context: 'connect_filesystem_mcp' });
  }
}

// ── CONNECT TO MEMORY MCP ─────────────────────────────────────────
async function connectMemoryMCP(): Promise<void> {
  const transport = new StdioClientTransport({
    command: 'npx',
    args:    ['-y', '@modelcontextprotocol/server-memory'],
    env:     process.env as NodeJS.ProcessEnv,
  });

  const client = new Client(
    { name: 'autonomous-agent-memory', version: '1.0.0' },
    { capabilities: { tools: {} } },
  );

  try {
    await client.connect(transport);
    const toolList  = await client.listTools();
    const toolNames = toolList.tools.map(t => t.name);

    connections.set('memory', {
      name:   'memory',
      client,
      transport,
      tools:  toolNames,
      status: 'connected',
    });

    log.info('SYSTEM_START', `Memory MCP connected — ${toolNames.length} tools`, {
      tools: toolNames,
    });
  } catch (err) {
    log.exception(err, { context: 'connect_memory_mcp' });
  }
}

// ── CALL AN MCP TOOL ──────────────────────────────────────────────
export async function callMCPTool(
  serverName: string,
  toolName:   string,
  args:       Record<string, unknown>,
): Promise<unknown> {
  const connection = connections.get(serverName);
  if (!connection) {
    throw new Error(`MCP server not connected: ${serverName}`);
  }

  log.info('TOOL_CALL', `MCP tool: ${serverName}/${toolName}`, { args: JSON.stringify(args).slice(0, 200) });

  try {
    const result = await connection.client.callTool({
      name:      toolName,
      arguments: args,
    });

    log.info('TOOL_RESULT', `MCP tool complete: ${serverName}/${toolName}`, {});
    return result;
  } catch (err) {
    log.exception(err, { server: serverName, tool: toolName });
    throw err;
  }
}

// ── LIST ALL AVAILABLE TOOLS ──────────────────────────────────────
export function listAllMCPTools(): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const [name, conn] of connections.entries()) {
    result[name] = conn.tools;
  }
  return result;
}

// ── GET CONNECTION STATUS ─────────────────────────────────────────
export function getMCPStatus(): Array<{ name: string; status: string; toolCount: number }> {
  return Array.from(connections.values()).map(c => ({
    name:      c.name,
    status:    c.status,
    toolCount: c.tools.length,
  }));
}

// ── CALL DEEPSEEK VIA MCP ─────────────────────────────────────────
export async function callDeepSeekViaMCP(
  prompt:  string,
  model?:  string,
): Promise<string> {
  const conn = connections.get('deepseek');
  if (!conn) throw new Error('DeepSeek MCP not connected');

  const result = await callMCPTool('deepseek', 'chat', {
    messages: [{ role: 'user', content: prompt }],
    model:    model ?? config.llm.deepseekModel,
  });

  return typeof result === 'string' ? result : JSON.stringify(result);
}

// ── CALL OLLAMA VIA MCP ───────────────────────────────────────────
export async function callOllamaViaMCP(
  prompt: string,
  model?: string,
  think?: boolean,
): Promise<string> {
  const conn = connections.get('ollama');
  if (!conn) throw new Error('Ollama MCP not connected');

  const result = await callMCPTool('ollama', 'chat_completion', {
    model:    model ?? config.llm.ollamaModel,
    messages: [{ role: 'user', content: prompt }],
    think:    think ?? false,
  });

  return typeof result === 'string' ? result : JSON.stringify(result);
}

// ── INIT ALL MCP CONNECTIONS ──────────────────────────────────────
export async function initMCPServers(): Promise<void> {
  log.info('SYSTEM_START', 'Initializing MCP servers...', {});

  await Promise.allSettled([
    connectDeepSeekMCP(),
    connectOllamaMCP(),
    connectFilesystemMCP(),
    connectMemoryMCP(),
  ]);

  const connected = Array.from(connections.values()).filter(c => c.status === 'connected');
  log.info('SYSTEM_START', `MCP init complete: ${connected.length} servers connected`, {
    servers: connected.map(c => c.name),
  });
}

// ── GRACEFUL SHUTDOWN ────────────────────────────────────────────
export async function shutdownMCPServers(): Promise<void> {
  for (const [name, conn] of connections.entries()) {
    try {
      await conn.transport.close();
      log.info('SYSTEM_STOP', `MCP server disconnected: ${name}`, {});
    } catch (err) {
      log.exception(err, { context: 'mcp_shutdown', server: name });
    }
  }
  connections.clear();
}
