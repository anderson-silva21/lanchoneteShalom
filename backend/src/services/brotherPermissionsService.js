const { db } = require('../db');

const BROTHER_PERMISSIONS = [
  'brothers:read', 'brothers:create', 'brothers:update',
  'brothers:groups:manage', 'brothers:ministries:manage',
  'brothers:followups:read', 'brothers:followups:create', 'brothers:followups:update'
];

function getBrotherPermissions(userId) {
  return db.prepare('SELECT permission FROM brother_permissions WHERE user_id = ? ORDER BY permission').all(userId)
    .map((row) => row.permission);
}

function hasBrotherPermission(subject, permission) {
  const permissions = subject?.brother_permissions || (subject?.id ? getBrotherPermissions(subject.id) : []);
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
