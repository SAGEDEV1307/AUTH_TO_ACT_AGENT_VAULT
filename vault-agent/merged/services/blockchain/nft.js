'use strict';

const { ethers } = require('ethers');
const { getProvider } = require('./provider');
const { getWalletForUser } = require('./wallet');
const logger = require('../../lib/logger');

const ERC721_ABI = [
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function balanceOf(address owner) view returns (uint256)',
  'function tokenURI(uint256 tokenId) view returns (string)',
  'function transferFrom(address from, address to, uint256 tokenId)',
  'function safeTransferFrom(address from, address to, uint256 tokenId)',
  'function approve(address to, uint256 tokenId)',
  'function getApproved(uint256 tokenId) view returns (address)',
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
];

function getNFTContract(contractAddress, chainId, wallet = null) {
  const signerOrProvider = wallet || getProvider(chainId);
  return new ethers.Contract(contractAddress, ERC721_ABI, signerOrProvider);
}

async function getNFTInfo(contractAddress, tokenId, chainId) {
  const contract = getNFTContract(contractAddress, chainId);
  const [owner, tokenURI, name, symbol] = await Promise.all([
    contract.ownerOf(tokenId).catch(() => null),
    contract.tokenURI(tokenId).catch(() => null),
    contract.name().catch(() => null),
    contract.symbol().catch(() => null),
  ]);
  return { contractAddress, tokenId: tokenId.toString(), owner, tokenURI, name, symbol };
}

async function transferNFT(userId, { contractAddress, tokenId, toAddress, chainId }) {
  if (!ethers.isAddress(toAddress)) throw new Error('Invalid recipient address');
  const wallet = await getWalletForUser(userId, chainId);
  const contract = getNFTContract(contractAddress, chainId, wallet);
  logger.info('NFT transfer', { userId, contractAddress, tokenId, toAddress });
  const tx = await contract.safeTransferFrom(wallet.address, toAddress, tokenId);
  await tx.wait(1);
  return { txHash: tx.hash, from: wallet.address, to: toAddress, tokenId: tokenId.toString() };
}

async function getWalletNFTs(address, contractAddress, chainId) {
  const contract = getNFTContract(contractAddress, chainId);
  const filter = contract.filters.Transfer(null, address);
  const events = await contract.queryFilter(filter);
  const tokenIds = [...new Set(events.map(e => e.args.tokenId.toString()))];

  // Verify current ownership
  const owned = [];
  for (const tokenId of tokenIds) {
    try {
      const owner = await contract.ownerOf(tokenId);
      if (owner.toLowerCase() === address.toLowerCase()) {
        owned.push(tokenId);
      }
    } catch {}
  }
  return owned;
}

module.exports = { getNFTInfo, transferNFT, getWalletNFTs };
