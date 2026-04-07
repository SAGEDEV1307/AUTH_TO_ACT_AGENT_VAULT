// src/types/index.ts
// ================================================================
// SHARED TYPES — Every module imports from here
// ================================================================

// ── AGENT TASK ──────────────────────────────────────────────────
export interface AgentTask {
  id:          string;
  type:        TaskType;
  instruction: string;
  context:     Record<string, unknown>;
  priority:    'low' | 'normal' | 'high' | 'critical';
  createdAt:   Date;
  requestedBy: string;   // 'telegram' | 'https' | 'sms' | 'email' | 'agent:<id>'
}

export type TaskType =
  | 'general'
  | 'watch_video'
  | 'bank_check'
  | 'bank_transfer'
  | 'crypto_send'
  | 'crypto_check'
  | 'web_research'
  | 'spawn_agent'
  | 'file_operation'
  | 'schedule';

// ── AGENT RESULT ────────────────────────────────────────────────
export interface AgentResult {
  taskId:    string;
  success:   boolean;
  output:    string;
  data?:     Record<string, unknown>;
  error?:    string;
  duration:  number;  // ms
  llmUsed:   LLMProvider;
  toolsUsed: string[];
}

// ── LLM PROVIDERS ───────────────────────────────────────────────
export type LLMProvider = 'claude' | 'deepseek' | 'ollama';

export interface LLMMessage {
  role:    'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  content:     string;
  toolCalls?:  ToolCall[];
  toolsUsed?:  string[];   // Names of tools actually called during this response
  thinking?:   string;     // DeepSeek R1 / Claude extended thinking block
  provider:    LLMProvider;
  model:       string;
  tokensUsed?: number;
}

// ── MCP TOOL CALLS ──────────────────────────────────────────────
export interface ToolCall {
  id:        string;
  name:      string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  name:       string;
  result:     unknown;
  error?:     string;
}

// ── HITL ────────────────────────────────────────────────────────
export interface HITLRequest {
  id:          string;
  taskId:      string;
  action:      string;
  description: string;
  data:        Record<string, unknown>;
  riskLevel:   'low' | 'medium' | 'high' | 'critical';
  createdAt:   Date;
  expiresAt:   Date;
  status:      'pending' | 'approved' | 'denied' | 'expired';
  decidedBy?:  string;
  decidedAt?:  Date;
  reason?:     string;
}

export type HITLDecision = 'approve' | 'deny';

// ── BANKING ─────────────────────────────────────────────────────
export interface BankAccount {
  id:           string;
  name:         string;
  type:         string;
  balance:      number;
  currency:     string;
  institutionId: string;
}

export interface Transaction {
  id:          string;
  amount:      number;
  currency:    string;
  merchant?:   string;
  category?:   string[];
  date:        string;
  pending:     boolean;
  accountId:   string;
}

export interface TransferRequest {
  amount:      number;
  currency:    string;
  recipient:   string;
  description: string;
  taskId:      string;
}

// ── CRYPTO ──────────────────────────────────────────────────────
export interface WalletInfo {
  address:    string;
  ethBalance: string;
  usdValue:   number;
  network:    string;
}

export interface CryptoTransfer {
  to:       string;
  amountEth: string;
  gasLimit?: bigint;
  taskId:   string;
}

// ── VIDEO ────────────────────────────────────────────────────────
export interface VideoAnalysis {
  url:        string;
  title?:     string;
  duration?:  number;
  transcript: string;
  summary:    string;
  keyPoints:  string[];
  sentiment?: string;
  extractedData?: Record<string, unknown>;
}

// ── AGENT SPAWNING ──────────────────────────────────────────────
export interface SubAgent {
  id:        string;
  role:      string;
  model:     LLMProvider;
  status:    'idle' | 'running' | 'done' | 'error';
  task?:     AgentTask;
  result?:   AgentResult;
  createdAt: Date;
}

export interface AgentTeam {
  id:        string;
  lead:      string;   // agent id
  members:   SubAgent[];
  goal:      string;
  status:    'forming' | 'working' | 'done';
  createdAt: Date;
}

// ── MEMORY ───────────────────────────────────────────────────────
export interface MemoryEntry {
  id:        string;
  type:      'task' | 'fact' | 'conversation' | 'financial' | 'video';
  content:   string;
  embedding?: number[];
  metadata:  Record<string, unknown>;
  createdAt: Date;
}

// ── AUDIT EVENT ──────────────────────────────────────────────────
export interface AuditEvent {
  id:         string;
  type:       AuditEventType;
  message:    string;
  metadata:   Record<string, unknown>;
  level:      'debug' | 'info' | 'warn' | 'error';
  timestamp:  Date;
  prevHash:   string;
  hash:       string;
}

export type AuditEventType =
  | 'SYSTEM_START'
  | 'SYSTEM_STOP'
  | 'TASK_RECEIVED'
  | 'TASK_COMPLETE'
  | 'TASK_FAILED'
  | 'BRAIN_DECISION'
  | 'TOOL_CALL'
  | 'TOOL_RESULT'
  | 'HITL_REQUESTED'
  | 'HITL_DECISION'
  | 'FINANCIAL_ACTION'
  | 'CRYPTO_ACTION'
  | 'AGENT_SPAWNED'
  | 'AGENT_MESSAGE'
  | 'HTTP_REQUEST'
  | 'HTTP_RESPONSE'
  | 'AUTH_SUCCESS'
  | 'AUTH_FAILURE'
  | 'SECURITY_EVENT'
  | 'ERROR';

// ── CONFIG ───────────────────────────────────────────────────────
export interface AgentConfig {
  agentName:         string;
  server: {
    port:            number;
    host:            string;
    jwtSecret:       string;
    apiMasterKey:    string;
    certPath:        string;
    keyPath:         string;
  };
  proxy: {
    enabled:         boolean;
    smartproxyUser:  string;
    smartproxyPass:  string;
    smartproxyHost:  string;
    proxyList:       string[];
  };
  llm: {
    defaultProvider: LLMProvider;
    anthropicKey:    string;
    claudeModel:     string;
    deepseekKey:     string;
    deepseekModel:   string;
    ollamaHost:      string;
    ollamaModel:     string;
  };
  banking: {
    plaidClientId:   string;
    plaidSecret:     string;
    plaidEnv:        string;
    plaidAccessToken: string;
    stripeKey:       string;
    maxDailySpend:   number;
    maxSingleTx:     number;
    hitlThreshold:   number;
    whitelistedPayees: string[];
  };
  crypto: {
    ethRpcUrl:       string;
    encryptedKey:    string;
    passphrase:      string;
    dailyLimitEth:   number;
    hitlThresholdEth: number;
  };
  hitl: {
    timeoutSeconds:  number;
    timeoutAction:   HITLDecision;
  };
  telegram: {
    botToken:        string;
    ownerChatId:     string;
  };
  twilio: {
    accountSid:      string;
    authToken:       string;
    fromNumber:      string;
    ownerPhone:      string;
  };
  email: {
    smtpHost:        string;
    smtpPort:        number;
    smtpUser:        string;
    smtpPass:        string;
    ownerEmail:      string;
  };
  db: {
    sqlitePath:      string;
  };
  logging: {
    level:           string;
    dir:             string;
  };
}
