export const viewAccess = {
  cashier: ['sales', 'sheet'],
  manager: ['sales', 'payments', 'setup', 'products', 'sheet'],
  finance: ['dashboard', 'setup', 'sales', 'payments', 'products', 'sheet', 'library'],
  admin: ['dashboard', 'setup', 'sales', 'payments', 'products', 'sheet', 'library', 'settings'],
  library: ['library']
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
