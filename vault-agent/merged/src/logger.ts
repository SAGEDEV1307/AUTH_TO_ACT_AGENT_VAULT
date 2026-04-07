// src/logger.ts
// OWASP-hardened logger from modular-bot — secret scrubbing + security audit trail.
// Replaces the original logger.ts.

import winston from 'winston';
import { mkdirSync } from 'fs';
import { join } from 'path';
import 'dotenv/config';

const LOG_DIR  = process.env['LOG_DIR']  ?? 'logs';
const LOG_LEVEL = process.env['LOG_LEVEL'] ?? 'info';

mkdirSync(LOG_DIR, { recursive: true });

// A04: Scrub API keys and secrets from all log output
const SECRET_PATTERNS: RegExp[] = [
  /sk-ant-[a-zA-Z0-9\-_]{20,}/g,
  /sk-[a-zA-Z0-9]{20,}/g,
  /AIza[a-zA-Z0-9\-_]{30,}/g,
  /"[a-zA-Z0-9\-_]{40,}"/g,
  /Bearer\s+[a-zA-Z0-9\-_.]{20,}/g,
  /ata_[a-zA-Z0-9\-_]{20,}/g,       // VaultAgent API keys
  /0x[a-fA-F0-9]{64}/g,              // Private keys
];

function scrubSecrets(message: string): string {
  let s = message;
  for (const p of SECRET_PATTERNS) s = s.replace(p, '[REDACTED]');
  return s;
}

const scrubFormat = winston.format((info) => {
  if (typeof info.message === 'string') info.message = scrubSecrets(info.message);
  return info;
});

const consoleFormat = winston.format.combine(
  scrubFormat(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message }) =>
    `${timestamp as string} [${level}] ${message as string}`
  )
);

const fileFormat = winston.format.combine(
  scrubFormat(),
  winston.format.timestamp(),
  winston.format.json()
);

// Main logger
export const log = winston.createLogger({
  level: LOG_LEVEL,
  exitOnError: false,
  transports: [
    new winston.transports.Console({ format: consoleFormat }),
    new winston.transports.File({
      filename: join(LOG_DIR, 'error.log'),
      level: 'error',
      format: fileFormat,
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: join(LOG_DIR, 'combined.log'),
      format: fileFormat,
      maxsize: 50 * 1024 * 1024,
      maxFiles: 10,
    }),
  ],
});

// Dedicated security event logger — separate audit trail
export const securityLogger = winston.createLogger({
  level: 'warn',
  exitOnError: false,
  transports: [
    new winston.transports.File({
      filename: join(LOG_DIR, 'security.log'),
      format: fileFormat,
      maxsize: 10 * 1024 * 1024,
      maxFiles: 10,
    }),
    new winston.transports.Console({ format: consoleFormat }),
  ],
});

export function logSecurityEvent(event: string, context: Record<string, unknown>): void {
  securityLogger.warn(event, {
    securityEvent: true,
    timestamp: new Date().toISOString(),
    ...context,
  });
}

// Named method aliases matching both VaultAgent and modular-bot patterns
export const logger = {
  info:  (msg: string, meta?: Record<string, unknown>) => log.info(msg, meta),
  warn:  (msg: string, meta?: Record<string, unknown>) => log.warn(msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => log.error(msg, meta),
  debug: (msg: string, meta?: Record<string, unknown>) => log.debug(msg, meta),
  exception: (err: Error, context?: Record<string, unknown>) =>
    log.error(err.message, { stack: err.stack, name: err.name, ...context }),
  financial: (action: string, amountUSD: number, recipient: string, approvedBy: string) =>
    log.warn(`FINANCIAL: ${action} $${amountUSD} → ${recipient}`, { action, amountUSD, recipient, approvedBy }),
  security: (event: string, details: Record<string, unknown>) =>
    logSecurityEvent(event, details),
};
