const { db } = require('../db');

const BROTHER_PERMISSIONS = [
  'brothers:read', 'brothers:create', 'brothers:update',
  'brothers:groups:manage', 'brothers:ministries:manage',
  'brothers:followups:read', 'brothers:followups:create', 'brothers:followups:update',
  'brothers:users:manage', 'brothers:pastoral:coordinate', 'brothers:pastoral:manage',
  'brothers:calendar:read', 'brothers:calendar:manage', 'brothers:self:access'
];

function getBrotherPermissions(userId) {
  const isAdmin = db.prepare(`
    SELECT 1 AS is_admin FROM user_roles WHERE user_id = ? AND role = 'admin'
    UNION ALL
    SELECT 1 AS is_admin FROM users WHERE id = ? AND role = 'admin'
    LIMIT 1
  `).get(userId, userId);
  if (isAdmin) return [...BROTHER_PERMISSIONS];
  return db.prepare('SELECT permission FROM brother_permissions WHERE user_id = ? ORDER BY permission').all(userId)
    .map((row) => row.permission);
}

function hasBrotherPermission(subject, permission) {
  if (subject?.role === 'admin' || subject?.roles?.includes('admin')) return BROTHER_PERMISSIONS.includes(permission);
  const permissions = subject?.brother_permissions || (subject?.id ? getBrotherPermissions(subject.id) : []);
  if (permissions.includes('brothers:pastoral:coordinate') && [
    'brothers:read','brothers:create','brothers:update','brothers:groups:manage','brothers:ministries:manage',
    'brothers:pastoral:manage','brothers:calendar:read','brothers:calendar:manage',
    'brothers:followups:read','brothers:followups:create','brothers:followups:update'
  ].includes(permission)) return true;
  if (permissions.includes('brothers:calendar:manage') && permission === 'brothers:calendar:read') return true;
  return permissions.includes(permission);
}

function replaceBrotherPermissions(userId, permissions, grantedBy) {
  const replace = db.transaction(() => {
    db.prepare('DELETE FROM brother_permissions WHERE user_id = ?').run(userId);
    const insert = db.prepare('INSERT INTO brother_permissions (user_id, permission, granted_by) VALUES (?, ?, ?)');
    permissions.forEach((permission) => insert.run(userId, permission, grantedBy));
  });
  replace();
}

module.exports = { BROTHER_PERMISSIONS, getBrotherPermissions, hasBrotherPermission, replaceBrotherPermissions };
