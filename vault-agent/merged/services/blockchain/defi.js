'use strict';

// services/blockchain/defi.js
// Full DeFi service — ERC20, swaps, price feeds, staking, flash loans.
// Uses ABI library via contracts.js.

const { ethers } = require('ethers');
const { getProvider } = require('./provider');
const { getWalletForUser } = require('./wallet');
const contracts = require('./contracts');
const logger = require('../../lib/logger');

// ── ERC20 ─────────────────────────────────────────────────────────

async function getTokenBalance(address, tokenAddress, chainId) {
  const provider = getProvider(chainId);
  const token = contracts.getERC20(tokenAddress, provider);
  const [balance, decimals, symbol, name] = await Promise.all([
    token.balanceOf(address),
    token.decimals(),
    token.symbol(),
    token.name(),
  ]);
  return {
    address: tokenAddress,
    symbol,
    name,
    rawBalance: balance.toString(),
    formattedBalance: ethers.formatUnits(balance, decimals),
    decimals: Number(decimals),
  };
}

async function transferToken(userId, { tokenAddress, toAddress, amount, chainId }) {
  if (!ethers.isAddress(toAddress))  throw new Error('Invalid recipient address');
  if (!ethers.isAddress(tokenAddress)) throw new Error('Invalid token address');
  const wallet = await getWalletForUser(userId, chainId);
  const token  = contracts.getERC20(tokenAddress, wallet);
  const decimals = await token.decimals();
  const parsedAmount = ethers.parseUnits(String(amount), decimals);
  logger.info('ERC20 transfer', { userId, tokenAddress, toAddress, amount });
  const tx = await token.transfer(toAddress, parsedAmount);
  await tx.wait(1);
  return { txHash: tx.hash, from: wallet.address, to: toAddress, amount, tokenAddress };
}

async function approveToken(userId, { tokenAddress, spenderAddress, amount, chainId }) {
  const wallet = await getWalletForUser(userId, chainId);
  const token  = contracts.getERC20(tokenAddress, wallet);
  const decimals = await token.decimals();
  const parsedAmount = amount === 'max'
    ? ethers.MaxUint256
    : ethers.parseUnits(String(amount), decimals);
  logger.info('ERC20 approve', { userId, tokenAddress, spenderAddress, amount });
  const tx = await token.approve(spenderAddress, parsedAmount);
  await tx.wait(1);
  return { txHash: tx.hash, spender: spenderAddress, amount };
}

// ── CHAINLINK PRICE FEEDS ─────────────────────────────────────────
// Well-known feed addresses: https://data.chain.link
const PRICE_FEEDS = {
  'ETH/USD': {
    ethereum: '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419',
    arbitrum: '0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612',
    optimism: '0x13e3Ee699D1909E989722E753853AE30b17e08c5',
    base:     '0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70',
    polygon:  '0xF9680D99D6C9589e2a93a78A04A279e509205945',
    avalanche:'0x0A77230d17318075983913bC2145DB16C7366156',
  },
  'BTC/USD': {
    ethereum: '0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c',
    arbitrum: '0x6ce185860a4963106506C203335A2910413708e9',
    optimism: '0xD702DD976Fb76Fffc2D3963D037dfDae5b04E593',
  },
  'LINK/USD': {
    ethereum: '0x2c1d072e956AFFC0D435Cb7AC308d97e0995D8',
    arbitrum: '0x86E53CF1B873786aC51576Dc20B5BDb74D3D08a3',
  },
};

async function getPrice(pair, chainName) {
  const chainId = contracts.getChainConfig(chainName)?.chain_id;
  if (!chainId) throw new Error(`Unknown chain: ${chainName}`);
  const feedAddr = PRICE_FEEDS[pair]?.[chainName];
  if (!feedAddr) throw new Error(`No price feed for ${pair} on ${chainName}`);
  const provider = getProvider(chainId);
  const feed = contracts.getChainlinkFeed(feedAddr, provider);
  const [roundData, decimals] = await Promise.all([
    feed.latestRoundData(),
    feed.decimals(),
  ]);
  const price = ethers.formatUnits(roundData.answer, decimals);
  logger.info('Price feed read', { pair, chainName, price });
  return {
    pair,
    price: parseFloat(price),
    rawAnswer: roundData.answer.toString(),
    decimals: Number(decimals),
    updatedAt: Number(roundData.updatedAt),
    chainName,
  };
}

