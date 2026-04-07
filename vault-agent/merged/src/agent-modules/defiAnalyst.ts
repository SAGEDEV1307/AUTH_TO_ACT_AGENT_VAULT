// src/agent-modules/defiAnalyst.ts
// DeFi analyst module — uses Gemini to analyze on-chain data and explain DeFi strategies.
// Triggered by DeFi-related queries. Uses the ABI library for price/swap data.

import type { BotModule } from '../module-system.js';
import type { ModuleAI } from '../module-system.js';
import { logger } from '../logger.js';

const defiAnalyst: BotModule = {
  name: 'DeFiAnalyst',
  triggers: [
    'defi', 'swap', 'liquidity', 'yield', 'apy', 'aave', 'uniswap',
    'staking', 'restaking', 'eigenlayer', 'lido', 'flash loan',
    'token price', 'gas price', 'bridge', 'cross-chain',
    'impermanent loss', 'slippage', 'tvl', 'protocol',
  ],
  model: 'gemini',
  systemPrompt:
    'You are an expert DeFi analyst. Explain DeFi concepts clearly, ' +
    'analyze protocols, risks, and strategies. Reference real protocols ' +
    '(Uniswap V3/V4, Aave V3, Lido, EigenLayer, Curve, Balancer, GMX). ' +
    'Always flag risks: impermanent loss, liquidation, smart contract risk. ' +
    'Be specific about fees, APYs, and mechanics.',

  async execute(input: string, ai: ModuleAI): Promise<string> {
    try {
      return await ai.call('gemini', input, this.systemPrompt);
    } catch (err) {
      logger.error(`DeFiAnalyst failed: ${err instanceof Error ? err.message : String(err)}`);
      return 'DeFiAnalyst encountered an error. Please try again.';
    }
  },
};

export default defiAnalyst;
