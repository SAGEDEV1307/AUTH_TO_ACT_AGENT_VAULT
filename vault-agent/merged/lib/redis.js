'use strict';

const Redis = require('ioredis');
const logger = require('./logger');

let client = null;

function getClient() {
  if (!client) {
    client = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 10) return null;
        return Math.min(times * 200, 2000);
      },
      lazyConnect: true,
    });

    client.on('connect', () => logger.info('Redis connected'));
    client.on('error', (err) => logger.error('Redis error', { error: err.message }));
    client.on('close', () => logger.warn('Redis connection closed'));
  }
  return client;
}

async function get(key) {
  const val = await getClient().get(key);
  if (val === null) return null;
  try { return JSON.parse(val); } catch { return val; }
}

async function set(key, value, ttlSeconds = null) {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  if (ttlSeconds) {
    return getClient().set(key, serialized, 'EX', ttlSeconds);
  }
  return getClient().set(key, serialized);
}

async function del(key) {
  return getClient().del(key);
}

async function exists(key) {
  const result = await getClient().exists(key);
  return result === 1;
}

async function incr(key, ttlSeconds = null) {
  const val = await getClient().incr(key);
  if (ttlSeconds && val === 1) {
    await getClient().expire(key, ttlSeconds);
  }
  return val;
}

async function expire(key, ttlSeconds) {
  return getClient().expire(key, ttlSeconds);
}

async function keys(pattern) {
  return getClient().keys(pattern);
}

async function healthCheck() {
  await getClient().ping();
  return true;
}

async function close() {
  if (client) {
    await client.quit();
    client = null;
    logger.info('Redis client closed');
  }
}

module.exports = { get, set, del, exists, incr, expire, keys, healthCheck, close, getClient };
