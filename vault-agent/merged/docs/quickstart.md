# Quick Start

## Prerequisites

- Node.js 22+
- PostgreSQL 15+
- Redis 7+
- openssl (for TLS certs)
- Ollama (optional — for local LLM)

## 1. Install

```bash
git clone <repo> vault-agent
cd vault-agent
npm install
```

## 2. Generate secrets

```bash
npm run gen-key      # → ENCRYPTION_KEY
npm run gen-wallet   # → AGENT_WALLET_ENCRYPTED_KEY + WALLET_ENCRYPTION_PASSPHRASE
npm run gen-certs    # → ./certs/server.crt + server.key
```

## 3. Configure

```bash
cp .env.example .env
# Fill in .env — at minimum:
#   AUTH0_DOMAIN, AUTH0_CLIENT_ID, AUTH0_CLIENT_SECRET, AUTH0_AUDIENCE
#   DATABASE_URL, REDIS_URL
#   ENCRYPTION_KEY (from gen-key)
#   ANTHROPIC_API_KEY
#   JWT_SECRET (openssl rand -hex 64)
#   API_MASTER_KEY (openssl rand -hex 64)
```

## 4. Database

```bash
npm run migrate   # creates all PostgreSQL tables
npm run seed      # optional dev data
```

## 5. Start

```bash
npm run dev       # TypeScript hot-reload
# or
npm run build && npm start  # compiled
```

- Dashboard:  http://localhost:3000
- Agent API:  https://localhost:8443

## 6. Get an agent token

```bash
curl -k -X POST https://localhost:8443/auth/token \
  -H "Content-Type: application/json" \
  -d '{"api_key": "YOUR_API_MASTER_KEY"}'
# → { "token": "eyJ..." }
```

## 7. Run your first task

```bash
curl -k -X POST https://localhost:8443/task \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"task": "What is the current ETH gas price?"}'
```
