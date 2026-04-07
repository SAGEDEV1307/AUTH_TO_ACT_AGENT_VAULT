// src/utils/gen-wallet.ts — run once: npx tsx src/utils/gen-wallet.ts
import 'dotenv/config';
import { ethers }  from 'ethers';
import crypto      from 'crypto';
import readline    from 'readline';

const ALGO = 'aes-256-gcm';

function encryptKey(privateKey: string, passphrase: string): string {
  const salt   = crypto.randomBytes(32);
  const iv     = crypto.randomBytes(12);
  const key    = crypto.scryptSync(passphrase, salt, 32);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc    = Buffer.concat([cipher.update(privateKey, 'utf8'), cipher.final()]);
  const tag    = cipher.getAuthTag();
  return JSON.stringify({
    salt: salt.toString('hex'), iv: iv.toString('hex'),
    tag: tag.toString('hex'),  encrypted: enc.toString('hex'),
  });
}

async function prompt(q: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(q, a => { rl.close(); resolve(a); }));
}

async function main(): Promise<void> {
  console.log('\n╔══════════════════════════════════╗');
  console.log('║   VAULT-AGENT WALLET GENERATOR   ║');
  console.log('╚══════════════════════════════════╝\n');
  const pass    = await prompt('Passphrase (match WALLET_ENCRYPTION_PASSPHRASE in .env): ');
  const confirm = await prompt('Confirm: ');
  if (pass !== confirm) { console.error('\n❌ Mismatch'); process.exit(1); }
  if (pass.length < 12)  { console.error('\n❌ Too short — 12+ chars'); process.exit(1); }

  const wallet     = ethers.Wallet.createRandom();
  const encrypted  = encryptKey(wallet.privateKey, pass);

  console.log('\n✅ WALLET GENERATED — save these:\n');
  console.log(`Address:   ${wallet.address}`);
  console.log(`Mnemonic:  ${wallet.mnemonic?.phrase ?? 'N/A'}\n`);
  console.log('Add to .env:');
  console.log(`AGENT_WALLET_ENCRYPTED_KEY='${encrypted}'`);
  console.log(`WALLET_ENCRYPTION_PASSPHRASE='${pass}'`);
  console.log(`\nEtherscan: https://etherscan.io/address/${wallet.address}\n`);
}
void main();
