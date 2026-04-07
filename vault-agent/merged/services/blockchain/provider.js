'use strict';

const { ethers } = require('ethers');
const { CHAINS } = require('../../lib/constants');
const logger = require('../../lib/logger');

const providers = {};

function getProvider(chainId = parseInt(process.env.CHAIN_ID || '1')) {
  if (providers[chainId]) return providers[chainId];
  const chain = Object.values(CHAINS).find(c => c.id === chainId);
  if (!chain) throw new Error(`Unsupported chainId: ${chainId}`);
  const apiKey = process.env.ALCHEMY_API_KEY;
  if (!apiKey || apiKey === 'placeholder') throw new Error('ALCHEMY_API_KEY not configured');
  const provider = new ethers.JsonRpcProvider(`${chain.rpc}${apiKey}`);
  providers[chainId] = provider;
  return provider;
}

async function getBlockNumber(chainId) {
  return getProvider(chainId).getBlockNumber();
}

async function getBlock(blockNumber, chainId) {
  return getProvider(chainId).getBlock(blockNumber);
}

async function getNetwork(chainId) {
  const network = await getProvider(chainId).getNetwork();
  return { chainId: Number(network.chainId), name: network.name };
}

module.exports = { getProvider, getBlockNumber, getBlock, getNetwork };
