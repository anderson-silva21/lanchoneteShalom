const jwt = require('jsonwebtoken');
const { db } = require('../db');
const { getJwtSecret } = require('../config/security');
const { getUserRoles } = require('../services/userRolesService');
const { hasRole } = require('../utils/roles');

const jwtSecret = getJwtSecret();

function isPasswordChangeAllowed(req) {
  return req.method === 'GET' && req.originalUrl === '/api/auth/me'
    || req.method === 'POST' && req.originalUrl === '/api/auth/change-password';
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    email: user.email,
    role: user.role,
    roles: getUserRoles(user.id),
    password_must_change: Boolean(user.password_must_change)
  };
}

function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: 'Sessao expirada ou login necessario.' });
  }

  try {
    const payload = jwt.verify(token, jwtSecret);
    const user = db.prepare(`
      SELECT id, name, username, email, role, active, password_must_change
      FROM users
      WHERE id = ?
    `).get(payload.id);

    if (!user || Number(user.active) !== 1) {
      return res.status(401).json({ message: 'Usuario inativo ou sessao invalida.' });
    }

    req.user = publicUser(user);
    if (req.user.password_must_change && !isPasswordChangeAllowed(req)) {
      return res.status(403).json({
        code: 'PASSWORD_CHANGE_REQUIRED',
        message: 'Troque sua senha antes de acessar o sistema.'
      });
    }

    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Token invalido.' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!hasRole(req.user, ...roles)) {
      return res.status(403).json({ message: 'Acesso restrito para este perfil.' });
    }
    return next();
  };
}

function signUser(user) {
  return jwt.sign(
    {
      id: user.id,
    },
    jwtSecret,
    { expiresIn: '12h' }
  );
}

module.exports = {
  authenticate,
  publicUser,
  requireRole,
  signUser
};
