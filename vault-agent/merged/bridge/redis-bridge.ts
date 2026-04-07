// bridge/redis-bridge.ts
// Typed wrapper over lib/redis.js

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const redisLib = require('../lib/redis.js') as {
  get:         (key: string) => Promise<unknown>;
  set:         (key: string, value: unknown, ttl?: number) => Promise<string>;
  del:         (key: string) => Promise<number>;
  exists:      (key: string) => Promise<boolean>;
  incr:        (key: string, ttl?: number) => Promise<number>;
  expire:      (key: string, ttl: number) => Promise<number>;
  keys:        (pattern: string) => Promise<string[]>;
  healthCheck: () => Promise<boolean>;
  close:       () => Promise<void>;
};

export async function cacheGet<T = unknown>(key: string): Promise<T | null> {
  return redisLib.get(key) as Promise<T | null>;
}

export async function cacheSet(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
  await redisLib.set(key, value, ttlSeconds);
}

export async function cacheDel(key: string): Promise<void> {
  await redisLib.del(key);
}

export async function cacheExists(key: string): Promise<boolean> {
  return redisLib.exists(key);
}

export async function cacheIncr(key: string, ttlSeconds?: number): Promise<number> {
  return redisLib.incr(key, ttlSeconds);
}

export async function redisHealthCheck(): Promise<boolean> {
  return redisLib.healthCheck();
}

export async function redisClose(): Promise<void> {
  return redisLib.close();
}
