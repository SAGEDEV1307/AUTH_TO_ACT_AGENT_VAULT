// src/brain.ts
// Multi-LLM orchestrator — Claude + DeepSeek + Ollama + Gemini.
// Merged from VaultAgent brain.ts + modular-bot AIRouter.ts.

import Anthropic   from '@anthropic-ai/sdk';
import OpenAI      from 'openai';
import ollama      from 'ollama';
import { GoogleGenAI } from '@google/genai';
import { v4 as uuid } from 'uuid';
import { config }  from './config.js';
import { logger, logSecurityEvent } from './logger.js';
import { storeConversation, getConversationHistory, storeMemory } from './memory.js';
import { requestApproval, needsApproval, assessRisk } from './hitl.js';
import { TriggerEngine, type ModuleAI } from './module-system.js';
import type {
  AgentTask, AgentResult, LLMMessage, LLMResponse,
  LLMProvider, ToolResult,
} from './types.js';

// ── PROMPT INJECTION DETECTION (from modular-bot AIRouter) ────────
const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+instructions/i,
  /you\s+are\s+now\s+(a\s+)?different/i,
  /system\s*:\s*you/i,
  /\[system\]/i,
  /<\s*system\s*>/i,
  /jailbreak/i,
  /disregard\s+(your\s+)?instructions/i,
];

function detectInjection(input: string): boolean {
  return INJECTION_PATTERNS.some(p => p.test(input));
}

function validateResponse(response: unknown, model: string): string {
  if (typeof response !== 'string') throw new Error(`${model} returned non-string type`);
  if (response.trim().length === 0) throw new Error(`${model} returned empty response`);
  return response.slice(0, 100_000);
}

function safeErrorMessage(err: unknown): string {
  if (!(err instanceof Error)) return 'Unknown error';
  const msg = err.message.replace(/sk-[a-zA-Z0-9\-_]{10,}/g, '[REDACTED]');
  if (msg.includes('401') || msg.includes('403') || msg.includes('auth')) return 'Authentication error — check your API key';
  if (msg.includes('429') || msg.includes('rate')) return 'Rate limit reached — try again shortly';
  if (msg.includes('timeout')) return 'Request timed out';
  return msg;
}

// ── CLIENTS ───────────────────────────────────────────────────────
let anthropicClient: Anthropic | null = null;
let deepseekClient:  OpenAI | null    = null;
let geminiClient:    GoogleGenAI | null = null;

function getAnthropic(): Anthropic {
  if (!anthropicClient) anthropicClient = new Anthropic({
    apiKey: config.llm.anthropicKey, maxRetries: 3, timeout: 30_000,
  });
  return anthropicClient;
}

function getDeepSeek(): OpenAI {
  if (!deepseekClient) deepseekClient = new OpenAI({
    baseURL: 'https://api.deepseek.com',
    apiKey: config.llm.deepseekKey || 'placeholder',
    maxRetries: 3, timeout: 60_000,
  });
  return deepseekClient;
}

function getGemini(): GoogleGenAI {
  if (!geminiClient) {
    const key = process.env['GEMINI_API_KEY'];
    if (!key) throw new Error('GEMINI_API_KEY not set');
    geminiClient = new GoogleGenAI({ apiKey: key });
  }
  return geminiClient;
}

