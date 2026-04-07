# VaultAgent Architecture

## Overview: Two Projects, One System

VaultAgent merges two separate codebases via a TypeScript bridge pattern:

- **AgenticVault** (JS): Auth, RBAC, PostgreSQL, REST API, Blockchain, MCP SSE, HTML Dashboard
- **AutonomousAgent** (TS): HITL, Multi-LLM brain, SQLite memory, Banking, Telegram, Agent spawning

## Bridge Pattern

The bridge (`/bridge/*.ts`) solves the JS/TS language boundary:

```
TypeScript code (src/)
       │
       ▼
  bridge/*.ts          ← typed wrappers — this is the seam
       │
       ▼
  lib/*.js             ← original JS (unchanged)
       │
       ▼
  PostgreSQL / Redis
```

TS code **never** imports directly from `lib/*.js`. It always goes through the bridge.
JS code (`routes/`, `middleware/`) works exactly as before — no changes needed.

## Process Model: Two Servers, One Process

```
npm run dev
      │
      ├── Express  :3000  (HTTP)
      │     ├── Auth0 OAuth flow
      │     ├── HTML dashboard
      │     ├── REST API (RBAC-gated)
      │     └── MCP SSE endpoint
      │
      └── Fastify  :8443  (HTTPS/TLS)
            ├── JWT authentication
            ├── Autonomous agent API
            ├── HITL approve/deny
            ├── Agent spawning
            └── Scheduler management
```

Both servers share the same brain (`src/brain.ts`), memory (`src/memory.ts`), and databases.

## Database Model

| Database   | What lives there                          | Why |
|------------|-------------------------------------------|-----|
| PostgreSQL | Users, permissions, API keys, transactions | Relational, multi-user, ACID |
| SQLite     | Agent memory, conversations, audit log    | Fast local writes, autonomous state |
| Redis      | Cache, rate limits, session data          | Ephemeral, sub-millisecond |

## Auth Model

| Method | Used by | How |
|--------|---------|-----|
| Auth0 JWT | Humans via dashboard | RS256, JWKS |
| API Key | External systems | SHA-256 hash stored, `x-api-key` header |
| Agent Identity | Autonomous sub-agents | Token hash + agent ID headers |
| Master Key → JWT | Direct agent API | POST /auth/token |
