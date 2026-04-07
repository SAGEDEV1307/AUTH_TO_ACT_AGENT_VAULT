// src/modules/memory.ts
// ================================================================
// MODULE 4: PERSISTENT MEMORY
// SQLite-backed memory for all agent state, conversations,
// task history, HITL records, financial history, and facts.
// ================================================================

import Database from 'better-sqlite3';
import path from 'path';
import fs       from 'fs';
import { v4 as uuid } from 'uuid';
import { config }     from '../config.js';
import { Logger }     from './logger.js';
import type { MemoryEntry, AgentTask, AgentResult, HITLRequest } from '../types/index.js';

const log = new Logger('memory');

// ── INIT DB ──────────────────────────────────────────────────────
fs.mkdirSync(path.dirname(config.db.sqlitePath), { recursive: true });
const db = new Database(config.db.sqlitePath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('synchronous = NORMAL');

// ── SCHEMA ───────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS memories (
    id         TEXT PRIMARY KEY,
    type       TEXT NOT NULL,
    content    TEXT NOT NULL,
    metadata   TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_memories_type       ON memories(type);
  CREATE INDEX IF NOT EXISTS idx_memories_created_at ON memories(created_at);

  CREATE TABLE IF NOT EXISTS tasks (
    id           TEXT PRIMARY KEY,
    type         TEXT NOT NULL,
    instruction  TEXT NOT NULL,
    context      TEXT NOT NULL DEFAULT '{}',
    priority     TEXT NOT NULL DEFAULT 'normal',
    requested_by TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'pending',
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_tasks_status     ON tasks(status);
  CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);

  CREATE TABLE IF NOT EXISTS results (
    id         TEXT PRIMARY KEY,
    task_id    TEXT NOT NULL,
    success    INTEGER NOT NULL,
    output     TEXT NOT NULL,
    data       TEXT NOT NULL DEFAULT '{}',
    error      TEXT,
    duration   INTEGER NOT NULL,
    llm_used   TEXT NOT NULL,
    tools_used TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (task_id) REFERENCES tasks(id)
  );

  CREATE TABLE IF NOT EXISTS hitl_records (
    id          TEXT PRIMARY KEY,
    task_id     TEXT NOT NULL,
    action      TEXT NOT NULL,
    description TEXT NOT NULL,
    data        TEXT NOT NULL DEFAULT '{}',
    risk_level  TEXT NOT NULL,
    status      TEXT NOT NULL,
    decided_by  TEXT,
    decided_at  TEXT,
    reason      TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS financial_log (
    id          TEXT PRIMARY KEY,
    type        TEXT NOT NULL,
    amount      REAL NOT NULL,
    currency    TEXT NOT NULL,
    recipient   TEXT NOT NULL,
    description TEXT NOT NULL,
    status      TEXT NOT NULL,
    approved_by TEXT,
    task_id     TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id         TEXT PRIMARY KEY,
    channel    TEXT NOT NULL,
    role       TEXT NOT NULL,
    content    TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_conv_channel ON conversations(channel);

  CREATE TABLE IF NOT EXISTS agent_registry (
    id          TEXT PRIMARY KEY,
    role        TEXT NOT NULL,
    model       TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'idle',
    parent_id   TEXT,
    team_id     TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    last_active TEXT
  );

  CREATE TABLE IF NOT EXISTS daily_spend (
    date     TEXT NOT NULL,
    currency TEXT NOT NULL,
    total    REAL NOT NULL DEFAULT 0,
    PRIMARY KEY (date, currency)
  );
`);

log.info('SYSTEM_START', 'SQLite memory initialized', { path: config.db.sqlitePath });

// ── MEMORY CRUD ──────────────────────────────────────────────────
const stmts = {
  insertMemory: db.prepare(`
    INSERT INTO memories (id, type, content, metadata, created_at)
    VALUES (@id, @type, @content, @metadata, datetime('now'))
  `),
  getRecentMemories: db.prepare(`
    SELECT * FROM memories ORDER BY created_at DESC LIMIT ?
  `),
  getMemoriesByType: db.prepare(`
    SELECT * FROM memories WHERE type = ? ORDER BY created_at DESC LIMIT ?
  `),
  searchMemories: db.prepare(`
    SELECT * FROM memories WHERE content LIKE ? ORDER BY created_at DESC LIMIT ?
  `),
  deleteOldMemories: db.prepare(`
    DELETE FROM memories WHERE id IN (
      SELECT id FROM memories ORDER BY created_at ASC LIMIT ?
    )
  `),

  // Tasks
  insertTask: db.prepare(`
    INSERT INTO tasks (id, type, instruction, context, priority, requested_by, status)
    VALUES (@id, @type, @instruction, @context, @priority, @requested_by, 'pending')
  `),
  updateTaskStatus: db.prepare(`
    UPDATE tasks SET status = @status, completed_at = datetime('now') WHERE id = @id
  `),
  getTask: db.prepare('SELECT * FROM tasks WHERE id = ?'),
  getRecentTasks: db.prepare('SELECT * FROM tasks ORDER BY created_at DESC LIMIT ?'),

  // Results
  insertResult: db.prepare(`
    INSERT INTO results (id, task_id, success, output, data, error, duration, llm_used, tools_used)
    VALUES (@id, @task_id, @success, @output, @data, @error, @duration, @llm_used, @tools_used)
  `),

  // HITL
  insertHITL: db.prepare(`
    INSERT INTO hitl_records (id, task_id, action, description, data, risk_level, status, created_at, expires_at)
    VALUES (@id, @task_id, @action, @description, @data, @risk_level, @status, datetime('now'), @expires_at)
  `),
  updateHITL: db.prepare(`
    UPDATE hitl_records
    SET status = @status, decided_by = @decided_by, decided_at = datetime('now'), reason = @reason
    WHERE id = @id
  `),

  // Financial
  insertFinancial: db.prepare(`
    INSERT INTO financial_log (id, type, amount, currency, recipient, description, status, approved_by, task_id)
    VALUES (@id, @type, @amount, @currency, @recipient, @description, @status, @approved_by, @task_id)
  `),
  getDailySpend: db.prepare('SELECT total FROM daily_spend WHERE date = ? AND currency = ?'),
  upsertDailySpend: db.prepare(`
    INSERT INTO daily_spend (date, currency, total) VALUES (@date, @currency, @amount)
    ON CONFLICT(date, currency) DO UPDATE SET total = total + @amount
  `),

  // Conversations
  insertConversation: db.prepare(`
    INSERT INTO conversations (id, channel, role, content) VALUES (@id, @channel, @role, @content)
  `),
  getConversationHistory: db.prepare(`
    SELECT * FROM conversations WHERE channel = ? ORDER BY created_at DESC LIMIT ?
  `),

  // Agents
  upsertAgent: db.prepare(`
    INSERT INTO agent_registry (id, role, model, status, parent_id, team_id)
    VALUES (@id, @role, @model, @status, @parent_id, @team_id)
    ON CONFLICT(id) DO UPDATE SET status = @status, last_active = datetime('now')
  `),
  getAgents: db.prepare('SELECT * FROM agent_registry WHERE status != ? ORDER BY created_at DESC'),
};

// ── PUBLIC API ───────────────────────────────────────────────────

export function storeMemory(
  type:     MemoryEntry['type'],
  content:  string,
  metadata: Record<string, unknown> = {},
): string {
  const id = uuid();
  stmts.insertMemory.run({ id, type, content, metadata: JSON.stringify(metadata) });

  // Enforce max memory limit
  const countResult = db.prepare('SELECT COUNT(*) as c FROM memories').get() as { c: number };
  if (countResult.c > 50_000) {
    stmts.deleteOldMemories.run(1000);
  }

  return id;
}

export function getRecentMemories(limit = 20): MemoryEntry[] {
  const rows = stmts.getRecentMemories.all(limit) as Array<{
    id: string; type: string; content: string; metadata: string; created_at: string;
  }>;
  return rows.map(r => ({
    id:        r.id,
    type:      r.type as MemoryEntry['type'],
    content:   r.content,
    metadata:  JSON.parse(r.metadata) as Record<string, unknown>,
    createdAt: new Date(r.created_at),
  }));
}

export function searchMemory(query: string, limit = 10): MemoryEntry[] {
  const rows = stmts.searchMemories.all(`%${query}%`, limit) as Array<{
    id: string; type: string; content: string; metadata: string; created_at: string;
  }>;
  return rows.map(r => ({
    id:        r.id,
    type:      r.type as MemoryEntry['type'],
    content:   r.content,
    metadata:  JSON.parse(r.metadata) as Record<string, unknown>,
    createdAt: new Date(r.created_at),
  }));
}

export function storeTask(task: AgentTask): void {
  stmts.insertTask.run({
    id:           task.id,
    type:         task.type,
    instruction:  task.instruction,
    context:      JSON.stringify(task.context),
    priority:     task.priority,
    requested_by: task.requestedBy,
  });
}

export function completeTask(taskId: string, status: 'completed' | 'failed'): void {
  stmts.updateTaskStatus.run({ id: taskId, status });
}

export function storeResult(result: AgentResult): void {
  stmts.insertResult.run({
    id:         uuid(),
    task_id:    result.taskId,
    success:    result.success ? 1 : 0,
    output:     result.output,
    data:       JSON.stringify(result.data ?? {}),
    error:      result.error ?? null,
    duration:   result.duration,
    llm_used:   result.llmUsed,
    tools_used: JSON.stringify(result.toolsUsed),
  });
}

export function storeHITLRecord(request: HITLRequest): void {
  stmts.insertHITL.run({
    id:          request.id,
    task_id:     request.taskId,
    action:      request.action,
    description: request.description,
    data:        JSON.stringify(request.data),
    risk_level:  request.riskLevel,
    status:      request.status,
    expires_at:  request.expiresAt.toISOString(),
  });
}

export function updateHITLRecord(
  id:        string,
  status:    string,
  decidedBy: string,
  reason:    string,
): void {
  stmts.updateHITL.run({ id, status, decided_by: decidedBy, reason });
}

export function logFinancialAction(params: {
  type:        string;
  amount:      number;
  currency:    string;
  recipient:   string;
  description: string;
  status:      string;
  approvedBy:  string;
  taskId?:     string;
}): string {
  const id = uuid();
  stmts.insertFinancial.run({
    id,
    type:        params.type,
    amount:      params.amount,
    currency:    params.currency,
    recipient:   params.recipient,
    description: params.description,
    status:      params.status,
    approved_by: params.approvedBy,
    task_id:     params.taskId ?? null,
  });

  // Track daily spend
  const today = new Date().toISOString().slice(0, 10);
  stmts.upsertDailySpend.run({ date: today, currency: params.currency, amount: params.amount });

  return id;
}

export function getDailySpend(currency = 'USD'): number {
  const today  = new Date().toISOString().slice(0, 10);
  const result = stmts.getDailySpend.get(today, currency) as { total: number } | undefined;
  return result?.total ?? 0;
}

export function storeConversation(channel: string, role: 'user' | 'assistant', content: string): void {
  stmts.insertConversation.run({ id: uuid(), channel, role, content });
}

export function getConversationHistory(
  channel: string,
  limit = 20,
): Array<{ role: 'user' | 'assistant'; content: string }> {
  const rows = stmts.getConversationHistory.all(channel, limit) as Array<{
    role: string; content: string;
  }>;
  return rows.reverse().map(r => ({ role: r.role as 'user' | 'assistant', content: r.content }));
}

export function registerAgent(params: {
  id:       string;
  role:     string;
  model:    string;
  status:   string;
  parentId?: string;
  teamId?:  string;
}): void {
  stmts.upsertAgent.run({
    id:        params.id,
    role:      params.role,
    model:     params.model,
    status:    params.status,
    parent_id: params.parentId ?? null,
    team_id:   params.teamId ?? null,
  });
}

export function getActiveAgents(): Array<{
  id: string; role: string; model: string; status: string;
}> {
  return stmts.getAgents.all('terminated') as Array<{
    id: string; role: string; model: string; status: string;
  }>;
}

// ── CLOSE ON EXIT ─────────────────────────────────────────────────
process.on('exit', () => db.close());
