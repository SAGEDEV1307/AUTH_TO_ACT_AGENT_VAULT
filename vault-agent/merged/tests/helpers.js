'use strict';
const { v4: uuidv4 } = require('uuid');

function makeUser(overrides = {}) {
  return {
    id: uuidv4(),
    auth0_id: `auth0|test-${uuidv4()}`,
    email: `test-${uuidv4()}@example.com`,
    name: 'Test User',
    is_active: true,
    ...overrides,
  };
}

function makeApiKey(userId, overrides = {}) {
  return {
    id: uuidv4(),
    user_id: userId,
    name: 'test-key',
    key_hash: 'a'.repeat(64),
    permissions: [],
    revoked_at: null,
    ...overrides,
  };
}

function makeAgentRun(userId, overrides = {}) {
  return {
    id: uuidv4(),
    user_id: userId,
    model: 'claude-opus-4-5',
    provider: 'anthropic',
    user_message: 'Hello, agent!',
    status: 'pending',
    ...overrides,
  };
}

module.exports = { makeUser, makeApiKey, makeAgentRun };
