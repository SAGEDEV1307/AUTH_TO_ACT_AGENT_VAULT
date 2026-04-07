# Bridge Layer

The bridge is what makes JS and TypeScript work together without rewriting anything.

## What it solves

TypeScript needs types. The JS `lib/` files don't have them. Rather than:
- Rewriting lib/ in TypeScript (breaks existing JS routes/middleware)
- Using `// @ts-ignore` everywhere (defeats the purpose)
- Writing `.d.ts` declaration files (gets out of sync)

We write **thin typed wrappers** in `bridge/` that import the JS modules via `createRequire`
and re-export everything with proper TypeScript types.

## Files

| Bridge file | Wraps | Provides |
|-------------|-------|---------|
| `db-bridge.ts` | `lib/database.js` | `pgQuery<T>`, `pgTransaction<T>` |
| `redis-bridge.ts` | `lib/redis.js` | `cacheGet<T>`, `cacheSet`, `cacheIncr` |
| `security-bridge.ts` | `lib/security.js` | `encrypt`, `decrypt`, `generateApiKey` |
| `permissions-bridge.ts` | `lib/permissions.js` | `hasPermission`, `requirePermission` |
| `auth-bridge.ts` | `lib/auth.js` | `AgentUser` type, `toAgentUser()` |
| `blockchain-bridge.ts` | `lib/web3.js` | `getOnchainBalance`, `getGasPrice` |
| `kms-bridge.ts` | `lib/kms.js` | `storeSecret`, `retrieveSecret` |

## The AgentUser type

`auth-bridge.ts` exports the `AgentUser` interface — the unified identity type used everywhere
in TS code regardless of how the user authenticated (Auth0, API key, or agent token):

```typescript
interface AgentUser {
  id:          string;   // Auth0 sub
  dbId:        string;   // PostgreSQL UUID
  email:       string;
  name:        string;
  isActive:    boolean;
  role:        string;
  permissions: string[];
  apiKeyId?:   string;   // set if API key auth
  agentId?:    string;   // set if agent identity auth
}
```

## Rule

> All TypeScript files import from `bridge/` or `src/`.
> All JavaScript files import from `lib/` directly.
> Never cross the boundary the other way.
