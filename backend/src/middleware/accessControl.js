const { requireRole } = require('./auth');

const screenRoles = {
  dashboard: ['admin'],
  sales: ['admin', 'manager', 'cashier'],
  products: ['admin', 'manager'],
  inventory: ['admin', 'manager'],
  sheet: ['admin', 'manager', 'cashier'],
  reports: ['admin'],
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
