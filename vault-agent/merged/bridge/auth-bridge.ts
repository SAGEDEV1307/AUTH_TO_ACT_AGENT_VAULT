// bridge/auth-bridge.ts
// Typed wrapper over lib/auth.js + unified identity type
// This is the KEY bridge — converts Auth0 JWT identity into
// the unified AgentUser type used everywhere in TS code.

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const authLib = require('../lib/auth.js') as {
  verifyAuth0Token:   (token: string) => Promise<Record<string, unknown>>;
  extractBearerToken: (req: Record<string, unknown>) => string | null;
  getUserFromToken:   (token: string) => Promise<{
    id: string; email: string; name: string; picture?: string; scope: string;
  }>;
};

// Unified identity — used across all TS modules
export interface AgentUser {
  id:         string;   // Auth0 sub
  dbId:       string;   // PostgreSQL UUID
  email:      string;
  name:       string;
  picture?:   string;
  isActive:   boolean;
  role:       string;
  permissions: string[];
  // If authenticated via API key
  apiKeyId?:  string;
  apiKeyName?: string;
  // If authenticated as agent identity
  agentId?:   string;
}

export async function verifyAuth0Token(token: string): Promise<Record<string, unknown>> {
  return authLib.verifyAuth0Token(token);
}

export function extractBearerToken(req: Record<string, unknown>): string | null {
  return authLib.extractBearerToken(req);
}

export async function getUserFromToken(token: string): Promise<{
  id: string; email: string; name: string; picture?: string; scope: string;
}> {
  return authLib.getUserFromToken(token);
}

// Convert Express req.user (set by JS middleware) to typed AgentUser
export function toAgentUser(reqUser: Record<string, unknown>): AgentUser {
  return {
    id:          reqUser['id'] as string,
    dbId:        reqUser['dbId'] as string,
    email:       reqUser['email'] as string,
    name:        reqUser['name'] as string,
    picture:     reqUser['picture'] as string | undefined,
    isActive:    (reqUser['isActive'] as boolean) ?? true,
    role:        (reqUser['role'] as string) ?? 'user',
    permissions: (reqUser['permissions'] as string[]) ?? [],
    apiKeyId:    reqUser['apiKeyId'] as string | undefined,
    apiKeyName:  reqUser['apiKeyName'] as string | undefined,
    agentId:     reqUser['agentId'] as string | undefined,
  };
}
