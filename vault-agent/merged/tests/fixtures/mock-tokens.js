'use strict';
const jwt = require('jsonwebtoken');

function makeMockJwt(payload = {}) {
  // For tests only — signs with a test secret
  return jwt.sign(
    { sub: 'auth0|test-user', email: 'test@test.com', name: 'Test User', ...payload },
    'test-secret',
    { expiresIn: '1h', issuer: 'https://test.auth0.com/', audience: 'https://test.local' }
  );
}

module.exports = { makeMockJwt };
