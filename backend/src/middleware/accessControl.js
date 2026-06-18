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
  settings: ['admin']
};

function requireScreen(screen) {
  const roles = screenRoles[screen];
  if (!roles) throw new Error(`Tela sem regra de acesso: ${screen}`);
  return requireRole(...roles);
}

module.exports = {
  requireScreen,
  screenRoles
};
