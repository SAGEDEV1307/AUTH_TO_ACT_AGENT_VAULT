'use strict';

const logger = require('../lib/logger');
const { AppError } = require('../lib/errors');

function errorHandler(err, req, res, next) {
  if (err instanceof AppError && err.isOperational) {
    logger.warn('Operational error', {
      code: err.code,
      message: err.message,
      path: req.path,
      method: req.method,
    });
    return res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
      ...(err.details && { details: err.details }),
    });
  }

  // Unexpected errors
  logger.error('Unexpected error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  const isDev = process.env.NODE_ENV !== 'production';
  res.status(500).json({
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
    ...(isDev && { details: err.message, stack: err.stack }),
  });
}

module.exports = errorHandler;
