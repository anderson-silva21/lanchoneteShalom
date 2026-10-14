const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { db } = require('../db');
const { authenticate } = require('../middleware/auth');
const { requireScreen } = require('../middleware/accessControl');
const { recordAudit } = require('../services/auditService');
const { generateTemporaryPassword } = require('../utils/passwords');
const { USER_ROLES } = require('../utils/roles');
const { getUserRoles, replaceUserRoles, hasOtherActiveAdmin } = require('../services/userRolesService');

const router = express.Router();
const rolesSchema = z.array(z.enum(USER_ROLES)).min(1, 'Selecione pelo menos um perfil.')
  .refine((roles) => new Set(roles).size === roles.length, 'Perfis duplicados.');

const userSchema = z.object({
  name: z.string().trim().min(2),
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,40}$/),
  role: z.enum(USER_ROLES).optional(),
  roles: rolesSchema.optional()
}).refine((payload) => payload.roles !== undefined || payload.role !== undefined, {
  path: ['roles'], message: 'Selecione pelo menos um perfil.'
}).refine((payload) => payload.roles === undefined || payload.role === undefined, {
  path: ['roles'], message: 'Informe roles ou role, nunca ambos.'
});

function publicUser(row) {
  return {
    id: row.id,
    name: row.name,
    username: row.username,
    email: row.email,
    role: row.role,
    roles: getUserRoles(row.id),
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
    ORDER BY EXISTS (SELECT 1 FROM user_roles WHERE user_id = users.id AND role = 'admin') DESC, name COLLATE NOCASE ASC
  `).all().map(publicUser);

  return res.json(users);
});

router.post('/', (req, res) => {
  const payload = userSchema.parse(req.body);
  const assignedRoles = payload.roles ?? [payload.role];

  const email = emailForUsername(payload.username);
  const existing = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(payload.username, email);
  if (existing) return res.status(409).json({ message: 'Ja existe um usuario com esse username.', fieldErrors: { username: 'Este usuario ja existe. Escolha outro nome de usuario.' } });

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = bcrypt.hashSync(temporaryPassword, 10);
  const user = db.transaction(() => {
    const inserted = db.prepare(`
      INSERT INTO users (name, username, email, password_hash, role, active, password_must_change)
      VALUES (?, ?, ?, ?, ?, 1, 1)
    `).run(payload.name, payload.username, email, passwordHash, assignedRoles[0]);
    replaceUserRoles(inserted.lastInsertRowid, assignedRoles);
    const created = publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(inserted.lastInsertRowid));
    recordAudit({
      req, strict: true, action: 'user.create', entityType: 'user', entityId: created.id,
      summary: `Usuario criado: ${created.username}`,
      metadata: { roles: created.roles, name: created.name }
    });
    return created;
  })();

  return res.status(201).json({
    user,
    temporary_password: temporaryPassword
  });
});

router.patch('/:id/roles', (req, res) => {
  const { roles } = z.object({ roles: rolesSchema }).strict().parse(req.body);
  const updated = db.transaction(() => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user || Number(user.active) !== 1) {
      throw Object.assign(new Error('Usuario ativo nao encontrado.'), { status: 404 });
    }
    const previousRoles = getUserRoles(user.id);
    if (previousRoles.includes('admin') && !roles.includes('admin') && !hasOtherActiveAdmin(user.id)) {
      throw Object.assign(new Error('Mantenha pelo menos um admin ativo.'), { status: 400 });
    }
    replaceUserRoles(user.id, roles);
    recordAudit({
      req, strict: true, action: 'user.roles.update', entityType: 'user', entityId: user.id,
      summary: `Perfis atualizados: ${user.username}`,
      metadata: { username: user.username, previous_roles: previousRoles, new_roles: getUserRoles(user.id) }
    });
    return publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(user.id));
  })();
  return res.json({ user: updated });
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

  recordAudit({
    req,
    action: 'user.reset_password',
    entityType: 'user',
    entityId: updated.id,
    summary: `Senha temporaria resetada: ${updated.username}`,
    metadata: { username: updated.username, roles: getUserRoles(updated.id) }
  });

  return res.json({
    user: publicUser(updated),
    temporary_password: temporaryPassword
  });
});

router.delete('/:id', (req, res) => {
  db.transaction(() => {
    const user = db.prepare('SELECT id, username, active FROM users WHERE id = ?').get(req.params.id);
    if (!user || Number(user.active) !== 1) {
      throw Object.assign(new Error('Usuario ativo nao encontrado.'), { status: 404 });
    }
    if (Number(user.id) === Number(req.user.id)) {
      throw Object.assign(new Error('Voce nao pode excluir seu proprio usuario.'), { status: 400 });
    }
    const roles = getUserRoles(user.id);
    if (roles.includes('admin') && !hasOtherActiveAdmin(user.id)) {
      throw Object.assign(new Error('Mantenha pelo menos um admin ativo.'), { status: 400 });
    }
    db.prepare('UPDATE users SET active = 0, password_must_change = 0 WHERE id = ?').run(user.id);
    recordAudit({
      req, strict: true, action: 'user.delete', entityType: 'user', entityId: user.id,
      summary: `Usuario excluido: ${user.username}`,
      metadata: { username: user.username, roles }
    });
  })();
  return res.status(204).send();
});

module.exports = router;
