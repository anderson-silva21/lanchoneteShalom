export const viewAccess = {
  cashier: ['sales', 'sheet'],
  manager: ['sales', 'payments', 'setup', 'products', 'sheet'],
  finance: ['dashboard', 'setup', 'sales', 'payments', 'products', 'sheet', 'library'],
  admin: ['dashboard', 'setup', 'sales', 'payments', 'products', 'sheet', 'library', 'settings'],
  library: ['library'],
  library_cashier: ['library']
}

export const roleOptions = [
  { value: 'cashier', label: 'Caixa' },
  { value: 'manager', label: 'Gerente' },
  { value: 'finance', label: 'Financeiro' },
  { value: 'library', label: 'Livraria' },
  { value: 'library_cashier', label: 'Caixa da Livraria' },
  { value: 'admin', label: 'Admin' }
]

export const brotherPermissionOptions = [
  { value: 'brothers:read', label: 'Consultar cadastros' },
  { value: 'brothers:create', label: 'Cadastrar irmãos' },
  { value: 'brothers:update', label: 'Editar cadastros e vínculos' },
  { value: 'brothers:groups:manage', label: 'Administrar grupos de oração' },
  { value: 'brothers:ministries:manage', label: 'Administrar serviços e ministérios' },
  { value: 'brothers:followups:read', label: 'Consultar acompanhamentos' },
  { value: 'brothers:followups:create', label: 'Registrar acompanhamentos' },
  { value: 'brothers:followups:update', label: 'Editar acompanhamentos' }
]

export function rolesFor(subject) {
  if (Array.isArray(subject)) return subject
  if (typeof subject === 'string') return [subject]
  return subject?.roles ?? (subject?.role ? [subject.role] : [])
}

export function hasRole(subject, ...allowed) {
  return rolesFor(subject).some((role) => allowed.includes(role))
}

export function profileLabels(subject) {
  return rolesFor(subject).map((role) => roleOptions.find((option) => option.value === role)?.label || role).join(', ')
}

export function allowedViewsForRole(subject, options = {}) {
  const views = rolesFor(subject).flatMap((role) => viewAccess[role] || [])
  const brotherPermissions = subject?.brother_permissions || []
  if (brotherPermissions.some((permission) => [
    'brothers:read', 'brothers:create', 'brothers:groups:manage', 'brothers:ministries:manage'
  ].includes(permission))) views.push('brothers')
  return [...new Set(views)]
    .filter((view) => view !== 'setup' || options.setupEnabled)
}

export function canAccessView(role, view, options = {}) {
  return allowedViewsForRole(role, options).includes(view)
}

export function defaultViewForRole(role, options = {}) {
  return allowedViewsForRole(role, options)[0] || 'sales'
}
