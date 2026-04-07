'use strict';

// services/blockchain/contracts.js
// Loads all ABIs from the abi/ library and returns typed ethers Contract instances.
// This is the single source of truth for all contract interactions.

const { ethers } = require('ethers');
const path = require('path');

const ABI_ROOT = path.join(__dirname, '../../abi');

// Lazy-load ABIs — only read from disk once, cache in memory
const abiCache = new Map();

function loadAbi(relativePath) {
  if (abiCache.has(relativePath)) return abiCache.get(relativePath);
  const full = path.join(ABI_ROOT, relativePath);
  const json = require(full);
  // Most ABIs have a top-level "abi" array; some are bare arrays
  const abi = Array.isArray(json) ? json : (json.abi || json);
  abiCache.set(relativePath, abi);
  return abi;
}

// ── ABI loaders ──────────────────────────────────────────────────

function erc20Abi()              { return loadAbi('evm/tokens/ERC20_standard.json').abi || loadAbi('evm/tokens/ERC20_standard.json'); }
function erc721Abi()             { return loadAbi('evm/nft/ERC721_Standard.json'); }
function erc1155Abi()            { return loadAbi('evm/nft/ERC1155_Standard.json'); }
function weth9Abi()              { return loadAbi('evm/weth/WETH9.json'); }

function uniV2RouterAbi()        { return loadAbi('evm/uniswap_v2/UniswapV2_Router02.json'); }
function uniV2FactoryAbi()       { return loadAbi('evm/uniswap_v2/UniswapV2_Factory.json'); }
function uniV2PairAbi()          { return loadAbi('evm/uniswap_v2/UniswapV2_Pair.json'); }

function uniV3SwapRouterAbi()    { return loadAbi('evm/uniswap_v3/UniswapV3_SwapRouter02.json'); }
function uniV3FactoryAbi()       { return loadAbi('evm/uniswap_v3/UniswapV3_Factory.json'); }
function uniV3PoolAbi()          { return loadAbi('evm/uniswap_v3/UniswapV3_Pool.json'); }
function uniV3QuoterAbi()        { return loadAbi('evm/uniswap_v3/UniswapV3_QuoterV2.json'); }
function uniV3PositionMgrAbi()   { return loadAbi('evm/uniswap_v3/UniswapV3_NonfungiblePositionManager.json'); }

function uniV4PoolManagerAbi()   { return loadAbi('evm/uniswap_v4/UniswapV4_PoolManager.json'); }
function uniV4UniversalRouterAbi(){ return loadAbi('evm/uniswap_v4/UniswapV4_UniversalRouter.json'); }

function aaveV3PoolAbi()         { return loadAbi('evm/aave/Aave_V3_Pool.json'); }
function aaveFlashLoanAbi()      { return loadAbi('evm/flash_loans/Aave_V3_FlashLoan_Receiver.json'); }
function balancerVaultAbi()      { return loadAbi('evm/balancer/Balancer_V2_Vault.json'); }
function balancerFlashLoanAbi()  { return loadAbi('evm/flash_loans/Balancer_V2_FlashLoan.json'); }
function uniV3FlashSwapAbi()     { return loadAbi('evm/flash_loans/Uniswap_V3_FlashSwap.json'); }

function chainlinkFeedAbi()      { return loadAbi('evm/chainlink/Chainlink_PriceFeed.json'); }
function permit2Abi()            { return loadAbi('evm/permit2/Permit2.json'); }

function lidoStEthAbi()          { return loadAbi('evm/staking/Lido_stETH.json'); }
function lidoWstEthAbi()         { return loadAbi('evm/staking/Lido_wstETH.json'); }
function rocketDepositAbi()      { return loadAbi('evm/staking/RocketPool_DepositPool.json'); }
function rocketREthAbi()         { return loadAbi('evm/staking/RocketPool_rETH.json'); }

function eigenStrategyMgrAbi()   { return loadAbi('evm/restaking/EigenLayer_StrategyManager.json'); }
function eigenDelegationAbi()    { return loadAbi('evm/restaking/EigenLayer_DelegationManager.json'); }

function stargateAbi()           { return loadAbi('evm/bridges/Stargate_V2_Pool.json'); }
function layerZeroAbi()          { return loadAbi('evm/bridges/LayerZero_Endpoint_V2.json'); }
function cctpAbi()               { return loadAbi('evm/bridges/Circle_CCTP_V2.json'); }

