'use strict';

function notFound(req, res) {
  res.status(404).json({
    error: `Route not found: ${req.method} ${req.path}`,
    code: 'NOT_FOUND',
  });
}

module.exports = notFound;
