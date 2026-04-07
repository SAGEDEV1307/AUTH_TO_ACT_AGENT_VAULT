'use strict';

const { ethers } = require('ethers');
const { CHAINS } = require('./constants');
const logger = require('./logger');

function getProvider(chainId = parseInt(process.env.CHAIN_ID || '1')) {
  const chain = Object.values(CHAINS).find(c => c.id === chainId);
  if (!chain) throw new Error(`Unsupported chain ID: ${chainId}`);
  const apiKey = process.env.ALCHEMY_API_KEY;
  if (!apiKey) throw new Error('ALCHEMY_API_KEY not set');
  return new ethers.JsonRpcProvider(`${chain.rpc}${apiKey}`);
}

function getWallet(privateKey, chainId) {
  const provider = getProvider(chainId);
  return new ethers.Wallet(privateKey, provider);
}

async function getBalance(address, chainId) {
  const provider = getProvider(chainId);
  const balance = await provider.getBalance(address);
  return {
    wei: balance.toString(),
    ether: ethers.formatEther(balance),
  };
}

async function getGasPrice(chainId) {
  const provider = getProvider(chainId);
  const feeData = await provider.getFeeData();
  return {
    gasPrice: feeData.gasPrice?.toString(),
    maxFeePerGas: feeData.maxFeePerGas?.toString(),
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas?.toString(),
  };
}

async function getTransaction(txHash, chainId) {
  const provider = getProvider(chainId);
  const tx = await provider.getTransaction(txHash);
  if (!tx) return null;
  const receipt = await provider.getTransactionReceipt(txHash);
  return {
    hash: tx.hash,
    from: tx.from,
    to: tx.to,
    value: ethers.formatEther(tx.value),
    gasLimit: tx.gasLimit?.toString(),
    gasPrice: tx.gasPrice?.toString(),
    nonce: tx.nonce,
    blockNumber: tx.blockNumber,
    status: receipt?.status === 1 ? 'success' : receipt ? 'failed' : 'pending',
    confirmations: receipt ? await receipt.confirmations() : 0,
  };
}

async function estimateGas(txParams, chainId) {
  const provider = getProvider(chainId);
  const estimate = await provider.estimateGas(txParams);
  return estimate.toString();
}

function isValidAddress(address) {
  return ethers.isAddress(address);
}

function formatEther(wei) {
  return ethers.formatEther(wei);
}

function parseEther(ether) {
  return ethers.parseEther(ether);
}

module.exports = {
  getProvider,
  getWallet,
  getBalance,
  getGasPrice,
  getTransaction,
  estimateGas,
  isValidAddress,
  formatEther,
  parseEther,
};
