const { db } = require('../db');
const { USER_ROLES } = require('../utils/roles');

function getUserRoles(userId) {
  const assigned = db.prepare('SELECT role FROM user_roles WHERE user_id = ?').all(userId);
  return USER_ROLES.filter((role) => assigned.some((entry) => entry.role === role));
}

// Call inside the transaction that changes the user and records its audit event.
function replaceUserRoles(userId, roles) {
  db.prepare('DELETE FROM user_roles WHERE user_id = ?').run(userId);
  const insert = db.prepare('INSERT INTO user_roles (user_id, role) VALUES (?, ?)');
  for (const role of roles) insert.run(userId, role);
}

function hasOtherActiveAdmin(userId) {
  return Boolean(db.prepare(`
    SELECT 1 FROM users u JOIN user_roles r ON r.user_id = u.id
    WHERE u.active = 1 AND r.role = 'admin' AND u.id != ? LIMIT 1
  `).get(userId));
}

module.exports = { getUserRoles, replaceUserRoles, hasOtherActiveAdmin };
