export const viewAccess = {
  cashier: ['sales', 'sheet'],
  manager: ['sales', 'payments', 'setup', 'products', 'sheet'],
  finance: ['dashboard', 'setup', 'sales', 'payments', 'products', 'sheet', 'library'],
  admin: ['dashboard', 'setup', 'sales', 'payments', 'products', 'sheet', 'library', 'settings'],
  library: ['library'],
  library_cashier: ['library'],
  brothers: ['brothers']
}

export const roleOptions = [
  { value: 'cashier', label: 'Caixa' },
  { value: 'manager', label: 'Gerente' },
  { value: 'finance', label: 'Financeiro' },
  { value: 'library', label: 'Livraria' },
  { value: 'library_cashier', label: 'Caixa da Livraria' },
  { value: 'brothers', label: 'Gestao de Irmaos' },
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
  { value: 'brothers:followups:update', label: 'Editar acompanhamentos' },
  { value: 'brothers:users:manage', label: 'Administrar usuarios do modulo' },
  { value: 'brothers:pastoral:coordinate', label: 'Coordenar estrutura pastoral' },
  { value: 'brothers:pastoral:manage', label: 'Administrar vinculos pastorais' },
  { value: 'brothers:calendar:read', label: 'Consultar calendario comunitario' },
  { value: 'brothers:calendar:manage', label: 'Administrar calendario e eventos' },
  { value: 'brothers:self:access', label: 'Acesso de ovelha ao modulo' }
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
  if (rolesFor(subject).includes('admin') || brotherPermissions.some((permission) => [
    'brothers:read', 'brothers:create', 'brothers:groups:manage', 'brothers:ministries:manage',
    'brothers:users:manage', 'brothers:pastoral:coordinate', 'brothers:pastoral:manage', 'brothers:calendar:read', 'brothers:calendar:manage', 'brothers:self:access',
    'brothers:followups:read', 'brothers:followups:create'
  ].includes(permission))) views.push('brothers')
  return [...new Set(views)]
    .filter((view) => view !== 'setup' || options.setupEnabled)
}

export function canAccessView(role, view, options = {}) {
  return allowedViewsForRole(role, options).includes(view)
}

export function defaultViewForRole(role, options = {}) {
  const views = allowedViewsForRole(role, options)
  return views[0] || 'sales'
}
