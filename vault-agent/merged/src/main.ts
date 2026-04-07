// src/main.ts
// VaultAgent boot sequence — MCP → Telegram → TriggerEngine → Fastify HTTPS → Express HTTP

import 'dotenv/config';
import { logger }          from './logger.js';
import { initMCPServers, shutdownMCPServers } from './mcp-manager.js';
import { startCommunication }  from './communication.js';
import { buildFastifyServer }  from './https-server.js';
import { ModuleLoader }        from './module-system.js';
import { TriggerEngine }       from './module-system.js';
import { createModuleAI }      from './brain.js';
import { join, dirname }       from 'path';
import { fileURLToPath }       from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  logger.info('VaultAgent starting…');

  // 1. MCP servers
  try {
    await initMCPServers();
    logger.info('MCP servers initialised');
  } catch (err) {
    logger.warn('MCP init failed (non-fatal): ' + String(err));
  }

  // 2. Telegram + comms
  try {
    await startCommunication();
    logger.info('Communication layer started');
  } catch (err) {
    logger.warn('Comms start failed (non-fatal): ' + String(err));
  }

  // 3. Trigger engine + agent modules
  const ai     = createModuleAI();
  const engine = new TriggerEngine(ai);
  const loader = new ModuleLoader(join(__dirname, 'agent-modules'));
  const mods   = await loader.loadAll();
  mods.forEach(m => engine.register(m));
  logger.info(`TriggerEngine: ${mods.length} module(s) loaded`);
  // Export engine so Fastify routes can dispatch to it
  (globalThis as Record<string, unknown>)['triggerEngine'] = engine;

  // 4. Fastify HTTPS (autonomous agent API — port 8443)
  try {
    const fastify = await buildFastifyServer();
    await fastify.listen({ port: 8443, host: '0.0.0.0' });
    logger.info('Fastify HTTPS listening on :8443');
  } catch (err) {
    logger.warn('Fastify start failed (non-fatal): ' + String(err));
  }

  // 5. Express HTTP (dashboard + REST API + MCP SSE — port 3000)
  try {
    const { default: startExpressServer } = await import('../server.js' as string);
    if (typeof startExpressServer === 'function') await startExpressServer();
    logger.info('Express HTTP listening on :3000');
  } catch (err) {
    logger.warn('Express start failed (non-fatal): ' + String(err));
  }

  logger.info('VaultAgent fully started ✓');
}

// Graceful shutdown
async function shutdown(signal: string): Promise<void> {
  logger.info(`${signal} received — shutting down`);
  await shutdownMCPServers();
  process.exit(0);
}

process.on('SIGINT',  () => { void shutdown('SIGINT');  });
process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
process.on('uncaughtException',   (err) => { logger.exception(err); });
process.on('unhandledRejection',  (reason) => { logger.error('Unhandled rejection: ' + String(reason)); });

void main();
