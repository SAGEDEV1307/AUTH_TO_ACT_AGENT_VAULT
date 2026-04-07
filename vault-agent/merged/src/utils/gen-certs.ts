// src/utils/gen-certs.ts — run: npx tsx src/utils/gen-certs.ts
import { execSync } from 'child_process';
import fs           from 'fs';
import path         from 'path';

const CERT_DIR  = path.resolve('./certs');
const CERT_PATH = path.join(CERT_DIR, 'server.crt');
const KEY_PATH  = path.join(CERT_DIR, 'server.key');

function main(): void {
  console.log('\n╔══════════════════════════════════╗');
  console.log('║   TLS CERTIFICATE GENERATOR      ║');
  console.log('╚══════════════════════════════════╝\n');

  try { execSync('openssl version', { stdio: 'pipe' }); }
  catch { console.error('❌ openssl not found'); process.exit(1); }

  fs.mkdirSync(CERT_DIR, { recursive: true });

  if (fs.existsSync(CERT_PATH) && fs.existsSync(KEY_PATH)) {
    console.log('ℹ️  Certs already exist at:');
    console.log(`   ${CERT_PATH}`);
    console.log(`   ${KEY_PATH}`);
    console.log('\nDelete them and re-run to regenerate.\n');
    return;
  }

  execSync(
    `openssl req -x509 -newkey rsa:4096 -keyout "${KEY_PATH}" -out "${CERT_PATH}" ` +
    `-days 365 -nodes -subj "/CN=vault-agent/O=VaultAgent/C=US" ` +
    `-addext "subjectAltName=IP:127.0.0.1,DNS:localhost"`,
    { stdio: 'inherit' },
  );

  fs.chmodSync(KEY_PATH, 0o600);
  console.log(`\n✅ Certs generated:\n   ${CERT_PATH}\n   ${KEY_PATH}\n`);
  console.log('For production use Let\'s Encrypt instead.\n');
}
main();
