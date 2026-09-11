const { requireRole } = require('./auth');

const screenRoles = {
  dashboard: ['admin', 'finance'],
  setup: ['admin', 'manager', 'finance'],
  sales: ['admin', 'manager', 'cashier', 'finance'],
  payments: ['admin', 'manager', 'cashier', 'finance'],
  products: ['admin', 'manager', 'finance'],
  inventory: ['admin', 'manager', 'finance'],
  sheet: ['admin', 'manager', 'cashier', 'finance'],
  reports: ['admin', 'finance'],
  library: ['admin', 'finance', 'library'],
  settings: ['admin']
};

const permissions = {
  'library:read': ['admin', 'finance', 'library'],
  'library:write': ['admin', 'library'],
  'library:finance': ['admin', 'finance'],
  'users:manage': ['admin']
};

function requireScreen(screen) {
  const roles = screenRoles[screen];
  if (!roles) throw new Error(`Tela sem regra de acesso: ${screen}`);
  return requireRole(...roles);
}

function can(role, permission) {
  return Boolean(permissions[permission]?.includes(role));
}

function requirePermission(permission) {
  const roles = permissions[permission];
  if (!roles) throw new Error(`Permissao sem regra de acesso: ${permission}`);
  return requireRole(...roles);
}

module.exports = {
  can,
  permissions,
  requirePermission,
  requireScreen,
  screenRoles
};
