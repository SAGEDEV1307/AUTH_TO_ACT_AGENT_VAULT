// src/modules/https-server.ts
// ================================================================
// MODULE 11: HTTPS SERVER (Fastify)
// Full production HTTPS server using Fastify v5:
//  - TLS/HTTPS with auto-generated or custom certs
//  - JWT auth on all protected routes
//  - Helmet security headers
//  - Rate limiting
//  - IP blocklist + brute force protection
//  - CORS
//  - Request logging + audit trail
//  - All agent routes: task, status, hitl, logs, wallet, agents
// ================================================================

import Fastify, { FastifyRequest, FastifyReply } from 'fastify';
import helmet      from '@fastify/helmet';
import rateLimit   from '@fastify/rate-limit';
import fastifyJwt  from '@fastify/jwt';
import cors        from '@fastify/cors';
import fs          from 'fs';
import path        from 'path';
import { execSync } from 'child_process';
import { v4 as uuid } from 'uuid';
import { config }  from '../config.js';
import { Logger }  from './logger.js';
import { resolveHITLRequest, getPendingHITLRequests } from './hitl.js';
import { getRecentMemories, getActiveAgents, searchMemory } from './memory.js';
import { getLiveAgents, getLiveTeams }                from './agent-spawner.js';
import { listScheduledJobs, scheduleTask, cancelJob } from './scheduler.js';
import { getMCPStatus }                               from '../mcp/mcp-manager.js';

const log = new Logger('https-server');

// ── BRUTE FORCE TRACKER ───────────────────────────────────────────
const failedAttempts = new Map<string, { count: number; blockedUntil?: Date }>();

function isBlocked(ip: string): boolean {
  const record = failedAttempts.get(ip);
  if (!record?.blockedUntil) return false;
  if (record.blockedUntil > new Date()) return true;
  failedAttempts.delete(ip);
  return false;
}

function recordFailure(ip: string): void {
  const record = failedAttempts.get(ip) ?? { count: 0 };
  record.count++;
  if (record.count >= 5) {
    record.blockedUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 min
    log.security('IP_BLOCKED', { ip, failures: record.count });
  }
  failedAttempts.set(ip, record);
}

function recordSuccess(ip: string): void {
  failedAttempts.delete(ip);
}

// ── ENSURE TLS CERTS ──────────────────────────────────────────────
function ensureCerts(): { cert: string; key: string } {
  const certPath = path.resolve(config.server.certPath);
  const keyPath  = path.resolve(config.server.keyPath);

  fs.mkdirSync(path.dirname(certPath), { recursive: true });

  if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
    log.info('SYSTEM_START', 'Generating self-signed TLS certificates', {});
    try {
      execSync(
        `openssl req -x509 -newkey rsa:4096 -keyout "${keyPath}" -out "${certPath}" ` +
        `-days 365 -nodes -subj "/CN=${config.agentName}/O=AutonomousAgent/C=US" ` +
        `-addext "subjectAltName=IP:127.0.0.1,DNS:localhost" 2>/dev/null`,
      );
      log.info('SYSTEM_START', 'TLS certificates generated', { certPath, keyPath });
    } catch {
      throw new Error('Failed to generate TLS certs — install openssl or provide certs manually');
    }
  }

  return {
    cert: fs.readFileSync(certPath, 'utf8'),
    key:  fs.readFileSync(keyPath, 'utf8'),
  };
}

