const { randomUUID } = require('crypto');
const morgan = require('morgan');
const { brazilTimestamp } = require('../utils/time');

const SENSITIVE_KEY_PATTERN = /(password|senha|token|authorization|secret)/i;
const MAX_STRING_LENGTH = 500;
const MAX_DEPTH = 5;

function sanitizeString(value) {
  if (value.length <= MAX_STRING_LENGTH) return value;
  return `${value.slice(0, MAX_STRING_LENGTH)}...`;
}

function redactSensitiveData(value, depth = 0) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return sanitizeString(value);
  if (typeof value !== 'object') return value;
  if (depth >= MAX_DEPTH) return '[MaxDepth]';
  if (Array.isArray(value)) return value.map((item) => redactSensitiveData(item, depth + 1));

  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    SENSITIVE_KEY_PATTERN.test(key) ? '[REDACTED]' : redactSensitiveData(item, depth + 1)
  ]));
}

function assignRequestId(req, res, next) {
  const incomingId = req.get('x-request-id');
  req.id = incomingId && incomingId.trim() ? incomingId.trim().slice(0, 100) : randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
}

function compactUser(user) {
  if (!user) return undefined;
  return {
    id: user.id,
    email: user.email,
    role: user.role
  };
}

function getRequestContext(req) {
  const context = {
    id: req.id,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    user: compactUser(req.user)
  };

  if (req.params && Object.keys(req.params).length > 0) context.params = redactSensitiveData(req.params);
  if (req.query && Object.keys(req.query).length > 0) context.query = redactSensitiveData(req.query);
  if (req.body && Object.keys(req.body).length > 0) context.body = redactSensitiveData(req.body);

  return context;
}

function logRequestError(error, req, status, extra = {}) {
  const logEntry = {
    timestamp: brazilTimestamp(),
    level: status >= 500 ? 'error' : 'warn',
    status,
    request: getRequestContext(req),
    error: {
      name: error.name,
      message: error.message,
      code: error.code
    },
    ...extra
  };

  if (process.env.NODE_ENV !== 'production') {
    logEntry.error.stack = error.stack;
  }

  const line = JSON.stringify(logEntry, null, process.env.NODE_ENV === 'production' ? 0 : 2);
  if (status >= 500) console.error(line);
  else console.warn(line);
}

morgan.token('id', (req) => req.id || '-');
morgan.token('user', (req) => {
  if (!req.user) return '-';
  return `${req.user.id}:${req.user.role}`;
});

const httpLogger = morgan(':id :remote-addr :method :url :status :response-time ms - :res[content-length] user=:user');

module.exports = {
  assignRequestId,
  httpLogger,
  logRequestError,
  redactSensitiveData
};
