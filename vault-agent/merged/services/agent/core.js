'use strict';

const { runAgentLoop: anthropicLoop } = require('../ai/anthropic');
const { runAgentLoop: openaiLoop } = require('../ai/openai');
const { executeTool, TOOL_DEFINITIONS } = require('./tool-executor');
const { filterAllowedTools } = require('./permission-check');
const { createRun, updateRun, getRun } = require('./history');
const { AGENT_STATUS } = require('../../lib/constants');
const logger = require('../../lib/logger');
const { AgentError } = require('../../lib/errors');

const DEFAULT_SYSTEM_PROMPT = `You are a helpful AI assistant with the ability to use tools.
You have been authorized to act on behalf of the user. Always confirm before taking
irreversible actions. Be concise, accurate, and transparent about what you are doing.`;

async function runAgent({ userId, userMessage, provider = 'anthropic', model, systemPrompt, requestedTools, maxIterations = 10 }) {
  // Filter tools based on user permissions
  const allTools = requestedTools
    ? TOOL_DEFINITIONS.filter(t => requestedTools.includes(t.name))
    : TOOL_DEFINITIONS;

  const allowedTools = await filterAllowedTools(userId, allTools);

  const runRecord = await createRun(userId, {
    model: model || (provider === 'anthropic' ? 'claude-opus-4-6' : 'gpt-4o'),
    provider,
    systemPrompt: systemPrompt || DEFAULT_SYSTEM_PROMPT,
    userMessage,
    tools: allowedTools.map(t => t.name),
  });

  await updateRun(runRecord.id, { status: AGENT_STATUS.RUNNING });
  logger.info('Agent run started', { runId: runRecord.id, userId, provider });

  const toolExecutor = async (toolName, input) => {
    return executeTool(toolName, input, { userId });
  };

  // Convert tool definitions for provider format
  let tools;
  if (provider === 'openai') {
    tools = allowedTools.map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    }));
  } else {
    tools = allowedTools;
  }

  try {
    const loopFn = provider === 'openai' ? openaiLoop : anthropicLoop;
    const result = await loopFn({
      systemPrompt: systemPrompt || DEFAULT_SYSTEM_PROMPT,
      initialMessage: userMessage,
      tools,
      toolExecutor,
      maxIterations,
    });

    const usage = result.iterations[result.iterations.length - 1]?.response?.usage;
    await updateRun(runRecord.id, {
      status: AGENT_STATUS.COMPLETED,
      final_response: result.finalResponse,
      iterations: result.iterations.map(i => ({
        index: i.index,
        stopReason: i.response.stop_reason || i.response.choices?.[0]?.finish_reason,
      })),
      completed_at: new Date().toISOString(),
      input_tokens: usage?.input_tokens || usage?.prompt_tokens,
      output_tokens: usage?.output_tokens || usage?.completion_tokens,
    });

    logger.info('Agent run completed', { runId: runRecord.id });
    return { runId: runRecord.id, finalResponse: result.finalResponse, status: AGENT_STATUS.COMPLETED };

  } catch (err) {
    logger.error('Agent run failed', { runId: runRecord.id, error: err.message });
    await updateRun(runRecord.id, {
      status: AGENT_STATUS.FAILED,
      error: err.message,
      completed_at: new Date().toISOString(),
    });
    throw new AgentError(err.message, runRecord.id);
  }
}

async function getAgentStatus(runId, userId) {
  const run = await getRun(runId, userId);
  if (!run) throw new AgentError('Run not found', runId);
  return run;
}

module.exports = { runAgent, getAgentStatus };
