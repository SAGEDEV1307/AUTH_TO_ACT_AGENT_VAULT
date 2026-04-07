-- Migration 003: API keys enhancements
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_api_keys_expires_at ON api_keys(expires_at) WHERE expires_at IS NOT NULL;