// ── TOOL DEFINITIONS ──────────────────────────────────────────────
const CLAUDE_TOOLS: Anthropic.Tool[] = [
  {
    name: 'watch_video',
    description: 'Download and analyze any video from a URL. Returns transcript, summary, key points.',
    input_schema: {
      type: 'object',
      properties: {
        url:    { type: 'string', description: 'YouTube or direct video URL' },
        action: { type: 'string', enum: ['summarize', 'transcribe', 'analyze', 'extract_data'] },
        focus:  { type: 'string', description: 'Optional topic to focus on' },
      },
      required: ['url', 'action'],
    },
  },
  {
    name: 'check_bank_balance',
    description: 'Check the current bank account balance and recent transactions.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'send_bank_payment',
    description: 'Send a payment from the bank account. HITL approval required above threshold.',
    input_schema: {
      type: 'object',
      properties: {
        amount:      { type: 'number' },
        recipient:   { type: 'string' },
        description: { type: 'string' },
      },
      required: ['amount', 'recipient', 'description'],
    },
  },
  {
    name: 'check_crypto_wallet',
    description: 'Check the crypto wallet balance and ETH holdings.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'send_crypto',
    description: 'Send ETH. HITL approval required.',
    input_schema: {
      type: 'object',
      properties: {
        to:        { type: 'string' },
        amountEth: { type: 'string' },
        reason:    { type: 'string' },
      },
      required: ['to', 'amountEth', 'reason'],
    },
  },
  {
    name: 'swap_tokens',
    description: 'Swap ERC-20 tokens via Uniswap V3 on any supported chain.',
    input_schema: {
      type: 'object',
      properties: {
        tokenIn:   { type: 'string', description: 'Input token address or symbol (e.g. USDC)' },
        tokenOut:  { type: 'string', description: 'Output token address or symbol (e.g. WETH)' },
        amountIn:  { type: 'string', description: 'Amount to swap' },
        chainName: { type: 'string', description: 'Chain name e.g. ethereum, arbitrum, base' },
        fee:       { type: 'number', description: 'Pool fee tier: 500, 3000, or 10000' },
      },
      required: ['tokenIn', 'tokenOut', 'amountIn', 'chainName'],
    },
  },
  {
    name: 'get_token_price',
    description: 'Get real-time token price from Chainlink price feeds.',
    input_schema: {
      type: 'object',
      properties: {
        pair:      { type: 'string', description: 'Price pair e.g. ETH/USD, BTC/USD' },
        chainName: { type: 'string', description: 'Chain to query' },
      },
      required: ['pair', 'chainName'],
    },
  },
  {
    name: 'stake_eth',
    description: 'Stake ETH via Lido to receive stETH.',
    input_schema: {
      type: 'object',
      properties: {
        amountEth: { type: 'string', description: 'Amount of ETH to stake' },
      },
      required: ['amountEth'],
    },
  },
  {
    name: 'web_search',
    description: 'Search the web for current information.',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string' }, limit: { type: 'number' } },
      required: ['query'],
    },
  },
  {
    name: 'spawn_agent',
    description: 'Spawn a sub-agent with a specialized role.',
    input_schema: {
      type: 'object',
      properties: {
        role:        { type: 'string' },
        instruction: { type: 'string' },
        model:       { type: 'string', enum: ['claude', 'deepseek', 'ollama', 'gemini'] },
      },
      required: ['role', 'instruction'],
    },
  },
  {
    name: 'remember_fact',
    description: 'Store an important fact in long-term memory.',
    input_schema: {
      type: 'object',
      properties: {
        content:  { type: 'string' },
        category: { type: 'string' },
      },
      required: ['content'],
    },
  },
  {
    name: 'schedule_task',
    description: 'Schedule a task to run at a specific time or on a cron schedule.',
    input_schema: {
      type: 'object',
      properties: {
        instruction: { type: 'string' },
        when:        { type: 'string', description: 'cron expression or ISO date string' },
        repeat:      { type: 'boolean' },
      },
      required: ['instruction', 'when'],
    },
  },
];

