# VaultAgent

**One system. Two projects merged.**

Combines [AgenticVault](https://github.com) (Auth, RBAC, Blockchain, MCP, Dashboard) with [AutonomousAgent](https://github.com) (HITL, Multi-LLM, Banking, Telegram, Memory, Agent Spawning).

## What It Does

- **Multi-user auth** — Auth0 JWT for humans, API keys for machines, agent identities for bots
- **Fine-grained RBAC** — permissions per user, per agent, per API key
- **Multi-LLM brain** — Claude (primary) + DeepSeek API + Ollama local, with automatic fallback
- **HITL approval** — all financial actions require human approval via Telegram inline buttons
- **Banking** — read Plaid balance/transactions, send payments via Stripe
- **Crypto** — ETH wallet management, send/receive, NFT, DeFi tokens
- **Agent spawning** — spawn sub-agents, A2A message bus, team coordination
- **MCP protocol** — DeepSeek MCP, Ollama MCP, filesystem MCP, memory MCP
- **Communications** — Telegram bot, Twilio SMS, email notifications
- **Video watching** — yt-dlp + Whisper + Claude vision
- **Task scheduling** — cron + one-time tasks
- **Tamper-evident audit logs** — chained SHA-256 log entries
- **Persistent memory** — SQLite for agent state, PostgreSQL for user data

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    ONE PROCESS                           │
│                                                         │
│  Express HTTP :3000          Fastify HTTPS :8443        │
│  ─────────────────           ─────────────────────      │
│  Auth0 OAuth login           JWT + API key auth         │
│  HTML Dashboard              Autonomous agent API        │
│  REST API (RBAC)             HITL endpoints             │
│  MCP SSE endpoint            Agent spawning             │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │              BRIDGE LAYER                        │   │
│  │  TS → JS: db, redis, permissions, security, kms │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  PostgreSQL (users/perms)  SQLite (memory/audit)        │
│  Redis (cache/rate-limit)  Logs (chained JSON)          │
└─────────────────────────────────────────────────────────┘
```

## Quick Start

```bash
npm install

# Generate secrets
npm run gen-key          # ENCRYPTION_KEY
npm run gen-wallet       # AGENT_WALLET_ENCRYPTED_KEY
npm run gen-certs        # TLS certs for HTTPS

cp .env.example .env
# Fill in .env

# Run DB migrations
npm run migrate

# Start everything
npm run dev
```

- Dashboard: http://localhost:3000
- Agent API: https://localhost:8443
- Telegram: send your bot a message

## API

### Express HTTP (Auth0 users)
- `GET  /api/auth/me` — current user
- `POST /api/agent/run` — run agent
- `GET  /api/blockchain/balance` — ETH balance
- `POST /api/blockchain/send` — send ETH
- `GET  /api/keys` — list API keys
- `POST /api/keys` — create API key
- `GET  /api/admin/users` — list users (admin)

### Fastify HTTPS (JWT / autonomous)
- `POST /auth/token` — get JWT from master key
- `POST /task` — send task to brain
- `GET  /status` — bank + wallet + agent status
- `POST /hitl/:id` — approve/deny HITL request
- `GET  /hitl/pending` — pending approvals
- `POST /agents/team` — spawn agent team
- `GET  /scheduler/jobs` — list scheduled jobs
- `GET  /mcp/status` — MCP server status

## Stack
- **Language**: TypeScript + JavaScript (bridge pattern)
- **HTTP**: Express (dashboard) + Fastify (agent API)
- **Auth**: Auth0 JWT + API keys + agent identities
- **DB**: PostgreSQL + SQLite + Redis
- **LLM**: Claude + DeepSeek + Ollama
- **Blockchain**: ethers.js v6
- **Banking**: Plaid + Stripe
- **Comms**: Telegram + Twilio + Nodemailer

## No React. No Next.js.
Frontend is plain HTML/CSS/JS. CVE-2025-55182 (CVSS 10.0) is a remote code execution
vulnerability in React Server Components. This project avoids that attack surface entirely.
