const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const { authenticate, signUser } = require('../middleware/auth');

const router = express.Router();

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const normalizedUsername = String(username || '').trim().toLowerCase();
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(normalizedUsername);

  if (!user || !bcrypt.compareSync(password || '', user.password_hash)) {
    return res.status(401).json({ message: 'Usuario ou senha invalidos.' });
  }

  const publicUser = {
    id: user.id,
    name: user.name,
    username: user.username,
    email: user.email,
    role: user.role
  };

  return res.json({
    token: signUser(publicUser),
    user: publicUser
  });
});

router.get('/me', authenticate, (req, res) => {
  return res.json({ user: req.user });
});

module.exports = router;
