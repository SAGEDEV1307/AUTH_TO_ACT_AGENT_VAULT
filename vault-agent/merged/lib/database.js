'use strict';

const { Pool } = require('pg');
const logger = require('./logger');

let pool = null;

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    });

    pool.on('error', (err) => {
      logger.error('Unexpected database pool error', { error: err.message });
    });
  }
  return pool;
}

async function query(text, params = []) {
  const start = Date.now();
  const client = getPool();
  try {
    const result = await client.query(text, params);
    const duration = Date.now() - start;
    logger.debug('Executed query', { duration, rows: result.rowCount });
    return result;
  } catch (err) {
    logger.error('Database query error', { error: err.message, query: text });
    throw err;
  }
}

async function transaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function healthCheck() {
  const result = await query('SELECT NOW() as now');
  return result.rows[0];
}

async function close() {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('Database pool closed');
  }
}

module.exports = { query, transaction, healthCheck, close, getPool };
