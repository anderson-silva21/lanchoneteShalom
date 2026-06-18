export const viewAccess = {
  cashier: ['sales', 'payments', 'sheet'],
  manager: ['sales', 'payments', 'setup', 'products', 'inventory', 'sheet'],
  admin: ['dashboard', 'setup', 'sales', 'payments', 'products', 'inventory', 'sheet', 'reports', 'settings']
}

export function allowedViewsForRole(role, options = {}) {
  return (viewAccess[role] || []).filter((view) => view !== 'setup' || options.setupEnabled)
}

export function canAccessView(role, view, options = {}) {
  return allowedViewsForRole(role, options).includes(view)
}

export function defaultViewForRole(role, options = {}) {
  return allowedViewsForRole(role, options)[0] || 'sales'
}
