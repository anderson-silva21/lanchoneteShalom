const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { db } = require('../db');
const { authenticate } = require('../middleware/auth');
const { requireScreen } = require('../middleware/accessControl');
const { generateTemporaryPassword } = require('../utils/passwords');

const router = express.Router();
const roles = new Set(['admin', 'manager', 'cashier', 'finance']);

const userSchema = z.object({
  name: z.string().trim().min(2),
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,40}$/),
  role: z.enum(['admin', 'manager', 'cashier', 'finance'])
});

function publicUser(row) {
  return {
    id: row.id,
    name: row.name,
    username: row.username,
    email: row.email,
    role: row.role,
    active: Boolean(row.active),
    password_must_change: Boolean(row.password_must_change),
    created_at: row.created_at
  };
}

function emailForUsername(username) {
  return `${username}@lanchonete.local`;
}

router.use(authenticate, requireScreen('settings'));

router.get('/', (req, res) => {
  const users = db.prepare(`
    SELECT id, name, username, email, role, active, password_must_change, created_at
    FROM users
    WHERE active = 1
    ORDER BY role = 'admin' DESC, name COLLATE NOCASE ASC
  `).all().map(publicUser);

  return res.json(users);
});

router.post('/', (req, res) => {
  const payload = userSchema.parse(req.body);
  if (!roles.has(payload.role)) return res.status(400).json({ message: 'Perfil invalido.' });

  const email = emailForUsername(payload.username);
  const existing = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(payload.username, email);
  if (existing) return res.status(409).json({ message: 'Ja existe um usuario com esse username.' });

  const temporaryPassword = generateTemporaryPassword();
  const result = db.prepare(`
    INSERT INTO users (name, username, email, password_hash, role, active, password_must_change)
    VALUES (?, ?, ?, ?, ?, 1, 1)
  `).run(
    payload.name,
    payload.username,
    email,
    bcrypt.hashSync(temporaryPassword, 10),
    payload.role
  );

  const user = db.prepare(`
    SELECT id, name, username, email, role, active, password_must_change, created_at
    FROM users
    WHERE id = ?
  `).get(result.lastInsertRowid);

  return res.status(201).json({
    user: publicUser(user),
    temporary_password: temporaryPassword
  });
});

router.post('/:id/reset-password', (req, res) => {
  const user = db.prepare('SELECT id, active FROM users WHERE id = ?').get(req.params.id);
  if (!user || Number(user.active) !== 1) return res.status(404).json({ message: 'Usuario ativo nao encontrado.' });

  const temporaryPassword = generateTemporaryPassword();
  db.prepare(`
    UPDATE users
    SET password_hash = ?, password_must_change = 1
    WHERE id = ?
  `).run(bcrypt.hashSync(temporaryPassword, 10), user.id);

  const updated = db.prepare(`
    SELECT id, name, username, email, role, active, password_must_change, created_at
    FROM users
    WHERE id = ?
  `).get(user.id);

  return res.json({
    user: publicUser(updated),
    temporary_password: temporaryPassword
  });
});

router.delete('/:id', (req, res) => {
  const user = db.prepare('SELECT id, username, role, active FROM users WHERE id = ?').get(req.params.id);
  if (!user || Number(user.active) !== 1) return res.status(404).json({ message: 'Usuario ativo nao encontrado.' });

  if (Number(user.id) === Number(req.user.id)) {
    return res.status(400).json({ message: 'Voce nao pode excluir seu proprio usuario.' });
  }

  if (user.role === 'admin') {
    const activeAdmins = db.prepare(`
      SELECT COUNT(*) AS total
      FROM users
      WHERE active = 1 AND role = 'admin' AND id != ?
    `).get(user.id).total;

    if (activeAdmins < 1) {
      return res.status(400).json({ message: 'Mantenha pelo menos um admin ativo.' });
    }
  }

  db.prepare(`
    UPDATE users
    SET active = 0, password_must_change = 0
    WHERE id = ?
  `).run(user.id);

  return res.status(204).send();
});

module.exports = router;
