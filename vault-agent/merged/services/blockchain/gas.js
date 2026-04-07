'use strict';

const { getProvider } = require('./provider');

async function getGasPrice(chainId) {
  const provider = getProvider(chainId);
  const feeData = await provider.getFeeData();
  return {
    gasPrice: feeData.gasPrice?.toString(),
    maxFeePerGas: feeData.maxFeePerGas?.toString(),
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas?.toString(),
    gasPriceGwei: feeData.gasPrice ? (Number(feeData.gasPrice) / 1e9).toFixed(2) : null,
  };
}

async function estimateGas(txParams, chainId) {
  const provider = getProvider(chainId);
  const estimate = await provider.estimateGas(txParams);
  return { gasUnits: estimate.toString() };
}

async function estimateTxCost(txParams, chainId) {
  const [gasEst, feeData] = await Promise.all([
    estimateGas(txParams, chainId),
    getGasPrice(chainId),
  ]);
  const gasUnits = BigInt(gasEst.gasUnits);
  const maxFee = BigInt(feeData.maxFeePerGas || feeData.gasPrice || 0);
  const costWei = gasUnits * maxFee;
  const { ethers } = require('ethers');
  return {
    gasUnits: gasEst.gasUnits,
    maxFeePerGas: feeData.maxFeePerGas,
    estimatedCostWei: costWei.toString(),
    estimatedCostEther: ethers.formatEther(costWei),
  };
}

module.exports = { getGasPrice, estimateGas, estimateTxCost };
