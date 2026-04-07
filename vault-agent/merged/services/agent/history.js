'use strict';

const db = require('../../lib/database');
const logger = require('../../lib/logger');

async function createRun(userId, { model, provider, systemPrompt, userMessage, tools = [] }) {
  const result = await db.query(
    `INSERT INTO agent_runs
       (user_id, model, provider, system_prompt, user_message, tools, status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending', NOW())
     RETURNING id, created_at`,
    [userId, model, provider, systemPrompt, userMessage, JSON.stringify(tools)]
  );
  return result.rows[0];
}

async function updateRun(runId, updates) {
  const allowed = ['status', 'final_response', 'iterations', 'error', 'completed_at', 'input_tokens', 'output_tokens'];
  const fields = Object.keys(updates).filter(k => allowed.includes(k));
  if (fields.length === 0) return;
  const setClause = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
  await db.query(
    `UPDATE agent_runs SET ${setClause} WHERE id = $1`,
    [runId, ...fields.map(f => {
      const v = updates[f];
      return typeof v === 'object' && v !== null ? JSON.stringify(v) : v;
    })]
  );
}

async function getRun(runId, userId = null) {
  const conditions = ['id = $1'];
  const params = [runId];
  if (userId) { conditions.push(`user_id = $2`); params.push(userId); }
  const result = await db.query(
    `SELECT id, user_id, model, provider, status, user_message, final_response,
            iterations, error, created_at, completed_at, input_tokens, output_tokens
     FROM agent_runs WHERE ${conditions.join(' AND ')}`,
    params
  );
  return result.rows[0] || null;
}

async function listRuns(userId, { page = 1, limit = 20, status } = {}) {
  const offset = (page - 1) * limit;
  const conditions = ['user_id = $1'];
  const params = [userId];
  if (status) { conditions.push(`status = $${params.length + 1}`); params.push(status); }
  const result = await db.query(
    `SELECT id, model, provider, status, user_message, created_at, completed_at,
            input_tokens, output_tokens
     FROM agent_runs WHERE ${conditions.join(' AND ')}
     ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );
  const count = await db.query(
    `SELECT COUNT(*) FROM agent_runs WHERE ${conditions.join(' AND ')}`, params
  );
  return { runs: result.rows, total: parseInt(count.rows[0].count), page, limit };
}

module.exports = { createRun, updateRun, getRun, listRuns };