function gmxExchangeRouterAbi()  { return loadAbi('evm/perps/GMX_V2_ExchangeRouter.json'); }
function curveRouterAbi()        { return loadAbi('evm/curve/Curve_Router.json'); }
function sushiV2RouterAbi()      { return loadAbi('evm/sushiswap/SushiSwap_V2_Router.json'); }
function oneInchRouterAbi()      { return loadAbi('evm/1inch/1inch_AggregationRouterV6.json'); }

// ── Known addresses ──────────────────────────────────────────────
// Permit2 is the same on ALL EVM chains
const PERMIT2_ADDRESS = '0x000000000022D473030F116dDEE9F6B43aC78BA3';

// Load token addresses from library
const TOKEN_ADDRESSES = (() => {
  try { return require(path.join(ABI_ROOT, 'evm/tokens/Multichain_Token_Addresses.json')); }
  catch { return {}; }
})();

const CHAIN_CONFIGS = (() => {
  try { return require(path.join(ABI_ROOT, 'CHAIN_CONFIGS.json')).chains; }
  catch { return {}; }
})();

// ── Contract factory ─────────────────────────────────────────────

function getContract(address, abi, signerOrProvider) {
  return new ethers.Contract(address, abi, signerOrProvider);
}

// ── Named contract getters ────────────────────────────────────────

function getERC20(address, signerOrProvider) {
  return getContract(address, erc20Abi(), signerOrProvider);
}

function getUniV3SwapRouter(address, signerOrProvider) {
  return getContract(address, uniV3SwapRouterAbi(), signerOrProvider);
}

function getUniV3Quoter(address, signerOrProvider) {
  return getContract(address, uniV3QuoterAbi(), signerOrProvider);
}

function getAaveV3Pool(address, signerOrProvider) {
  return getContract(address, aaveV3PoolAbi(), signerOrProvider);
}

function getChainlinkFeed(address, signerOrProvider) {
  return getContract(address, chainlinkFeedAbi(), signerOrProvider);
}

function getLidoStEth(signerOrProvider) {
  // stETH is Ethereum mainnet only
  return getContract('0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84', lidoStEthAbi(), signerOrProvider);
}

function getLidoWstEth(chainName, signerOrProvider) {
  const addresses = {
    ethereum:  '0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0',
    arbitrum:  '0x5979D7b546E38E414F7E9822514be443A4800529',
    optimism:  '0x1F32b1c2345538c0c6f582fCB022739c4A194Ebb',
    base:      '0xc1cba3fcea344f92d9239c08c0568f6f2f0ee452',
    polygon:   '0x03b54A6e9a984069379fae1a4fC4dBAE93B3bCCD',
  };
  const addr = addresses[chainName];
  if (!addr) throw new Error(`wstETH not available on ${chainName}`);
  return getContract(addr, lidoWstEthAbi(), signerOrProvider);
}

function getPermit2(signerOrProvider) {
  return getContract(PERMIT2_ADDRESS, permit2Abi(), signerOrProvider);
}

function getTokenAddress(token, chain) {
  return TOKEN_ADDRESSES[token]?.[chain] || null;
}

function getChainConfig(chainName) {
  return CHAIN_CONFIGS[chainName] || null;
}

module.exports = {
  // ABI getters
  erc20Abi, erc721Abi, erc1155Abi, weth9Abi,
  uniV2RouterAbi, uniV2FactoryAbi, uniV2PairAbi,
  uniV3SwapRouterAbi, uniV3FactoryAbi, uniV3PoolAbi, uniV3QuoterAbi, uniV3PositionMgrAbi,
  uniV4PoolManagerAbi, uniV4UniversalRouterAbi,
  aaveV3PoolAbi, aaveFlashLoanAbi,
  balancerVaultAbi, balancerFlashLoanAbi, uniV3FlashSwapAbi,
  chainlinkFeedAbi, permit2Abi,
  lidoStEthAbi, lidoWstEthAbi, rocketDepositAbi, rocketREthAbi,
  eigenStrategyMgrAbi, eigenDelegationAbi,
  stargateAbi, layerZeroAbi, cctpAbi,
  gmxExchangeRouterAbi, curveRouterAbi, sushiV2RouterAbi, oneInchRouterAbi,
  // Contract instance getters
  getContract, getERC20, getUniV3SwapRouter, getUniV3Quoter,
  getAaveV3Pool, getChainlinkFeed, getLidoStEth, getLidoWstEth, getPermit2,
  // Address helpers
  getTokenAddress, getChainConfig,
  PERMIT2_ADDRESS, TOKEN_ADDRESSES, CHAIN_CONFIGS,
};
