-- Migration 002: MCP sessions table
CREATE TABLE IF NOT EXISTS mcp_sessions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  session_id  TEXT UNIQUE NOT NULL,
  client_info JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  last_active TIMESTAMPTZ DEFAULT NOW(),
  ended_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_mcp_sessions_user_id ON mcp_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_mcp_sessions_session_id ON mcp_sessions(session_id);
