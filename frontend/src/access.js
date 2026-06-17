export const viewAccess = {
  cashier: ['sales', 'sheet'],
  manager: ['sales', 'setup', 'products', 'inventory', 'sheet'],
  admin: ['dashboard', 'setup', 'sales', 'products', 'inventory', 'sheet', 'reports', 'settings']
}

export function allowedViewsForRole(role) {
  return viewAccess[role] || []
}

export function canAccessView(role, view) {
  return allowedViewsForRole(role).includes(view)
}

export function defaultViewForRole(role) {
  return allowedViewsForRole(role)[0] || 'sales'
}
