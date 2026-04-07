'use strict';

const { TOOL_NAMES } = require('../../lib/constants');
const { checkToolPermission } = require('./permission-check');
const logger = require('../../lib/logger');

// Built-in tool implementations
async function executeWebSearch(input) {
  // Placeholder: integrate a real search API (Brave, Google, etc.)
  const { query } = input;
  if (!query) throw new Error('web_search requires a query');
  logger.info('Tool: web_search', { query });
  return { result: `Search results for: "${query}" — integrate a search API here.`, query };
}

async function executeHttpRequest(input) {
  const { url, method = 'GET', headers = {}, body } = input;
  if (!url) throw new Error('http_request requires a url');
  // Whitelist check — only allow https
  if (!url.startsWith('https://')) throw new Error('Only HTTPS URLs are allowed');
  logger.info('Tool: http_request', { url, method });
  const response = await fetch(url, {
    method,
    headers: { 'User-Agent': 'AuthorizedToAct/1.0', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  return {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    body: text.slice(0, 10000), // limit response size
  };
}

async function executeBlockchainRead(input, userId) {
  const { action, address, contractAddress, tokenId, chainId = 1 } = input;
  const web3 = require('../../lib/web3');
  switch (action) {
    case 'get_balance':
      return web3.getBalance(address, chainId);
    case 'get_transaction':
      return web3.getTransaction(input.txHash, chainId);
    case 'get_gas_price':
      return web3.getGasPrice(chainId);
    default:
      throw new Error(`Unknown blockchain_read action: ${action}`);
  }
}

async function executeBlockchainSend(input, userId) {
  const { action, chainId = 1 } = input;
  const txService = require('../blockchain/transactions');
  switch (action) {
    case 'send_eth':
      return txService.sendTransaction(userId, { to: input.to, value: input.value, chainId });
    default:
      throw new Error(`Unknown blockchain_send action: ${action}`);
  }
}

// Main executor — called by agent loop
async function executeTool(toolName, input, context = {}) {
  const { userId } = context;

  // Permission check
  if (userId) {
    await checkToolPermission(userId, toolName);
  }

  logger.info('Executing tool', { tool: toolName, userId });

  switch (toolName) {
    case TOOL_NAMES.WEB_SEARCH:
      return executeWebSearch(input);
    case TOOL_NAMES.HTTP_REQUEST:
      return executeHttpRequest(input);
    case TOOL_NAMES.BLOCKCHAIN_READ:
      return executeBlockchainRead(input, userId);
    case TOOL_NAMES.BLOCKCHAIN_SEND:
      return executeBlockchainSend(input, userId);
    default:
      throw new Error(`Tool not implemented: ${toolName}`);
  }
}

// Tool definitions for the AI model (Anthropic format)
const TOOL_DEFINITIONS = [
  {
    name: TOOL_NAMES.WEB_SEARCH,
    description: 'Search the web for current information',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Search query' } },
      required: ['query'],
    },
  },
  {
    name: TOOL_NAMES.HTTP_REQUEST,
    description: 'Make an HTTP request to an HTTPS URL',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE'] },
        headers: { type: 'object' },
        body: { type: 'object' },
      },
      required: ['url'],
    },
  },
  {
    name: TOOL_NAMES.BLOCKCHAIN_READ,
    description: 'Read data from the blockchain (balances, transactions, gas prices)',
    input_schema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['get_balance', 'get_transaction', 'get_gas_price'] },
        address: { type: 'string' },
        txHash: { type: 'string' },
        chainId: { type: 'number' },
      },
      required: ['action'],
    },
  },
  {
    name: TOOL_NAMES.BLOCKCHAIN_SEND,
    description: 'Send transactions on the blockchain',
    input_schema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['send_eth'] },
        to: { type: 'string' },
        value: { type: 'string' },
        chainId: { type: 'number' },
      },
      required: ['action', 'to', 'value'],
    },
  },
];

module.exports = { executeTool, TOOL_DEFINITIONS };

// ── DEFI TOOL DEFINITIONS (from ABI library integration) ──────────

const DEFI_TOOL_DEFINITIONS = [
  {
    name: 'swap_tokens',
    description: 'Swap ERC-20 tokens via Uniswap V3. Quotes first, then executes with slippage protection.',
    input_schema: {
      type: 'object',
      properties: {
        tokenIn:   { type: 'string', description: 'Input token address or symbol' },
        tokenOut:  { type: 'string', description: 'Output token address or symbol' },
        amountIn:  { type: 'string', description: 'Amount to swap' },
        chainName: { type: 'string', description: 'Chain: ethereum, arbitrum, base, optimism, polygon' },
        fee:       { type: 'number', description: 'Pool fee: 500 (0.05%), 3000 (0.3%), 10000 (1%)' },
      },
      required: ['tokenIn', 'tokenOut', 'amountIn', 'chainName'],
    },
  },
  {
    name: 'get_token_price',
    description: 'Get real-time price from Chainlink oracles. Supports ETH/USD, BTC/USD, LINK/USD.',
    input_schema: {
      type: 'object',
      properties: {
        pair:      { type: 'string', description: 'Price pair e.g. ETH/USD' },
        chainName: { type: 'string', description: 'Chain to query' },
      },
      required: ['pair', 'chainName'],
    },
  },
  {
    name: 'stake_eth',
    description: 'Stake ETH via Lido protocol to receive liquid staking token (stETH). Ethereum mainnet only.',
    input_schema: {
      type: 'object',
      properties: {
        amountEth: { type: 'string', description: 'Amount of ETH to stake' },
      },
      required: ['amountEth'],
    },
  },
  {
    name: 'get_token_balance',
    description: 'Get ERC-20 token balance for any address on any EVM chain.',
    input_schema: {
      type: 'object',
      properties: {
        address:      { type: 'string', description: 'Wallet address' },
        tokenAddress: { type: 'string', description: 'ERC-20 token contract address' },
        chainId:      { type: 'number', description: 'Chain ID' },
      },
      required: ['address', 'tokenAddress', 'chainId'],
    },
  },
  {
    name: 'list_chains',
    description: 'List all supported blockchain networks with their chain IDs and native tokens.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
];

// Append to TOOL_DEFINITIONS export
if (typeof module !== 'undefined' && module.exports) {
  const existing = module.exports.TOOL_DEFINITIONS || [];
  module.exports.TOOL_DEFINITIONS = [...existing, ...DEFI_TOOL_DEFINITIONS];
}
