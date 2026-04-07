'use strict';

const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');
const { AuthenticationError } = require('./errors');
const logger = require('./logger');

const jwks = jwksClient({
  jwksUri: `https://${process.env.AUTH0_DOMAIN}/.well-known/jwks.json`,
  cache: true,
  cacheMaxEntries: 5,
  cacheMaxAge: 600000, // 10 minutes
});

function getSigningKey(header, callback) {
  jwks.getSigningKey(header.kid, (err, key) => {
    if (err) return callback(err);
    callback(null, key.getPublicKey());
  });
}

async function verifyAuth0Token(token) {
  return new Promise((resolve, reject) => {
    jwt.verify(
      token,
      getSigningKey,
      {
        audience: process.env.AUTH0_AUDIENCE,
        issuer: `https://${process.env.AUTH0_DOMAIN}/`,
        algorithms: ['RS256'],
      },
      (err, decoded) => {
        if (err) {
          logger.warn('Token verification failed', { error: err.message });
          reject(new AuthenticationError('Invalid or expired token'));
        } else {
          resolve(decoded);
        }
      }
    );
  });
}

function extractBearerToken(req) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  return authHeader.slice(7);
}

async function getUserFromToken(token) {
  const decoded = await verifyAuth0Token(token);
  return {
    id: decoded.sub,
    email: decoded.email,
    name: decoded.name,
    picture: decoded.picture,
    scope: decoded.scope || '',
  };
}

module.exports = { verifyAuth0Token, extractBearerToken, getUserFromToken };