// ── TOOL EXECUTOR ─────────────────────────────────────────────────
async function executeTool(name: string, args: Record<string, unknown>, taskId: string): Promise<ToolResult> {
  logger.info(`Tool: ${name}`, { args: JSON.stringify(args).slice(0, 200) });
  try {
    let result: unknown;
    switch (name) {
      case 'watch_video': {
        const { watchVideo } = await import('./video-watcher.js');
        result = await watchVideo(args['url'] as string, args['action'] as string, args['focus'] as string | undefined);
        break;
      }
      case 'check_bank_balance': {
        const { getBalanceSummary } = await import('./banking.js');
        result = await getBalanceSummary();
        break;
      }
      case 'send_bank_payment': {
        const { sendPayment } = await import('./banking.js');
        const amount    = args['amount'] as number;
        const recipient = args['recipient'] as string;
        const desc      = args['description'] as string;
        if (needsApproval({ amountUSD: amount, payee: recipient, action: 'bank_payment' })) {
          const decision = await requestApproval({
            taskId, action: 'bank_payment',
            description: `Send $${amount} to ${recipient}: ${desc}`,
            data: { amount, recipient, description: desc },
            riskLevel: assessRisk({ amountUSD: amount, action: 'bank_payment' }),
          });
          if (decision === 'deny') { result = { error: 'Payment denied', denied: true }; break; }
        }
        result = await sendPayment({ amount, recipient, description: desc, taskId });
        break;
      }
      case 'check_crypto_wallet': {
        const { getWalletStatus } = await import('./crypto-wallet.js');
        result = await getWalletStatus();
        break;
      }
      case 'send_crypto': {
        const { sendEth } = await import('./crypto-wallet.js');
        const amountEth = args['amountEth'] as string;
        const to        = args['to'] as string;
        const reason    = args['reason'] as string;
        if (needsApproval({ amountETH: parseFloat(amountEth), action: 'crypto_send' })) {
          const decision = await requestApproval({
            taskId, action: 'crypto_send',
            description: `Send ${amountEth} ETH to ${to}: ${reason}`,
            data: { amountEth, to, reason },
            riskLevel: assessRisk({ amountETH: parseFloat(amountEth), action: 'crypto_send' }),
          });
          if (decision === 'deny') { result = { error: 'Transfer denied', denied: true }; break; }
        }
        result = await sendEth({ to, amountEth, taskId });
        break;
      }
      case 'swap_tokens': {
        const defi = await import('../services/blockchain/defi.js' as string);
        if (needsApproval({ action: 'token_swap' })) {
          const decision = await requestApproval({
            taskId, action: 'token_swap',
            description: `Swap ${args['amountIn']} ${args['tokenIn']} → ${args['tokenOut']} on ${args['chainName']}`,
            data: args,
            riskLevel: 'medium',
          });
          if (decision === 'deny') { result = { error: 'Swap denied', denied: true }; break; }
        }
        result = await (defi as unknown as { quoteSwap: (p: unknown) => Promise<unknown> }).quoteSwap(args);
        break;
      }
      case 'get_token_price': {
        const defi = await import('../services/blockchain/defi.js' as string);
        result = await (defi as unknown as { getPrice: (p: string, c: string) => Promise<unknown> }).getPrice(
          args['pair'] as string, args['chainName'] as string
        );
        break;
      }
      case 'stake_eth': {
        const defi = await import('../services/blockchain/defi.js' as string);
        if (needsApproval({ amountETH: parseFloat(args['amountEth'] as string), action: 'stake_eth' })) {
          const decision = await requestApproval({
            taskId, action: 'stake_eth',
            description: `Stake ${args['amountEth']} ETH via Lido`,
            data: args,
            riskLevel: assessRisk({ amountETH: parseFloat(args['amountEth'] as string), action: 'stake_eth' }),
          });
          if (decision === 'deny') { result = { error: 'Staking denied', denied: true }; break; }
        }
        result = { message: 'Staking requires userId context — use REST API endpoint' };
        break;
      }
      case 'web_search':
        result = await webSearch(args['query'] as string, (args['limit'] as number) ?? 5);
        break;
      case 'spawn_agent': {
        const { spawnSubAgent } = await import('./agent-spawner.js');
        result = await spawnSubAgent({
          role: args['role'] as string,
          instruction: args['instruction'] as string,
          model: (args['model'] as LLMProvider) ?? 'ollama',
          parentTaskId: taskId,
        });
        break;
      }
      case 'remember_fact': {
        const memId = storeMemory('fact', args['content'] as string, { category: args['category'] ?? 'other' });
        result = { stored: true, id: memId };
        break;
      }
      case 'schedule_task': {
        const { scheduleTask } = await import('./scheduler.js');
        const jobId = await scheduleTask({
          instruction: args['instruction'] as string,
          when: args['when'] as string,
          repeat: (args['repeat'] as boolean) ?? false,
        });
        result = { scheduled: true, jobId };
        break;
      }
      default:
        result = { error: `Unknown tool: ${name}` };
    }
    return { toolCallId: uuid(), name, result };
  } catch (err) {
    logger.exception(err as Error, { tool: name });
    return { toolCallId: uuid(), name, result: null, error: err instanceof Error ? err.message : String(err) };
  }
}

