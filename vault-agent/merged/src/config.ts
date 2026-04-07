// src/config.ts
// Unified config — AgenticVault + AutonomousAgent env vars merged

import 'dotenv/config';
import type { AgentConfig } from './types.js';

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}
function optional(key: string, fallback: string): string { return process.env[key] ?? fallback; }
function optionalNum(key: string, fallback: number): number { const v = process.env[key]; return v ? parseFloat(v) : fallback; }
function optionalBool(key: string, fallback: boolean): boolean { const v = process.env[key]; return v ? v.toLowerCase() === 'true' : fallback; }
function optionalList(key: string): string[] { const v = process.env[key]; return v ? v.split(',').map(s => s.trim()).filter(Boolean) : []; }

export const config: AgentConfig & {
  // AgenticVault additions
  auth0: { domain: string; clientId: string; clientSecret: string; audience: string };
  postgres: { url: string };
  redis: { url: string };
  encryptionKey: string;
  http: { port: number; appUrl: string };
} = {
  agentName: optional('AGENT_NAME', 'VaultAgent'),

  // ── AGENTICVAULT ADDITIONS ──────────────────────────────────────
  auth0: {
    domain:       optional('AUTH0_DOMAIN', ''),
    clientId:     optional('AUTH0_CLIENT_ID', ''),
    clientSecret: optional('AUTH0_CLIENT_SECRET', ''),
    audience:     optional('AUTH0_AUDIENCE', ''),
  },
  postgres: {
    url: optional('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/vault_agent'),
  },
  redis: {
    url: optional('REDIS_URL', 'redis://localhost:6379'),
  },
  encryptionKey: optional('ENCRYPTION_KEY', '0'.repeat(64)),
  http: {
    port:   parseInt(optional('PORT', '3000')),
    appUrl: optional('APP_URL', 'http://localhost:3000'),
  },

  // ── AUTONOMOUS AGENT (HTTPS/FASTIFY) ───────────────────────────
  server: {
    port:         parseInt(optional('HTTPS_PORT', '8443')),
    host:         optional('SERVER_HOST', '0.0.0.0'),
    jwtSecret:    optional('JWT_SECRET', 'dev-jwt-secret-change-in-prod'),
    apiMasterKey: optional('API_MASTER_KEY', 'dev-master-key-change-in-prod'),
    certPath:     optional('CERT_PATH', './certs/server.crt'),
    keyPath:      optional('KEY_PATH', './certs/server.key'),
  },

  proxy: {
    enabled:        optionalBool('PROXY_ENABLED', false),
    smartproxyUser: optional('SMARTPROXY_USER', ''),
    smartproxyPass: optional('SMARTPROXY_PASS', ''),
    smartproxyHost: optional('SMARTPROXY_HOST', 'gate.smartproxy.com:7000'),
    proxyList:      optionalList('PROXY_LIST'),
  },

  llm: {
    defaultProvider: (optional('DEFAULT_LLM', 'claude')) as 'claude' | 'deepseek' | 'ollama',
    anthropicKey:   optional('ANTHROPIC_API_KEY', ''),
    claudeModel:    optional('CLAUDE_MODEL', 'claude-opus-4-6'),
    deepseekKey:    optional('DEEPSEEK_API_KEY', ''),
    deepseekModel:  optional('DEEPSEEK_DEFAULT_MODEL', 'deepseek-chat'),
    geminiApiKey:   optional('GEMINI_API_KEY', ''),
    ollamaHost:     optional('OLLAMA_HOST', 'http://localhost:11434'),
    ollamaModel:    optional('OLLAMA_MODEL', 'deepseek-r1:8b'),
  },

  banking: {
    plaidClientId:     optional('PLAID_CLIENT_ID', ''),
    plaidSecret:       optional('PLAID_SECRET', ''),
    plaidEnv:          optional('PLAID_ENV', 'sandbox'),
    plaidAccessToken:  optional('PLAID_ACCESS_TOKEN', ''),
    stripeKey:         optional('STRIPE_SECRET_KEY', ''),
    maxDailySpend:     optionalNum('MAX_DAILY_SPEND_USD', 50.00),
    maxSingleTx:       optionalNum('MAX_SINGLE_TX_USD', 20.00),
    hitlThreshold:     optionalNum('HITL_THRESHOLD_USD', 10.00),
    whitelistedPayees: optionalList('WHITELISTED_PAYEES'),
  },

  crypto: {
    ethRpcUrl:          optional('ETH_RPC_URL', ''),
    encryptedKey:       optional('AGENT_WALLET_ENCRYPTED_KEY', ''),
    passphrase:         optional('WALLET_ENCRYPTION_PASSPHRASE', ''),
    dailyLimitEth:      optionalNum('WALLET_DAILY_LIMIT_ETH', 0.01),
    hitlThresholdEth:   optionalNum('WALLET_HITL_THRESHOLD_ETH', 0.001),
  },

  hitl: {
    timeoutSeconds: optionalNum('HITL_TIMEOUT_SECONDS', 300),
    timeoutAction:  (optional('HITL_TIMEOUT_ACTION', 'deny')) as 'approve' | 'deny',
  },

  telegram: {
    botToken:    optional('TELEGRAM_BOT_TOKEN', ''),
    ownerChatId: optional('TELEGRAM_OWNER_CHAT_ID', ''),
  },

  twilio: {
    accountSid: optional('TWILIO_ACCOUNT_SID', ''),
    authToken:  optional('TWILIO_AUTH_TOKEN', ''),
    fromNumber: optional('TWILIO_FROM_NUMBER', ''),
    ownerPhone: optional('OWNER_PHONE_NUMBER', ''),
  },

  email: {
    smtpHost:   optional('SMTP_HOST', 'smtp.gmail.com'),
    smtpPort:   parseInt(optional('SMTP_PORT', '587')),
    smtpUser:   optional('SMTP_USER', ''),
    smtpPass:   optional('SMTP_PASS', ''),
    ownerEmail: optional('OWNER_EMAIL', ''),
  },

  db: {
    sqlitePath: optional('SQLITE_PATH', './data/agent.db'),
  },

  logging: {
    level: optional('LOG_LEVEL', 'info'),
    dir:   optional('LOG_DIR', './logs'),
  },
};
