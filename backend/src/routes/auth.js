const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { db } = require('../db');
const { authenticate, publicUser, signUser } = require('../middleware/auth');

const router = express.Router();

const changePasswordSchema = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(6)
});

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const normalizedUsername = String(username || '').trim().toLowerCase();
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(normalizedUsername);

  if (!user || !bcrypt.compareSync(password || '', user.password_hash)) {
    return res.status(401).json({ message: 'Usuario ou senha invalidos.' });
  }

  if (Number(user.active) !== 1) {
    return res.status(403).json({ message: 'Usuario inativo.' });
  }

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
