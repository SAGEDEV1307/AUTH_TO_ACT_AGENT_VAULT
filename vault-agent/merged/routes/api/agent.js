'use strict';

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../../middleware/auth');
const { apiKeyAuth } = require('../../middleware/apiKey');
const { agentLimiter } = require('../../middleware/rateLimit');
const { runAgent, getAgentStatus } = require('../../services/agent/core');
const { listRuns } = require('../../services/agent/history');
const { requirePermission } = require('../../lib/permissions');
const { PERMISSIONS } = require('../../lib/constants');
const { ValidationError } = require('../../lib/errors');

// POST /api/agent/run — start an agent run
router.post('/run', apiKeyAuth, requireAuth, agentLimiter, async (req, res, next) => {
  try {
    await requirePermission(req.user.dbId, PERMISSIONS.AGENT_RUN);

    const { message, provider, model, systemPrompt, tools, maxIterations } = req.body;
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      throw new ValidationError('message is required');
    }
    if (provider && !['anthropic', 'openai'].includes(provider)) {
      throw new ValidationError('provider must be anthropic or openai');
    }

    const result = await runAgent({
      userId: req.user.dbId,
      userMessage: message.trim(),
      provider: provider || 'anthropic',
      model,
      systemPrompt,
      requestedTools: tools,
      maxIterations: Math.min(maxIterations || 10, 20),
    });

    res.json(result);
  } catch (err) { next(err); }
});

// GET /api/agent/status/:runId — check run status
router.get('/status/:runId', apiKeyAuth, requireAuth, async (req, res, next) => {
  try {
    const run = await getAgentStatus(req.params.runId, req.user.dbId);
    res.json(run);
  } catch (err) { next(err); }
});

// GET /api/agent/history — list agent runs
router.get('/history', apiKeyAuth, requireAuth, async (req, res, next) => {
  try {
    await requirePermission(req.user.dbId, PERMISSIONS.AGENT_HISTORY);
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const status = req.query.status;
    const result = await listRuns(req.user.dbId, { page, limit, status });
    res.json(result);
  } catch (err) { next(err); }
});

module.exports = router;