async function webSearch(query: string, limit = 5): Promise<unknown> {
  try {
    const url  = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`;
    const resp = await fetch(url);
    const data = await resp.json() as { AbstractText?: string; RelatedTopics?: unknown[] };
    return { query, abstract: data.AbstractText, relatedTopics: data.RelatedTopics?.slice(0, limit) };
  } catch {
    return { query, error: 'Search unavailable', results: [] };
  }
}

// ── LLM CALLERS ───────────────────────────────────────────────────

async function callClaude(messages: LLMMessage[], taskId: string): Promise<LLMResponse> {
  const client    = getAnthropic();
  const systemMsg = messages.find(m => m.role === 'system')?.content ?? '';
  let allMessages: Anthropic.MessageParam[] = messages
    .filter(m => m.role !== 'system')
    .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

  const toolsUsed: string[] = [];
  let finalContent = '';
  let iterations   = 0;

  while (iterations < 10) {
    iterations++;
    const response = await client.messages.create({
      model: config.llm.claudeModel,
      max_tokens: 4096,
      system: systemMsg,
      messages: allMessages,
      tools: CLAUDE_TOOLS,
    });

    if (response.stop_reason === 'end_turn') {
      const tb = response.content.find(b => b.type === 'text');
      finalContent = tb?.type === 'text' ? tb.text : '';
      break;
    }
    if (response.stop_reason === 'tool_use') {
      const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of toolUseBlocks) {
        if (block.type !== 'tool_use') continue;
        toolsUsed.push(block.name);
        const result = await executeTool(block.name, block.input as Record<string, unknown>, taskId);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(result.error ?? result.result),
        });
      }
      allMessages = [...allMessages, { role: 'assistant', content: response.content }, { role: 'user', content: toolResults }];
    } else {
      const tb = response.content.find(b => b.type === 'text');
      finalContent = tb?.type === 'text' ? tb.text : '';
      break;
    }
  }
  return { content: finalContent, provider: 'claude', model: config.llm.claudeModel, toolsUsed: toolsUsed.length > 0 ? toolsUsed : undefined };
}

async function callDeepSeek(messages: LLMMessage[]): Promise<LLMResponse> {
  const client   = getDeepSeek();
  const response = await client.chat.completions.create({
    model:       config.llm.deepseekModel,
    messages:    messages.map(m => ({ role: m.role, content: m.content })),
    max_tokens:  4096,
    temperature: 0.7,
  });
  const choice = response.choices[0];
  return {
    content:    validateResponse(choice?.message?.content, 'deepseek'),
    thinking:   (choice?.message as unknown as { reasoning_content?: string })?.reasoning_content,
    provider:   'deepseek',
    model:      config.llm.deepseekModel,
    tokensUsed: response.usage?.total_tokens,
  };
}

async function callDeepSeekReasoner(messages: LLMMessage[]): Promise<LLMResponse> {
  const client   = getDeepSeek();
  const response = await client.chat.completions.create({
    model:       'deepseek-reasoner',
    messages:    messages.map(m => ({ role: m.role, content: m.content })),
    max_tokens:  4096,
    temperature: 1,
  });
  const choice = response.choices[0];
  return {
    content:  validateResponse(choice?.message?.content, 'deepseek-reasoner'),
    thinking: (choice?.message as unknown as { reasoning_content?: string })?.reasoning_content,
    provider: 'deepseek',
    model:    'deepseek-reasoner',
  };
}

async function callGemini(messages: LLMMessage[]): Promise<LLMResponse> {
  const client    = getGemini();
  const systemMsg = messages.find(m => m.role === 'system')?.content;
  const userMsgs  = messages.filter(m => m.role !== 'system');
  const lastUser  = userMsgs[userMsgs.length - 1]?.content ?? '';
  const fullPrompt = systemMsg ? `${systemMsg}\n\nUser: ${lastUser}` : lastUser;

  const response = await client.models.generateContent({
    model:    'gemini-2.5-flash',
    contents: fullPrompt,
  });
  return {
    content:  validateResponse(response.text, 'gemini'),
    provider: 'claude' as LLMProvider, // typed as claude for compatibility, actual is gemini
    model:    'gemini-2.5-flash',
  };
}

async function callOllama(messages: LLMMessage[]): Promise<LLMResponse> {
  const response = await ollama.chat({
    model:    config.llm.ollamaModel,
    messages: messages.map(m => ({ role: m.role, content: m.content })),
    options:  { temperature: 0.7, num_ctx: 8192 },
  });
  return { content: response.message.content, provider: 'ollama', model: config.llm.ollamaModel };
}

// ── ROUTER ────────────────────────────────────────────────────────

async function callLLM(messages: LLMMessage[], provider: LLMProvider, taskId: string): Promise<LLMResponse> {
  if (detectInjection(messages[messages.length - 1]?.content ?? '')) {
    logSecurityEvent('PROMPT_INJECTION_BLOCKED', { provider, taskId });
    throw new Error('Input blocked — potential prompt injection detected');
  }
  logger.info(`Brain: calling ${provider}`, { messageCount: messages.length, taskId });
  try {
    switch (provider) {
      case 'claude':   return await callClaude(messages, taskId);
      case 'deepseek': return await callDeepSeek(messages);
      case 'ollama':   return await callOllama(messages);
      default:         return await callClaude(messages, taskId);
    }
  } catch (err) {
    logger.exception(err as Error, { provider, taskId });
    if (provider === 'claude' && config.llm.deepseekKey) {
      logger.warn('Claude failed, falling back to DeepSeek', {});
      return callDeepSeek(messages);
    }
    if (provider !== 'ollama') {
      logger.warn('Falling back to local Ollama', {});
      return callOllama(messages);
    }
    throw err;
  }
}

// ── MODULE AI ADAPTER ─────────────────────────────────────────────
// Adapts callLLM to the ModuleAI interface used by TriggerEngine modules

export function createModuleAI(): ModuleAI {
  return {
    async call(model, prompt, systemPrompt) {
      const providerMap: Record<string, LLMProvider> = {
        'claude': 'claude', 'deepseek': 'deepseek',
        'deepseek-reasoner': 'deepseek', 'gemini': 'claude', 'ollama': 'ollama',
      };
      const provider = providerMap[model] ?? 'claude';
      const messages: LLMMessage[] = [
        ...(systemPrompt ? [{ role: 'system' as const, content: systemPrompt }] : []),
        { role: 'user' as const, content: prompt },
      ];
      // Gemini needs special handling
      if (model === 'gemini') {
        const r = await callGemini(messages);
        return r.content;
      }
      if (model === 'deepseek-reasoner') {
        const r = await callDeepSeekReasoner(messages);
        return r.content;
      }
      const r = await callLLM(messages, provider, uuid());
      return r.content;
    },
  };
}

// ── MAIN ENTRY ────────────────────────────────────────────────────

const DEFAULT_SYSTEM = `You are VaultAgent, an autonomous AI assistant with tools for
banking, crypto, DeFi swaps, blockchain data, video analysis, web search, and scheduling.
You have HITL approval gates on all financial actions. Be precise, transparent, and safe.
Today is ${new Date().toISOString().slice(0, 10)}.`;

export async function processTask(task: AgentTask): Promise<AgentResult> {
  const startTime = Date.now();
  logger.info(`Task received: ${task.instruction.slice(0, 100)}`, { taskId: task.id });

  const history = getConversationHistory(task.requestedBy, 10);
  const provider = (task.context['llm'] as LLMProvider | undefined) ?? config.llm.defaultProvider;

  const messages: LLMMessage[] = [
    { role: 'system', content: DEFAULT_SYSTEM },
    ...history,
    { role: 'user', content: task.instruction },
  ];

  storeConversation(task.requestedBy, 'user', task.instruction);

  let response: LLMResponse;
  try {
    response = await callLLM(messages, provider, task.id);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error(`Task failed: ${error}`, { taskId: task.id });
    return { taskId: task.id, success: false, output: `Error: ${error}`, error, duration: Date.now() - startTime, llmUsed: provider, toolsUsed: [] };
  }

  storeConversation(task.requestedBy, 'assistant', response.content);
  storeMemory('task', `Task: ${task.instruction}\nResponse: ${response.content}`, {
    taskId: task.id, type: task.type, llmUsed: response.provider, toolsUsed: response.toolsUsed ?? [],
  });

  logger.info(`Task complete in ${Date.now() - startTime}ms`, { taskId: task.id });
  return {
    taskId:    task.id,
    success:   true,
    output:    response.content,
    data:      { thinking: response.thinking },
    duration:  Date.now() - startTime,
    llmUsed:   response.provider,
    toolsUsed: response.toolsUsed ?? [],
  };
}

export { callLLM, callGemini, callDeepSeekReasoner };
