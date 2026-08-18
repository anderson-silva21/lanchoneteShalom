const { db } = require('../db');
const { recordAudit } = require('./auditService');

const loginAttempts = new Map();

function positiveIntEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function getLoginSecurityConfig() {
  return {
    windowMs: positiveIntEnv('LOGIN_RATE_LIMIT_WINDOW_MINUTES', 15) * 60 * 1000,
    ipMaxAttempts: positiveIntEnv('LOGIN_RATE_LIMIT_MAX_PER_IP', 30),
    usernameMaxAttempts: positiveIntEnv('LOGIN_RATE_LIMIT_MAX_PER_USER', 10),
    lockFailedAttempts: positiveIntEnv('LOGIN_LOCK_FAILED_ATTEMPTS', 5),
    lockMinutes: positiveIntEnv('LOGIN_LOCK_MINUTES', 15)
  };
}

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

function compactKnownUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role
  };
}

function getClientIp(req) {
  return req?.ip || req?.socket?.remoteAddress || 'unknown';
}

function incrementAttempt(key, now, windowMs) {
  const current = loginAttempts.get(key);
  if (!current || current.expiresAt <= now) {
    const next = { count: 1, expiresAt: now + windowMs };
    loginAttempts.set(key, next);
    return next;
  }

  current.count += 1;
  return current;
}

function cleanupExpiredAttempts(now) {
  loginAttempts.forEach((value, key) => {
    if (value.expiresAt <= now) loginAttempts.delete(key);
  });
}

function consumeLoginRateLimit({ req, username }) {
  const config = getLoginSecurityConfig();
  const now = Date.now();
  cleanupExpiredAttempts(now);

  const normalizedUsername = normalizeUsername(username) || 'unknown';
  const ip = getClientIp(req);
  const ipCounter = incrementAttempt(`ip:${ip}`, now, config.windowMs);
  const userCounter = incrementAttempt(`user:${normalizedUsername}`, now, config.windowMs);
  const ipLimited = ipCounter.count > config.ipMaxAttempts;
  const userLimited = userCounter.count > config.usernameMaxAttempts;

  return {
    limited: ipLimited || userLimited,
    reason: ipLimited ? 'ip_rate_limit' : userLimited ? 'username_rate_limit' : null,
    retryAfterSeconds: Math.max(1, Math.ceil((Math.min(ipCounter.expiresAt, userCounter.expiresAt) - now) / 1000)),
    ip,
    username: normalizedUsername,
    ipAttempts: ipCounter.count,
    usernameAttempts: userCounter.count,
    windowMinutes: Math.ceil(config.windowMs / 60000)
  };
}

function clearUsernameRateLimit(username) {
  const normalizedUsername = normalizeUsername(username);
  if (normalizedUsername) loginAttempts.delete(`user:${normalizedUsername}`);
}

function getLockedUntilDate(user) {
  if (!user?.login_locked_until) return null;
  const lockedUntil = new Date(user.login_locked_until);
  if (Number.isNaN(lockedUntil.getTime())) return null;
  return lockedUntil;
}

function getLockStatus(user, now = new Date()) {
  const lockedUntil = getLockedUntilDate(user);
  if (!lockedUntil || lockedUntil <= now) return { locked: false, lockedUntil: null, retryAfterSeconds: 0 };
  return {
    locked: true,
    lockedUntil: lockedUntil.toISOString(),
    retryAfterSeconds: Math.max(1, Math.ceil((lockedUntil.getTime() - now.getTime()) / 1000))
  };
}

function clearLoginFailures(userId) {
  db.prepare(`
    UPDATE users
    SET login_failed_attempts = 0,
        login_locked_until = NULL
    WHERE id = ?
  `).run(userId);
}

function registerFailedLogin({ req, user = null, username, reason }) {
  const config = getLoginSecurityConfig();
  const normalizedUsername = normalizeUsername(username);
  let failedAttempts = 0;
  let lockedUntil = null;

  if (user?.id && Number(user.active) === 1) {
    failedAttempts = Number(user.login_failed_attempts || 0) + 1;
    if (failedAttempts >= config.lockFailedAttempts) {
      lockedUntil = new Date(Date.now() + config.lockMinutes * 60 * 1000).toISOString();
    }

    db.prepare(`
      UPDATE users
      SET login_failed_attempts = ?,
          login_locked_until = ?
      WHERE id = ?
    `).run(failedAttempts, lockedUntil, user.id);
  }

  recordAudit({
    req,
    user: compactKnownUser(user),
    action: 'auth.login.failed',
    entityType: user?.id ? 'user' : 'auth',
    entityId: user?.id || normalizedUsername || null,
    summary: user?.id
      ? `Falha de login para usuario ${user.username}`
      : `Falha de login para usuario inexistente: ${normalizedUsername || '-'}`,
    metadata: {
      username: normalizedUsername,
      reason,
      failed_attempts: failedAttempts,
      locked_until: lockedUntil,
      lock_failed_attempts: config.lockFailedAttempts,
      lock_minutes: config.lockMinutes,
      ip: getClientIp(req)
    }
  });

  return {
    locked: Boolean(lockedUntil),
    lockedUntil,
    failedAttempts,
    remainingAttempts: user?.id ? Math.max(config.lockFailedAttempts - failedAttempts, 0) : null
  };
}

function registerBlockedLogin({ req, user = null, username, reason, retryAfterSeconds, extra = {} }) {
  const normalizedUsername = normalizeUsername(username);
  recordAudit({
    req,
    user: compactKnownUser(user),
    action: reason === 'temporary_lock' ? 'auth.login.locked' : 'auth.login.rate_limited',
    entityType: user?.id ? 'user' : 'auth',
    entityId: user?.id || normalizedUsername || null,
    summary: reason === 'temporary_lock'
      ? `Login bloqueado temporariamente para ${user?.username || normalizedUsername || '-'}`
      : `Rate limit de login acionado para ${normalizedUsername || '-'}`,
    metadata: {
      username: normalizedUsername,
      reason,
      retry_after_seconds: retryAfterSeconds,
      ip: getClientIp(req),
      ...extra
    }
  });
}

function buildRetryMessage(prefix, seconds) {
  const minutes = Math.max(1, Math.ceil(Number(seconds || 0) / 60));
  return `${prefix} Tente novamente em aproximadamente ${minutes} minuto${minutes === 1 ? '' : 's'}.`;
}

function resetLoginSecurityMemory() {
  loginAttempts.clear();
}

module.exports = {
  buildRetryMessage,
  clearLoginFailures,
  clearUsernameRateLimit,
  consumeLoginRateLimit,
  getLockStatus,
  normalizeUsername,
  registerBlockedLogin,
  registerFailedLogin,
  resetLoginSecurityMemory
};