// ── UNISWAP V3 SWAP ───────────────────────────────────────────────
// Swap router addresses (same on most chains)
const UNI_V3_ROUTER = {
  ethereum: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
  arbitrum: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
  optimism: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
  base:     '0x2626664c2603336E57B271c5C0b26F421741e481',
  polygon:  '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
};

const UNI_V3_QUOTER = {
  ethereum: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
  arbitrum: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
  optimism: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
  base:     '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a',
  polygon:  '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
};

async function quoteSwap({ tokenIn, tokenOut, amountIn, fee = 3000, chainName }) {
  const chainId   = contracts.getChainConfig(chainName)?.chain_id;
  if (!chainId) throw new Error(`Unknown chain: ${chainName}`);
  const quoterAddr = UNI_V3_QUOTER[chainName];
  if (!quoterAddr) throw new Error(`No V3 quoter on ${chainName}`);
  const provider = getProvider(chainId);
  const quoter   = contracts.getUniV3Quoter(quoterAddr, provider);
  const tokenInContract  = contracts.getERC20(tokenIn, provider);
  const tokenOutContract = contracts.getERC20(tokenOut, provider);
  const [decimalsIn, decimalsOut] = await Promise.all([
    tokenInContract.decimals(),
    tokenOutContract.decimals(),
  ]);
  const amountInParsed = ethers.parseUnits(String(amountIn), decimalsIn);
  const result = await quoter.quoteExactInputSingle.staticCall({
    tokenIn, tokenOut,
    amountIn: amountInParsed,
    fee,
    sqrtPriceLimitX96: 0n,
  });
  return {
    amountIn,
    amountOut: ethers.formatUnits(result.amountOut, decimalsOut),
    amountOutRaw: result.amountOut.toString(),
    priceImpact: Number(result.sqrtPriceX96After),
    fee,
    tokenIn, tokenOut, chainName,
  };
}

async function swapExactInput(userId, { tokenIn, tokenOut, amountIn, fee = 3000, slippageBps = 50, chainName }) {
  const chainId = contracts.getChainConfig(chainName)?.chain_id;
  if (!chainId) throw new Error(`Unknown chain: ${chainName}`);
  const routerAddr = UNI_V3_ROUTER[chainName];
  if (!routerAddr) throw new Error(`No V3 router on ${chainName}`);
  const wallet = await getWalletForUser(userId, chainId);
  // Get quote first
  const quote = await quoteSwap({ tokenIn, tokenOut, amountIn, fee, chainName });
  const amountOutMin = (BigInt(quote.amountOutRaw) * BigInt(10000 - slippageBps)) / 10000n;
  // Approve router
  const tokenInDecimals = await contracts.getERC20(tokenIn, wallet).decimals();
  const amountInParsed  = ethers.parseUnits(String(amountIn), tokenInDecimals);
  await approveToken(userId, { tokenAddress: tokenIn, spenderAddress: routerAddr, amount: amountIn, chainId });
  // Execute swap
  const router = contracts.getUniV3SwapRouter(routerAddr, wallet);
  const deadline = Math.floor(Date.now() / 1000) + 300; // 5 min
  logger.info('V3 swap', { userId, tokenIn, tokenOut, amountIn, chainName });
  const tx = await router.exactInputSingle({
    tokenIn, tokenOut, fee,
    recipient:        wallet.address,
    amountIn:         amountInParsed,
    amountOutMinimum: amountOutMin,
    sqrtPriceLimitX96: 0n,
  });
  const receipt = await tx.wait(1);
  return { txHash: tx.hash, amountIn, amountOutMin: ethers.formatUnits(amountOutMin, 18), chainName };
}

// ── AAVE V3 LENDING ───────────────────────────────────────────────
const AAVE_V3_POOLS = {
  ethereum: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2',
  arbitrum: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
  optimism: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
  base:     '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5',
  polygon:  '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
  avalanche:'0x794a61358D6845594F94dc1DB02A252b5b4814aD',
};

