export const viewAccess = {
  cashier: ['sales', 'sheet'],
  manager: ['sales', 'payments', 'setup', 'products', 'sheet'],
  finance: ['dashboard', 'setup', 'sales', 'payments', 'products', 'sheet', 'library'],
  admin: ['dashboard', 'setup', 'sales', 'payments', 'products', 'sheet', 'library', 'settings'],
  library: ['library']
}

export const roleOptions = [
  { value: 'cashier', label: 'Caixa' },
  { value: 'manager', label: 'Gerente' },
  { value: 'finance', label: 'Financeiro' },
  { value: 'library', label: 'Livraria' },
  { value: 'admin', label: 'Admin' }
]

export function rolesFor(subject) {
  if (Array.isArray(subject)) return subject
  if (typeof subject === 'string') return [subject]
  return subject?.roles ?? (subject?.role ? [subject.role] : [])
}

export function hasRole(subject, ...allowed) {
  return rolesFor(subject).some((role) => allowed.includes(role))
}

export function allowedViewsForRole(subject, options = {}) {
  return [...new Set(rolesFor(subject).flatMap((role) => viewAccess[role] || []))]
    .filter((view) => view !== 'setup' || options.setupEnabled)
}

export function canAccessView(role, view, options = {}) {
  return allowedViewsForRole(role, options).includes(view)
}

export function defaultViewForRole(role, options = {}) {
  return allowedViewsForRole(role, options)[0] || 'sales'
}
