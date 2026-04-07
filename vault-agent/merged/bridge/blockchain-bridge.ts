// bridge/blockchain-bridge.ts
// Typed wrapper over lib/web3.js + services/blockchain/*.js
// Merges AgenticVault blockchain with autonomous-agent crypto-wallet

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const web3Lib = require('../lib/web3.js') as {
  getProvider:      (chainId?: number) => unknown;
  getBalance:       (address: string, chainId?: number) => Promise<{ wei: string; ether: string }>;
  getGasPrice:      (chainId?: number) => Promise<{ gasPrice: string | null; maxFeePerGas: string | null; maxPriorityFeePerGas: string | null; gasPriceGwei: string | null }>;
  getTransaction:   (txHash: string, chainId?: number) => Promise<Record<string, unknown> | null>;
  isValidAddress:   (address: string) => boolean;
  formatEther:      (wei: string | bigint) => string;
  parseEther:       (ether: string) => bigint;
};

export interface BalanceResult  { wei: string; ether: string }
export interface GasPriceResult { gasPrice: string | null; maxFeePerGas: string | null; maxPriorityFeePerGas: string | null; gasPriceGwei: string | null }

export const getOnchainBalance  = (address: string, chainId?: number): Promise<BalanceResult> =>
  web3Lib.getBalance(address, chainId);

export const getGasPrice        = (chainId?: number): Promise<GasPriceResult> =>
  web3Lib.getGasPrice(chainId);

export const getOnchainTx       = (txHash: string, chainId?: number): Promise<Record<string, unknown> | null> =>
  web3Lib.getTransaction(txHash, chainId);

export const isValidEthAddress  = (address: string): boolean =>
  web3Lib.isValidAddress(address);

export const formatEther        = (wei: string | bigint): string =>
  web3Lib.formatEther(wei);

export const parseEther         = (ether: string): bigint =>
  web3Lib.parseEther(ether);
