const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { db } = require('../db');
const { authenticate, publicUser, signUser } = require('../middleware/auth');
const {
  buildRetryMessage,
  clearLoginFailures,
  clearUsernameRateLimit,
  consumeLoginRateLimit,
  getLockStatus,
  normalizeUsername,
  registerBlockedLogin,
  registerFailedLogin
} = require('../services/loginSecurityService');

const router = express.Router();

const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1)
});

const changePasswordSchema = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(6)
});

router.post('/login', (req, res) => {
  const { username, password } = loginSchema.parse(req.body);
  const normalizedUsername = normalizeUsername(username);
  let user = db.prepare('SELECT * FROM users WHERE username = ?').get(normalizedUsername);
  const rateLimit = consumeLoginRateLimit({ req, username: normalizedUsername });

  if (rateLimit.limited) {
    registerBlockedLogin({
      req,
      user,
      username: normalizedUsername,
      reason: rateLimit.reason,
      retryAfterSeconds: rateLimit.retryAfterSeconds,
      extra: {
        ip_attempts: rateLimit.ipAttempts,
        username_attempts: rateLimit.usernameAttempts,
        window_minutes: rateLimit.windowMinutes
      }
    });
    res.set('Retry-After', String(rateLimit.retryAfterSeconds));
    return res.status(429).json({
      message: buildRetryMessage('Muitas tentativas de login.', rateLimit.retryAfterSeconds),
      retry_after_seconds: rateLimit.retryAfterSeconds
    });
  }

  const lockStatus = getLockStatus(user);
  if (lockStatus.locked) {
    registerBlockedLogin({
      req,
      user,
      username: normalizedUsername,
      reason: 'temporary_lock',
      retryAfterSeconds: lockStatus.retryAfterSeconds,
      extra: { locked_until: lockStatus.lockedUntil }
    });
    res.set('Retry-After', String(lockStatus.retryAfterSeconds));
    return res.status(423).json({
      message: buildRetryMessage('Usuario bloqueado temporariamente por tentativas de login invalidas.', lockStatus.retryAfterSeconds),
      locked_until: lockStatus.lockedUntil,
      retry_after_seconds: lockStatus.retryAfterSeconds
    });
  }
  if (user?.login_locked_until) {
    clearLoginFailures(user.id);
    user = { ...user, login_failed_attempts: 0, login_locked_until: null };
  }

  if (!user || !bcrypt.compareSync(password || '', user.password_hash)) {
    const failure = registerFailedLogin({
      req,
      user,
      username: normalizedUsername,
      reason: user ? 'invalid_password' : 'unknown_user'
    });

    if (failure.locked) {
      const retryAfterSeconds = failure.lockedUntil
        ? Math.max(1, Math.ceil((new Date(failure.lockedUntil).getTime() - Date.now()) / 1000))
        : 60;
      res.set('Retry-After', String(retryAfterSeconds));
      return res.status(423).json({
        message: buildRetryMessage('Usuario bloqueado temporariamente por tentativas de login invalidas.', retryAfterSeconds),
        locked_until: failure.lockedUntil
      });
    }

    return res.status(401).json({ message: 'Usuario ou senha invalidos.' });
  }

  if (Number(user.active) !== 1) {
    registerFailedLogin({
      req,
      user,
      username: normalizedUsername,
      reason: 'inactive_user'
    });
    return res.status(403).json({ message: 'Usuario inativo.' });
  }

  clearLoginFailures(user.id);
  clearUsernameRateLimit(user.username);
  const safeUser = publicUser(user);

  return res.json({
    token: signUser(safeUser),
    user: safeUser
  });
});

router.get('/me', authenticate, (req, res) => {
  return res.json({ user: req.user });
});

router.post('/change-password', authenticate, (req, res) => {
  const payload = changePasswordSchema.parse(req.body);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user || Number(user.active) !== 1) return res.status(401).json({ message: 'Usuario inativo ou sessao invalida.' });

  if (!bcrypt.compareSync(payload.current_password, user.password_hash)) {
    return res.status(400).json({ message: 'Senha atual invalida.' });
  }

  if (bcrypt.compareSync(payload.new_password, user.password_hash)) {
    return res.status(400).json({ message: 'A nova senha deve ser diferente da senha temporaria.' });
  }

  db.prepare(`
    UPDATE users
    SET password_hash = ?, password_must_change = 0
    WHERE id = ?
  `).run(bcrypt.hashSync(payload.new_password, 10), user.id);

  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  const safeUser = publicUser(updated);
  return res.json({
    token: signUser(safeUser),
    user: safeUser
  });
});

module.exports = router;
