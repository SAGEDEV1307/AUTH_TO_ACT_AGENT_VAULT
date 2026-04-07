// src/agent-modules/blockchainHelper.ts
// Blockchain coding assistant — Claude for smart contract and Web3 code.

import type { BotModule } from '../module-system.js';
import type { ModuleAI } from '../module-system.js';
import { logger } from '../logger.js';

const blockchainHelper: BotModule = {
  name: 'BlockchainHelper',
  triggers: [
    'solidity', 'smart contract', 'web3', 'ethers', 'abi', 'erc20', 'erc721',
    'nft contract', 'deploy contract', 'hardhat', 'foundry', 'wagmi',
    'wallet connect', 'metamask', 'signature', 'permit2', 'multicall',
  ],
  model: 'claude',
  systemPrompt:
    'You are a senior blockchain engineer. Write secure, gas-efficient Solidity and TypeScript/ethers.js code. ' +
    'Follow Checks-Effects-Interactions pattern. Warn about reentrancy, overflow, access control issues. ' +
    'Reference OpenZeppelin when appropriate. Never use deprecated patterns.',

  async execute(input: string, ai: ModuleAI): Promise<string> {
    try {
      return await ai.call('claude', input, this.systemPrompt);
    } catch (err) {
      logger.error(`BlockchainHelper failed: ${err instanceof Error ? err.message : String(err)}`);
      return 'BlockchainHelper encountered an error. Please try again.';
    }
  },
};

export default blockchainHelper;