async function aaveSupply(userId, { tokenAddress, amount, chainName }) {
  const chainId = contracts.getChainConfig(chainName)?.chain_id;
  if (!chainId) throw new Error(`Unknown chain: ${chainName}`);
  const poolAddr = AAVE_V3_POOLS[chainName];
  if (!poolAddr) throw new Error(`No Aave V3 pool on ${chainName}`);
  const wallet = await getWalletForUser(userId, chainId);
  const token  = contracts.getERC20(tokenAddress, wallet);
  const decimals = await token.decimals();
  const amountParsed = ethers.parseUnits(String(amount), decimals);
  // Approve Aave pool
  const approveTx = await token.approve(poolAddr, amountParsed);
  await approveTx.wait(1);
  // Supply
  const pool = contracts.getAaveV3Pool(poolAddr, wallet);
  logger.info('Aave V3 supply', { userId, tokenAddress, amount, chainName });
  const tx = await pool.supply(tokenAddress, amountParsed, wallet.address, 0);
  await tx.wait(1);
  return { txHash: tx.hash, action: 'supply', token: tokenAddress, amount, chainName };
}

async function aaveBorrow(userId, { tokenAddress, amount, interestRateMode = 2, chainName }) {
  // interestRateMode: 1 = stable, 2 = variable
  const chainId = contracts.getChainConfig(chainName)?.chain_id;
  if (!chainId) throw new Error(`Unknown chain: ${chainName}`);
  const poolAddr = AAVE_V3_POOLS[chainName];
  if (!poolAddr) throw new Error(`No Aave V3 pool on ${chainName}`);
  const wallet = await getWalletForUser(userId, chainId);
  const token  = contracts.getERC20(tokenAddress, getProvider(chainId));
  const decimals = await token.decimals();
  const amountParsed = ethers.parseUnits(String(amount), decimals);
  const pool = contracts.getAaveV3Pool(poolAddr, wallet);
  logger.info('Aave V3 borrow', { userId, tokenAddress, amount, chainName });
  const tx = await pool.borrow(tokenAddress, amountParsed, interestRateMode, 0, wallet.address);
  await tx.wait(1);
  return { txHash: tx.hash, action: 'borrow', token: tokenAddress, amount, chainName };
}

// ── LIDO STAKING ──────────────────────────────────────────────────

async function stakeEth(userId, { amountEth, chainName = 'ethereum' }) {
  if (chainName !== 'ethereum') throw new Error('Lido staking is Ethereum mainnet only');
  const chainId = 1;
  const wallet  = await getWalletForUser(userId, chainId);
  const steth   = contracts.getLidoStEth(wallet);
  const amountWei = ethers.parseEther(String(amountEth));
  logger.info('Lido stake', { userId, amountEth });
  const tx = await steth.submit(ethers.ZeroAddress, { value: amountWei });
  await tx.wait(1);
  const stEthBalance = await steth.balanceOf(wallet.address);
  return {
    txHash: tx.hash,
    action: 'stake_eth',
    amountEth,
    stEthReceived: ethers.formatEther(stEthBalance),
  };
}

async function wrapStEth(userId, { amount }) {
  const wallet  = await getWalletForUser(userId, 1);
  const wsteth  = contracts.getLidoWstEth('ethereum', wallet);
  const steth   = contracts.getLidoStEth(getProvider(1));
  const decimals = await steth.decimals();
  const parsedAmount = ethers.parseUnits(String(amount), decimals);
  // Approve wstETH contract to spend stETH
  const stethWrite = contracts.getLidoStEth(wallet);
  await (await stethWrite.approve(await wsteth.getAddress(), parsedAmount)).wait(1);
  logger.info('Wrap stETH → wstETH', { userId, amount });
  const tx = await wsteth.wrap(parsedAmount);
  await tx.wait(1);
  return { txHash: tx.hash, action: 'wrap_steth', amount };
}

// ── MULTI-CHAIN TOKEN HELPERS ─────────────────────────────────────

function getTokenAddressOnChain(token, chainName) {
  return contracts.getTokenAddress(token, chainName);
}

function listSupportedChains() {
  return Object.entries(contracts.CHAIN_CONFIGS).map(([name, cfg]) => ({
    name,
    chainId: cfg.chain_id,
    native:  cfg.native,
    rpc:     cfg.rpc,
  }));
}

module.exports = {
  getTokenBalance,
  transferToken,
  approveToken,
  getPrice,
  quoteSwap,
  swapExactInput,
  aaveSupply,
  aaveBorrow,
  stakeEth,
  wrapStEth,
  getTokenAddressOnChain,
  listSupportedChains,
  PRICE_FEEDS,
  AAVE_V3_POOLS,
  UNI_V3_ROUTER,
};
