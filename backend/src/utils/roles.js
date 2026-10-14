const USER_ROLES = ['admin', 'manager', 'cashier', 'finance', 'library'];

function rolesFor(subject) {
  if (Array.isArray(subject)) return subject;
  if (typeof subject === 'string') return [subject];
  return subject?.roles ?? (subject?.role ? [subject.role] : []);
}

function hasRole(subject, ...allowed) {
  return rolesFor(subject).some((role) => allowed.includes(role));
}

module.exports = { USER_ROLES, rolesFor, hasRole };
