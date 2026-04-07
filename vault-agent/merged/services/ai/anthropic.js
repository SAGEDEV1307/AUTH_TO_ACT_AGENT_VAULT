'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const logger = require('../../lib/logger');

let client = null;

function getClient() {
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not set');
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

async function runCompletion({ systemPrompt, messages, tools = [], maxTokens = 4096, model = 'claude-opus-4-6' }) {
  const params = {
    model,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages,
  };
  if (tools.length > 0) params.tools = tools;

  logger.debug('Anthropic API call', { model, messageCount: messages.length, toolCount: tools.length });

  const response = await getClient().messages.create(params);

  logger.debug('Anthropic API response', {
    stopReason: response.stop_reason,
    inputTokens: response.usage?.input_tokens,
    outputTokens: response.usage?.output_tokens,
  });

  return response;
}

async function runAgentLoop({ systemPrompt, initialMessage, tools, toolExecutor, maxIterations = 10 }) {
  const messages = [{ role: 'user', content: initialMessage }];
  const iterations = [];

  for (let i = 0; i < maxIterations; i++) {
    const response = await runCompletion({ systemPrompt, messages, tools });
    iterations.push({ response, index: i });

    if (response.stop_reason === 'end_turn') {
      const textContent = response.content.find(b => b.type === 'text');
      return {
        finalResponse: textContent?.text || '',
        iterations,
        messages,
      };
    }

    if (response.stop_reason === 'tool_use') {
      messages.push({ role: 'assistant', content: response.content });

      const toolResults = [];
      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;
        logger.info('Tool call', { tool: block.name, id: block.id });
        let result;
        try {
          result = await toolExecutor(block.name, block.input);
        } catch (err) {
          result = { error: err.message };
        }
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: typeof result === 'string' ? result : JSON.stringify(result),
        });
      }
      messages.push({ role: 'user', content: toolResults });
    }
  }

  throw new Error(`Agent loop exceeded max iterations (${maxIterations})`);
}

module.exports = { runCompletion, runAgentLoop };
