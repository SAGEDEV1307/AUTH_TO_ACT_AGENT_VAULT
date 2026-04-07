// src/modules/hitl.ts
// ================================================================
// MODULE 3: HUMAN IN THE LOOP (HITL)
// All sensitive actions require human approval before executing.
// Approval comes via Telegram, SMS, HTTPS, or email.
// Times out and denies if no response within threshold.
// ================================================================

import { EventEmitter } from 'eventemitter3';
import { v4 as uuid }   from 'uuid';
import { config }       from '../config.js';
import { Logger }       from './logger.js';
import type { HITLRequest, HITLDecision } from '../types/index.js';

const log = new Logger('hitl');

// ── PENDING REQUESTS STORE ───────────────────────────────────────
// In-memory. Survives until resolved or expired.
const pendingRequests = new Map<string, HITLRequest>();
const emitter         = new EventEmitter();

// ── NOTIFY CALLBACKS ─────────────────────────────────────────────
// Injected by communication module to avoid circular deps
type NotifyFn = (request: HITLRequest) => Promise<void>;
let notifyFn: NotifyFn | null = null;

export function setHITLNotifyFn(fn: NotifyFn) {
  notifyFn = fn;
}

// ── REQUEST APPROVAL ─────────────────────────────────────────────
export async function requestApproval(params: {
  taskId:      string;
  action:      string;
  description: string;
  data:        Record<string, unknown>;
  riskLevel:   HITLRequest['riskLevel'];
}): Promise<HITLDecision> {
  const id        = uuid();
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + config.hitl.timeoutSeconds * 1000);

  const request: HITLRequest = {
    id,
    taskId:      params.taskId,
    action:      params.action,
    description: params.description,
    data:        params.data,
    riskLevel:   params.riskLevel,
    createdAt,
    expiresAt,
    status:      'pending',
  };

  pendingRequests.set(id, request);

  log.warn('HITL_REQUESTED', `HITL approval needed: ${params.action}`, {
    requestId:   id,
    taskId:      params.taskId,
    action:      params.action,
    riskLevel:   params.riskLevel,
    expiresAt:   expiresAt.toISOString(),
    data:        params.data,
  });

  // Notify the human owner through all channels
  if (notifyFn) {
    try {
      await notifyFn(request);
    } catch (err) {
      log.exception(err, { context: 'hitl_notify' });
    }
  }

  // Wait for decision or timeout
  return new Promise<HITLDecision>((resolve) => {
    const timer = setTimeout(() => {
      const req = pendingRequests.get(id);
      if (req && req.status === 'pending') {
        req.status = 'expired';
        pendingRequests.set(id, req);
        pendingRequests.delete(id);

        log.warn('HITL_DECISION', `HITL timed out: ${params.action}`, {
          requestId:      id,
          timeoutAction:  config.hitl.timeoutAction,
          timeoutSeconds: config.hitl.timeoutSeconds,
        });

        resolve(config.hitl.timeoutAction);
      }
    }, config.hitl.timeoutSeconds * 1000);

    emitter.once(`resolve:${id}`, (decision: HITLDecision) => {
      clearTimeout(timer);
      resolve(decision);
    });
  });
}

// ── RESOLVE A REQUEST ────────────────────────────────────────────
// Called by HTTPS endpoint, Telegram bot, or SMS handler
export function resolveHITLRequest(
  requestId: string,
  decision:  HITLDecision,
  reason:    string,
  decidedBy: string,
): HITLRequest | null {
  const request = pendingRequests.get(requestId);
  if (!request) return null;
  if (request.status !== 'pending') return null;

  request.status    = decision === 'approve' ? 'approved' : 'denied';
  request.decidedBy = decidedBy;
  request.decidedAt = new Date();
  request.reason    = reason;

  pendingRequests.delete(requestId);

  log.warn('HITL_DECISION', `HITL ${decision.toUpperCase()}: ${request.action}`, {
    requestId,
    decision,
    decidedBy,
    reason,
    taskId: request.taskId,
  });

  emitter.emit(`resolve:${requestId}`, decision);
  return request;
}

// ── GET PENDING REQUESTS ─────────────────────────────────────────
export function getPendingHITLRequests(): HITLRequest[] {
  // Clean up expired
  const now = Date.now();
  for (const [id, req] of pendingRequests.entries()) {
    if (req.expiresAt.getTime() < now) {
      req.status = 'expired';
      pendingRequests.delete(id);
    }
  }
  return Array.from(pendingRequests.values());
}

export function getHITLRequest(id: string): HITLRequest | undefined {
  return pendingRequests.get(id);
}

// ── RISK LEVEL HELPER ────────────────────────────────────────────
export function assessRisk(params: {
  amountUSD?:   number;
  amountETH?:   number;
  action:       string;
}): HITLRequest['riskLevel'] {
  if (params.amountUSD && params.amountUSD >= config.banking.maxSingleTx)   return 'critical';
  if (params.amountETH && params.amountETH >= config.crypto.dailyLimitEth)  return 'critical';
  if (params.amountUSD && params.amountUSD >= config.banking.hitlThreshold) return 'high';
  if (params.amountETH && params.amountETH >= config.crypto.hitlThresholdEth) return 'high';
  if (params.action.toLowerCase().includes('delete')) return 'high';
  if (params.action.toLowerCase().includes('send'))   return 'medium';
  return 'low';
}

// ── NEEDS APPROVAL CHECK ─────────────────────────────────────────
export function needsApproval(params: {
  amountUSD?:  number;
  amountETH?:  number;
  payee?:      string;
  action:      string;
}): boolean {
  // Financial: always need approval above threshold
  if (params.amountUSD !== undefined && params.amountUSD >= config.banking.hitlThreshold) return true;
  if (params.amountETH !== undefined && params.amountETH >= config.crypto.hitlThresholdEth) return true;

  // If payee not whitelisted, need approval
  if (params.payee && !config.banking.whitelistedPayees.includes(params.payee)) return true;

  // Destructive actions always need approval
  const destructive = ['delete', 'remove', 'destroy', 'wipe', 'terminate'];
  if (destructive.some(d => params.action.toLowerCase().includes(d))) return true;

  return false;
}
