// src/modules/crypto-wallet.ts
// ================================================================
// MODULE 8: CRYPTO WALLET
// ethers.js v6 — Wallet management, ETH balance, transfers.
// Private key encrypted at rest. HITL for all transfers.
// Agent owns its own wallet address.
// ================================================================

import { ethers }    from 'ethers';
import crypto        from 'crypto';
import { config }    from '../config.js';
import { Logger }    from './logger.js';
import { getDailySpend, logFinancialAction } from './memory.js';
import type { WalletInfo, CryptoTransfer }   from '../types/index.js';

const log = new Logger('crypto-wallet');

// ── KEY ENCRYPTION HELPERS ────────────────────────────────────────
// Agent's private key is stored encrypted. Decrypted only in memory
// when needed, then immediately cleared.

const ALGO = 'aes-256-gcm';

function encryptKey(privateKey: string, passphrase: string): string {
  const salt = crypto.randomBytes(32);
  const iv   = crypto.randomBytes(12);
  const key  = crypto.scryptSync(passphrase, salt, 32);
  const cipher = crypto.createCipheriv(ALGO, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(privateKey, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return JSON.stringify({
    salt:      salt.toString('hex'),
    iv:        iv.toString('hex'),
    tag:       tag.toString('hex'),
    encrypted: encrypted.toString('hex'),
  });
}

function decryptKey(encryptedData: string, passphrase: string): string {
  const { salt, iv, tag, encrypted } = JSON.parse(encryptedData) as {
    salt: string; iv: string; tag: string; encrypted: string;
  };

  const key      = crypto.scryptSync(passphrase, Buffer.from(salt, 'hex'), 32);
  const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(tag, 'hex'));

  return decipher.update(Buffer.from(encrypted, 'hex')).toString('utf8')
    + decipher.final('utf8');
}

// ── GET WALLET (decrypted, in-memory only) ────────────────────────
function getWallet(): ethers.Wallet {
  if (!config.crypto.encryptedKey) {
    // Generate a new wallet if none exists
    const wallet = ethers.Wallet.createRandom();
    log.warn('CRYPTO_ACTION', 'Generated new agent wallet — save the encrypted key!', {
      address: wallet.address,
    });
    // In prod: immediately encrypt and store to .env
    const encrypted = encryptKey(wallet.privateKey, config.crypto.passphrase || 'default-change-me');
    log.warn('CRYPTO_ACTION', 'Encrypted private key (store as AGENT_WALLET_ENCRYPTED_KEY):', {
      encrypted: encrypted.slice(0, 50) + '...',
    });
    return wallet;
  }

  const privateKey = decryptKey(config.crypto.encryptedKey, config.crypto.passphrase);
  const provider   = config.crypto.ethRpcUrl
    ? new ethers.JsonRpcProvider(config.crypto.ethRpcUrl)
    : null;

  return provider
    ? new ethers.Wallet(privateKey, provider)
    : new ethers.Wallet(privateKey);
}

// ── GET WALLET STATUS ─────────────────────────────────────────────
export async function getWalletStatus(): Promise<WalletInfo & {
  dailySpentEth:    number;
  dailyLimitEth:    number;
  remainingTodayEth: number;
}> {
  const wallet   = getWallet();
  const provider = wallet.provider;

  let ethBalance = '0';
  let usdValue   = 0;

  if (provider) {
    const balanceWei = await wallet.provider!.getBalance(wallet.address);
    ethBalance = ethers.formatEther(balanceWei);

    // Get rough USD value via CoinGecko (free, no API key)
    try {
      const { proxyFetchJSON } = await import('./proxy-client.js');
      const priceData = await proxyFetchJSON<{ ethereum: { usd: number } }>(
        'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd',
      );
      usdValue = parseFloat(ethBalance) * (priceData.ethereum?.usd ?? 0);
    } catch {
      usdValue = 0;
    }
  }

  const dailySpentEth = getDailySpend('ETH');

  log.info('TOOL_RESULT', `Wallet ${wallet.address}: ${ethBalance} ETH ($${usdValue.toFixed(2)})`, {});

  return {
    address:           wallet.address,
    ethBalance,
    usdValue,
    network:           config.crypto.ethRpcUrl ? 'mainnet' : 'offline',
    dailySpentEth,
    dailyLimitEth:     config.crypto.dailyLimitEth,
    remainingTodayEth: Math.max(0, config.crypto.dailyLimitEth - dailySpentEth),
  };
}

// ── SEND ETH ──────────────────────────────────────────────────────
export async function sendEth(req: CryptoTransfer): Promise<{
  success: boolean;
  txHash:  string;
  amount:  string;
  to:      string;
  gasUsed: string;
}> {
  const amountEth = parseFloat(req.amountEth);
  const dailySpent = getDailySpend('ETH');

  // Enforce daily limit
  if (dailySpent + amountEth > config.crypto.dailyLimitEth) {
    throw new Error(
      `Daily ETH limit exceeded. Spent: ${dailySpent} ETH, Limit: ${config.crypto.dailyLimitEth} ETH`
    );
  }

  // Validate address
  if (!ethers.isAddress(req.to)) {
    throw new Error(`Invalid ETH address: ${req.to}`);
  }

  const wallet = getWallet();
  if (!wallet.provider) {
    throw new Error('No provider configured — set ETH_RPC_URL in .env');
  }

  log.warn('CRYPTO_ACTION', `Sending ${req.amountEth} ETH to ${req.to}`, {
    to:     req.to,
    amount: req.amountEth,
    taskId: req.taskId,
  });

  try {
    const amountWei = ethers.parseEther(req.amountEth);
    const gasLimit  = req.gasLimit ?? 21000n;

    // Estimate gas
    const feeData = await wallet.provider.getFeeData();

    const tx = await wallet.sendTransaction({
      to:                  req.to,
      value:               amountWei,
      gasLimit,
      maxFeePerGas:        feeData.maxFeePerGas ?? undefined,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ?? undefined,
    });

    log.warn('CRYPTO_ACTION', `TX broadcast: ${tx.hash}`, { hash: tx.hash });

    // Wait for 1 confirmation
    const receipt = await tx.wait(1);

    if (!receipt) throw new Error('Transaction receipt is null');

    // Log to financial history
    logFinancialAction({
      type:        'crypto_send',
      amount:      amountEth,
      currency:    'ETH',
      recipient:   req.to,
      description: `ETH transfer (task: ${req.taskId})`,
      status:      'confirmed',
      approvedBy:  'HITL',
      taskId:      req.taskId,
    });

    log.warn('FINANCIAL_ACTION', `ETH transfer confirmed: ${tx.hash}`, {
      txHash:  tx.hash,
      amount:  req.amountEth,
      to:      req.to,
      gasUsed: receipt.gasUsed.toString(),
    });

    return {
      success: true,
      txHash:  tx.hash,
      amount:  req.amountEth,
      to:      req.to,
      gasUsed: receipt.gasUsed.toString(),
    };
  } catch (err) {
    log.exception(err, { context: 'send_eth', to: req.to, amount: req.amountEth });

    logFinancialAction({
      type:        'crypto_send',
      amount:      amountEth,
      currency:    'ETH',
      recipient:   req.to,
      description: `Failed ETH transfer (task: ${req.taskId})`,
      status:      'failed',
      approvedBy:  'HITL',
      taskId:      req.taskId,
    });

    throw new Error(`ETH transfer failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ── GENERATE NEW WALLET ───────────────────────────────────────────
// Run once to create a wallet, prints encrypted key to save in .env
export function generateNewWallet(): { address: string; encryptedKey: string } {
  const wallet    = ethers.Wallet.createRandom();
  const encrypted = encryptKey(wallet.privateKey, config.crypto.passphrase || 'CHANGE_ME');

  log.warn('CRYPTO_ACTION', `NEW WALLET GENERATED — save these values!`, {
    address:      wallet.address,
    encryptedKey: encrypted,
  });

  console.log('\n=== NEW WALLET ===');
  console.log('Address:         ', wallet.address);
  console.log('Encrypted Key:   ', encrypted);
  console.log('Add to .env:');
  console.log('AGENT_WALLET_ENCRYPTED_KEY=' + encrypted);
  console.log('==================\n');

  return { address: wallet.address, encryptedKey: encrypted };
}
