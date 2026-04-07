'use strict';

require('dotenv').config();
const express = require('express');
const path    = require('path');
const morgan  = require('morgan');
const helmet  = require('helmet');
const cors    = require('cors');

const routes       = require('./routes/index');
const errorHandler = require('./middleware/errorHandler');
const notFound     = require('./middleware/notFound');
const requestId    = require('./middleware/requestId');
const { attachUser } = require('./middleware/auth');
const { apiKeyAuth } = require('./middleware/apiKey');
const { apiLimiter } = require('./middleware/rateLimit');
const logger       = require('./lib/logger');
const db           = require('./lib/database');
const redis        = require('./lib/redis');

const app  = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'", "'unsafe-inline'"],
      styleSrc:   ["'self'", "'unsafe-inline'"],
      imgSrc:     ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", `https://${process.env.AUTH0_DOMAIN}`],
    },
  },
}));

// CORS
app.use(cors({
  origin: process.env.APP_URL || 'http://localhost:3000',
  credentials: true,
}));

// Body parsing
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

// Request ID + logging
app.use(requestId);
app.use(morgan('[:date[iso]] :method :url :status :response-time ms', {
  stream: { write: (msg) => logger.info(msg.trim()) },
}));

// Auth (attaches user to req if token present — does not block)
app.use(attachUser);
app.use(apiKeyAuth);

// Rate limiting on all API routes
app.use('/api/', apiLimiter);

// Static files — serve dashboard HTML, CSS, JS
app.use('/styles', express.static(path.join(__dirname, 'styles')));
app.use('/js',     express.static(path.join(__dirname, 'public/js')));
app.use(express.static(path.join(__dirname, 'public')));

// Auth0 callback page — serve a simple redirect handler
app.get('/auth/callback', (req, res) => {
  res.send(`<!DOCTYPE html><html><head>
    <title>Signing in...</title>
    <script src="/js/auth.js"></script>
  </head><body><p>Signing in...</p></body></html>`);
});

// Inject Auth0 config into index.html on the fly
app.get('/', (req, res) => {
  const fs = require('fs');
  let html = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8');
  html = html
    .replace('{{AUTH0_DOMAIN}}',   process.env.AUTH0_DOMAIN   || '')
    .replace('{{AUTH0_CLIENT_ID}}', process.env.AUTH0_CLIENT_ID || '')
    .replace('{{AUTH0_AUDIENCE}}',  process.env.AUTH0_AUDIENCE  || '');
  res.type('html').send(html);
});

// Auth0 token exchange — receives code, returns access token
app.post('/api/auth/token', async (req, res) => {
  const { code, redirect_uri } = req.body;
  if (!code) return res.status(400).json({ error: 'code required' });
  try {
    const fetch = (...args) => import('node-fetch').then(m => m.default(...args));
    const tokenRes = await fetch(`https://${process.env.AUTH0_DOMAIN}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type:    'authorization_code',
        client_id:     process.env.AUTH0_CLIENT_ID,
        client_secret: process.env.AUTH0_CLIENT_SECRET,
        code,
        redirect_uri,
      }),
    });
    const data = await tokenRes.json();
    res.json(data);
  } catch (err) {
    logger.error('Token exchange failed', { error: err.message });
    res.status(500).json({ error: 'Token exchange failed' });
  }
});

// All routes
app.use(routes);

// 404 + error handlers (must be last)
app.use(notFound);
app.use(errorHandler);

// Graceful shutdown
async function shutdown(signal) {
  logger.info(`Received ${signal}, shutting down gracefully`);
  await Promise.allSettled([db.close(), redis.close()]);
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

// Start
app.listen(PORT, () => {
  logger.info(`Server running on http://localhost:${PORT}`, { env: process.env.NODE_ENV });
});

module.exports = app;
