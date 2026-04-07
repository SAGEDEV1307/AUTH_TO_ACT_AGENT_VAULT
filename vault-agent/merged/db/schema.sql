-- Full schema for authorized-to-act

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users
CREATE TABLE IF NOT EXISTS users (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth0_id    TEXT UNIQUE NOT NULL,
  email       TEXT UNIQUE NOT NULL,
  name        TEXT,
  picture     TEXT,
  is_active   BOOLEAN DEFAULT TRUE NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  last_seen   TIMESTAMPTZ
);

-- Roles
CREATE TABLE IF NOT EXISTS roles (
  id    SERIAL PRIMARY KEY,
  name  TEXT UNIQUE NOT NULL,
  level INT DEFAULT 0
);
INSERT INTO roles (name, level) VALUES ('user', 0), ('agent', 1), ('admin', 100)
  ON CONFLICT DO NOTHING;

-- User roles
CREATE TABLE IF NOT EXISTS user_roles (
  user_id   UUID REFERENCES users(id) ON DELETE CASCADE,
  role_id   INT REFERENCES roles(id),
  set_by    UUID REFERENCES users(id),
  set_at    TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, role_id)
);

-- Permissions
CREATE TABLE IF NOT EXISTS permissions (
  id    SERIAL PRIMARY KEY,
  name  TEXT UNIQUE NOT NULL,
  description TEXT
);
INSERT INTO permissions (name, description) VALUES
  ('agent:run',         'Run AI agents'),
  ('agent:history',     'View agent run history'),
  ('agent:admin',       'Administer agent settings'),
  ('blockchain:read',   'Read blockchain data'),
  ('blockchain:send',   'Send blockchain transactions'),
  ('blockchain:admin',  'Administer blockchain settings'),
  ('keys:read',         'View API keys'),
  ('keys:write',        'Create API keys'),
  ('keys:admin',        'Administer API keys'),
  ('admin',             'Full admin access')
ON CONFLICT DO NOTHING;

-- User permissions (direct grants)
CREATE TABLE IF NOT EXISTS user_permissions (
  user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
  permission_id INT REFERENCES permissions(id),
  granted_by    UUID REFERENCES users(id),
  granted_at    TIMESTAMPTZ DEFAULT NOW(),
  revoked_at    TIMESTAMPTZ,
  revoked_by    UUID REFERENCES users(id),
  PRIMARY KEY (user_id, permission_id)
);

-- Role permissions
CREATE TABLE IF NOT EXISTS role_permissions (
  role_id       INT REFERENCES roles(id),
  permission_id INT REFERENCES permissions(id),
  PRIMARY KEY (role_id, permission_id)
);
-- Assign default permissions to roles
INSERT INTO role_permissions (role_id, permission_id)
  SELECT r.id, p.id FROM roles r, permissions p
  WHERE (r.name = 'user'  AND p.name IN ('agent:run','agent:history','blockchain:read','keys:read'))
     OR (r.name = 'agent' AND p.name IN ('agent:run','agent:history','blockchain:read','blockchain:send','keys:read'))
     OR (r.name = 'admin')
ON CONFLICT DO NOTHING;

-- API Keys
CREATE TABLE IF NOT EXISTS api_keys (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  key_hash    TEXT UNIQUE NOT NULL,
  permissions JSONB DEFAULT '[]',
  last_used   TIMESTAMPTZ,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- User wallets
CREATE TABLE IF NOT EXISTS user_wallets (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id               UUID REFERENCES users(id) ON DELETE CASCADE,
  address               TEXT NOT NULL,
  encrypted_private_key TEXT NOT NULL,
  chain_id              INT NOT NULL DEFAULT 1,
  imported              BOOLEAN DEFAULT FALSE,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, address)
);

-- Transactions
CREATE TABLE IF NOT EXISTS transactions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
  tx_hash       TEXT UNIQUE NOT NULL,
  from_address  TEXT NOT NULL,
  to_address    TEXT NOT NULL,
  value_ether   TEXT NOT NULL,
  chain_id      INT NOT NULL DEFAULT 1,
  status        TEXT NOT NULL DEFAULT 'pending',
  block_number  BIGINT,
  gas_used      TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  confirmed_at  TIMESTAMPTZ
);

-- Agent runs
CREATE TABLE IF NOT EXISTS agent_runs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
  model           TEXT NOT NULL,
  provider        TEXT NOT NULL DEFAULT 'anthropic',
  system_prompt   TEXT,
  user_message    TEXT NOT NULL,
  final_response  TEXT,
  tools           JSONB DEFAULT '[]',
  iterations      JSONB DEFAULT '[]',
  status          TEXT NOT NULL DEFAULT 'pending',
  error           TEXT,
  input_tokens    INT,
  output_tokens   INT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  completed_at    TIMESTAMPTZ
);

-- MCP sessions
CREATE TABLE IF NOT EXISTS mcp_sessions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  session_id  TEXT UNIQUE NOT NULL,
  client_info JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  last_active TIMESTAMPTZ DEFAULT NOW(),
  ended_at    TIMESTAMPTZ
);

-- Agent identities (for machine-to-machine)
CREATE TABLE IF NOT EXISTS agent_identities (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  token_hash  TEXT UNIQUE NOT NULL,
  permissions JSONB DEFAULT '[]',
  last_used   TIMESTAMPTZ,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- User secrets (KMS)
CREATE TABLE IF NOT EXISTS user_secrets (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID REFERENCES users(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  encrypted_value  TEXT NOT NULL,
  metadata         JSONB DEFAULT '{}',
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ,
  deleted_at       TIMESTAMPTZ,
  UNIQUE (user_id, name)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_auth0_id ON users(auth0_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_tx_hash ON transactions(tx_hash);
CREATE INDEX IF NOT EXISTS idx_agent_runs_user_id ON agent_runs(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_status ON agent_runs(status);
CREATE INDEX IF NOT EXISTS idx_user_secrets_user_id ON user_secrets(user_id);