// ── BUILD SERVER ──────────────────────────────────────────────────
export async function buildServer() {
  const { cert, key } = ensureCerts();

  const server = Fastify({
    https:  { cert, key },
    logger: false,     // We use our own logger
    trustProxy: true,
    genReqId: () => uuid(),
  });

  // ── PLUGINS ────────────────────────────────────────────────────

  // Helmet — security headers
  await server.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc:    ["'none'"],
        scriptSrc:     ["'none'"],
        styleSrc:      ["'none'"],
        imgSrc:        ["'none'"],
        connectSrc:    ["'self'"],
        frameAncestors:["'none'"],
      },
    },
    hsts: {
      maxAge:            31536000,
      includeSubDomains: true,
      preload:           true,
    },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    xFrameOptions:  { action: 'deny' },
  });

  // CORS
  await server.register(cors, {
    origin:  false,       // No CORS — API is consumed by owner only
    methods: ['GET', 'POST'],
  });

  // Rate limiting — global
  await server.register(rateLimit, {
    max:        100,
    timeWindow: '1 minute',
    errorResponseBuilder: () => ({
      error: 'Too many requests',
      code:  429,
    }),
  });

  // JWT
  await server.register(fastifyJwt, {
    secret: config.server.jwtSecret,
    sign:   { expiresIn: '24h' },
  });

  // ── REQUEST LOGGING ────────────────────────────────────────────
  server.addHook('onRequest', async (request) => {
    log.info('HTTP_REQUEST', `→ ${request.method} ${request.url}`, {
      ip:        request.ip,
      userAgent: request.headers['user-agent'],
      reqId:     request.id,
    });
  });

  server.addHook('onResponse', async (request, reply) => {
    log.info('HTTP_RESPONSE', `← ${reply.statusCode} ${request.url}`, {
      statusCode: reply.statusCode,
      reqId:      request.id,
    });
  });

  // ── AUTH DECORATOR ─────────────────────────────────────────────
  server.decorate('authenticate', async function(
    request: FastifyRequest,
    reply:   FastifyReply,
  ) {
    const ip = request.ip;

    if (isBlocked(ip)) {
      log.security('BLOCKED_IP_REQUEST', { ip, path: request.url });
      return reply.code(403).send({ error: 'Access denied' });
    }

    try {
      await request.jwtVerify();
      recordSuccess(ip);
    } catch {
      recordFailure(ip);
      log.security('AUTH_FAILURE', { ip, path: request.url });
      return reply.code(401).send({ error: 'Unauthorized' });
    }
  });

  // ── ROUTES ─────────────────────────────────────────────────────

  // Public health check
  server.get('/health', async () => ({
    status:  'ok',
    agent:   config.agentName,
    time:    new Date().toISOString(),
  }));

  // Get JWT token (exchange master API key)
  server.post<{ Body: { api_key: string } }>('/auth/token', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const ip = request.ip;

    if (isBlocked(ip)) {
      return reply.code(403).send({ error: 'Access denied' });
    }

    const { api_key } = request.body ?? {};

    // Constant-time comparison to prevent timing attacks
    const keyBuffer      = Buffer.from(api_key ?? '', 'utf8');
    const expectedBuffer = Buffer.from(config.server.apiMasterKey, 'utf8');

    let match = keyBuffer.length === expectedBuffer.length;
    if (match) {
      let diff = 0;
      for (let i = 0; i < keyBuffer.length; i++) {
        diff |= (keyBuffer[i] ?? 0) ^ (expectedBuffer[i] ?? 0);
      }
      match = diff === 0;
    }

    if (!match) {
      recordFailure(ip);
      log.security('AUTH_FAILURE', { ip });
      return reply.code(401).send({ error: 'Invalid API key' });
    }

    recordSuccess(ip);
    const token = server.jwt.sign({ sub: 'owner', role: 'admin' });
    log.info('AUTH_SUCCESS', `Token issued to ${ip}`, {});
    return { token, expires_in: 86400 };
  });

  // Send a task to the agent
  server.post<{ Body: { task: string; context?: Record<string, unknown> } }>(
    '/task',
    { onRequest: [(server as unknown as { authenticate: (req: FastifyRequest, rep: FastifyReply) => Promise<void> }).authenticate] },
    async (request, reply) => {
      const { task, context = {} } = request.body ?? {};

      if (!task?.trim()) {
        return reply.code(400).send({ error: 'task is required' });
      }

      const { processTask } = await import('./brain.js');
      const taskId = uuid();

      const result = await processTask({
        id:          taskId,
        type:        'general',
        instruction: task,
        context:     { source: 'https', ...context },
        priority:    'normal',
        createdAt:   new Date(),
        requestedBy: 'https',
      });

      return { status: 'ok', result, taskId };
    },
  );

  // HITL approve/deny
  server.post<{
    Params: { requestId: string };
    Body:   { decision: 'approve' | 'deny'; reason?: string };
  }>(
    '/hitl/:requestId',
    { onRequest: [(server as unknown as { authenticate: (req: FastifyRequest, rep: FastifyReply) => Promise<void> }).authenticate] },
    async (request, reply) => {
      const { requestId } = request.params;
      const { decision, reason = '' } = request.body ?? {};

      if (!['approve', 'deny'].includes(decision)) {
        return reply.code(400).send({ error: 'decision must be approve or deny' });
      }

      const decoded   = (request as FastifyRequest & { user: { sub: string } }).user;
      const resolved  = resolveHITLRequest(requestId, decision, reason, decoded.sub ?? 'https_user');

      if (!resolved) {
        return reply.code(404).send({ error: 'Request not found or already resolved' });
      }

      return { status: 'ok', decision, requestId };
    },
  );

  // Get pending HITL requests
  server.get(
    '/hitl/pending',
    { onRequest: [(server as unknown as { authenticate: (req: FastifyRequest, rep: FastifyReply) => Promise<void> }).authenticate] },
    async () => ({ pending: getPendingHITLRequests() }),
  );

  // Agent status
  server.get(
    '/status',
    { onRequest: [(server as unknown as { authenticate: (req: FastifyRequest, rep: FastifyReply) => Promise<void> }).authenticate] },
    async () => {
      const [bankStatus, walletStatus] = await Promise.allSettled([
        import('./banking.js').then(m => m.getBalanceSummary()),
        import('./crypto-wallet.js').then(m => m.getWalletStatus()),
      ]);

      return {
        agent:       config.agentName,
        time:        new Date().toISOString(),
        bank:        bankStatus.status === 'fulfilled'  ? bankStatus.value  : null,
        wallet:      walletStatus.status === 'fulfilled' ? walletStatus.value : null,
        liveAgents:  getLiveAgents(),
        liveTeams:   getLiveTeams(),
        pendingHITL: getPendingHITLRequests().length,
      };
    },
  );

  // Recent memory
  server.get<{ Querystring: { limit?: number; query?: string } }>(
    '/memory',
    { onRequest: [(server as unknown as { authenticate: (req: FastifyRequest, rep: FastifyReply) => Promise<void> }).authenticate] },
    async (request) => {
      const limit = Math.min(request.query.limit ?? 20, 100);
      const query = request.query.query;
      if (query) {
        return { memories: searchMemory(query, limit) };
      }
      return { memories: getRecentMemories(limit) };
    },
  );

  // Stripe webhook — raw body needed, no auth (Stripe signs it)
  server.post('/webhooks/stripe', {
    config: { rawBody: true },
  }, async (request, reply) => {
    const signature = request.headers['stripe-signature'];
    if (!signature || typeof signature !== 'string') {
      return reply.code(400).send({ error: 'Missing stripe-signature header' });
    }
    try {
      const { handleStripeWebhook } = await import('./banking.js');
      const rawBody = (request.body as Buffer) ?? Buffer.from(JSON.stringify(request.body));
      await handleStripeWebhook(rawBody, signature);
      return { received: true };
    } catch (err) {
      log.exception(err, { context: 'stripe_webhook' });
      return reply.code(400).send({ error: 'Webhook signature verification failed' });
    }
  });

  // Active agents
  server.get(
    '/agents',
    { onRequest: [(server as unknown as { authenticate: (req: FastifyRequest, rep: FastifyReply) => Promise<void> }).authenticate] },
    async () => ({
      live:     getLiveAgents(),
      teams:    getLiveTeams(),
      database: getActiveAgents(),
    }),
  );

  // ── SCHEDULER ROUTES ───────────────────────────────────────────

  // List scheduled jobs
  server.get(
    '/scheduler/jobs',
    { onRequest: [(server as unknown as { authenticate: (req: FastifyRequest, rep: FastifyReply) => Promise<void> }).authenticate] },
    async () => ({ jobs: listScheduledJobs() }),
  );

  // Create a scheduled job
  server.post<{
    Body: { instruction: string; when: string; repeat?: boolean };
  }>(
    '/scheduler/jobs',
    { onRequest: [(server as unknown as { authenticate: (req: FastifyRequest, rep: FastifyReply) => Promise<void> }).authenticate] },
    async (request, reply) => {
      const { instruction, when, repeat = false } = request.body ?? {};
      if (!instruction || !when) {
        return reply.code(400).send({ error: 'instruction and when are required' });
      }
      const jobId = await scheduleTask({ instruction, when, repeat });
      return { status: 'ok', jobId };
    },
  );

  // Cancel a scheduled job
  server.delete<{ Params: { jobId: string } }>(
    '/scheduler/jobs/:jobId',
    { onRequest: [(server as unknown as { authenticate: (req: FastifyRequest, rep: FastifyReply) => Promise<void> }).authenticate] },
    async (request, reply) => {
      const { jobId } = request.params;
      const cancelled = cancelJob(jobId);
      if (!cancelled) return reply.code(404).send({ error: 'Job not found' });
      return { status: 'ok', jobId };
    },
  );

  // Spawn agent team
  server.post<{
    Body: {
      goal:  string;
      roles: Array<{ role: string; instruction: string; model?: 'claude' | 'deepseek' | 'ollama' }>;
    };
  }>(
    '/agents/team',
    { onRequest: [(server as unknown as { authenticate: (req: FastifyRequest, rep: FastifyReply) => Promise<void> }).authenticate] },
    async (request, reply) => {
      const { goal, roles } = request.body ?? {};

      if (!goal || !roles?.length) {
        return reply.code(400).send({ error: 'goal and roles required' });
      }

      const { spawnAgentTeam } = await import('./agent-spawner.js');
      const result = await spawnAgentTeam({
        goal,
        roles,
        parentTaskId: uuid(),
      });

      return result;
    },
  );

  // Audit logs — recent memory entries
  server.get<{ Querystring: { limit?: number } }>(
    '/logs',
    { onRequest: [(server as unknown as { authenticate: (req: FastifyRequest, rep: FastifyReply) => Promise<void> }).authenticate] },
    async (request) => {
      const limit = Math.min(request.query.limit ?? 50, 200);
      return { logs: getRecentMemories(limit) };
    },
  );

  // MCP server status
  server.get(
    '/mcp/status',
    { onRequest: [(server as unknown as { authenticate: (req: FastifyRequest, rep: FastifyReply) => Promise<void> }).authenticate] },
    async () => ({ mcpServers: getMCPStatus() }),
  );

  // ── GLOBAL ERROR HANDLER ────────────────────────────────────────
  server.setErrorHandler((error, request, reply) => {
    log.exception(error, { path: request.url, method: request.method });
    void reply.code(error.statusCode ?? 500).send({ error: error.message });
  });

  return server;
}

// ── START SERVER ──────────────────────────────────────────────────
export async function startServer(): Promise<void> {
  const server = await buildServer();

  try {
    await server.listen({ port: config.server.port, host: config.server.host });
    log.info('SYSTEM_START', `HTTPS server listening on ${config.server.host}:${config.server.port}`, {
      tls:          true,
      rateLimit:    true,
      jwtAuth:      true,
      helmetHeaders: true,
    });
  } catch (err) {
    log.exception(err, { context: 'server_start' });
    process.exit(1);
  }
}
