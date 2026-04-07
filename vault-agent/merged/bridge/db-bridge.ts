// bridge/db-bridge.ts
// Typed wrapper over lib/database.js (PostgreSQL)
// All TS code imports from here — never directly from lib/database.js

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const db = require('../lib/database.js') as {
  query:       (text: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>;
  transaction: <T>(fn: (client: unknown) => Promise<T>) => Promise<T>;
  healthCheck: () => Promise<{ now: Date }>;
  close:       () => Promise<void>;
};

export interface QueryResult<T = Record<string, unknown>> {
  rows:     T[];
  rowCount: number;
}

export async function pgQuery<T = Record<string, unknown>>(
  text:   string,
  params: unknown[] = [],
): Promise<QueryResult<T>> {
  const result = await db.query(text, params);
  return result as QueryResult<T>;
}

export async function pgTransaction<T>(
  fn: (client: unknown) => Promise<T>,
): Promise<T> {
  return db.transaction(fn);
}

export async function pgHealthCheck(): Promise<{ now: Date }> {
  return db.healthCheck();
}

export async function pgClose(): Promise<void> {
  return db.close();
}
