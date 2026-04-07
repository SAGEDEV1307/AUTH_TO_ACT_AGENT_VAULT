'use strict';

const OpenAI = require('openai');
const logger = require('../../lib/logger');

let client = null;

function getClient() {
  if (!client) {
    if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set');
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return client;
}

async function runCompletion({ systemPrompt, messages, tools = [], maxTokens = 4096, model = 'gpt-4o' }) {
  const params = {
    model,
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages,
    ],
  };
  if (tools.length > 0) {
    params.tools = tools.map(t => ({ type: 'function', function: t }));
    params.tool_choice = 'auto';
  }

  logger.debug('OpenAI API call', { model, messageCount: messages.length });
  const response = await getClient().chat.completions.create(params);
  logger.debug('OpenAI response', {
    finishReason: response.choices[0].finish_reason,
    promptTokens: response.usage?.prompt_tokens,
    completionTokens: response.usage?.completion_tokens,
  });
  return response;
}

async function runAgentLoop({ systemPrompt, initialMessage, tools, toolExecutor, maxIterations = 10 }) {
  const messages = [{ role: 'user', content: initialMessage }];
  const iterations = [];

  for (let i = 0; i < maxIterations; i++) {
    const response = await runCompletion({ systemPrompt, messages, tools });
    const choice = response.choices[0];
    iterations.push({ response, index: i });

    messages.push({ role: 'assistant', content: choice.message.content, tool_calls: choice.message.tool_calls });

    if (choice.finish_reason === 'stop') {
      return { finalResponse: choice.message.content || '', iterations, messages };
    }

    if (choice.finish_reason === 'tool_calls' && choice.message.tool_calls) {
      for (const toolCall of choice.message.tool_calls) {
        const args = JSON.parse(toolCall.function.arguments || '{}');
        let result;
        try {
          result = await toolExecutor(toolCall.function.name, args);
        } catch (err) {
          result = { error: err.message };
        }
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: typeof result === 'string' ? result : JSON.stringify(result),
        });
      }
    }
  }

  throw new Error(`Agent loop exceeded max iterations (${maxIterations})`);
}

module.exports = { runCompletion, runAgentLoop };
