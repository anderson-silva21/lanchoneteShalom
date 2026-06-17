const defaultApiUrl = typeof window !== 'undefined'
  ? `${window.location.protocol}//${window.location.hostname || 'localhost'}:4000/api`
  : 'http://localhost:4000/api'

const API_URL = import.meta.env.VITE_API_URL || defaultApiUrl

let authToken = localStorage.getItem('lanchonete_token') || ''

export function setToken(token) {
  authToken = token || ''
  if (token) localStorage.setItem('lanchonete_token', token)
  else localStorage.removeItem('lanchonete_token')
}

export function getToken() {
  return authToken
}

async function request(path, options = {}) {
  const headers = {
    ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    ...options.headers
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    body: options.body && !(options.body instanceof FormData) ? JSON.stringify(options.body) : options.body
  })

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}))
    const error = new Error(errorPayload.message || 'Nao foi possivel completar a acao.')
    error.payload = errorPayload
    throw error
  }

  if (response.status === 204) return null
  return response.json()
}

async function download(path, filename) {
  const response = await fetch(`${API_URL}${path}`, {
    headers: authToken ? { Authorization: `Bearer ${authToken}` } : {}
  })

  if (!response.ok) throw new Error('Nao foi possivel baixar o arquivo.')

  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export const api = {
  login: (username, password) => request('/auth/login', { method: 'POST', body: { username, password } }),
  me: () => request('/auth/me'),
  changePassword: (payload) => request('/auth/change-password', { method: 'POST', body: payload }),
  users: () => request('/users'),
  createUser: (payload) => request('/users', { method: 'POST', body: payload }),
  resetUserPassword: (id) => request(`/users/${id}/reset-password`, { method: 'POST' }),
  deleteUser: (id) => request(`/users/${id}`, { method: 'DELETE' }),
  dashboard: () => request('/analytics/dashboard', { cache: 'no-store' }),
  products: (params = {}) => request(`/products?${new URLSearchParams(params)}`),
  productCategories: () => request('/products/categories'),
  createProduct: (product) => request('/products', { method: 'POST', body: product }),
  updateProduct: (id, product) => request(`/products/${id}`, { method: 'PATCH', body: product }),
  combos: () => request('/combos'),
  createCombo: (combo) => request('/combos', { method: 'POST', body: combo }),
  createSale: (sale) => request('/sales', { method: 'POST', body: sale }),
  events: () => request('/sales/events'),
  createEvent: (event) => request('/sales/events', { method: 'POST', body: event }),
  sales: () => request('/sales?limit=80'),
  movements: () => request('/inventory/movements'),
  batches: (params = {}) => request(`/inventory/batches?${new URLSearchParams(params)}`),
  updateBatch: (id, payload) => request(`/inventory/batches/${id}`, { method: 'PATCH', body: payload }),
  productStock: (id, params = {}) => request(`/inventory/products/${id}/stock?${new URLSearchParams(params)}`),
  createMovement: (movement) => request('/inventory/movements', { method: 'POST', body: movement }),
  postEventInventories: () => request('/inventory/post-event'),
  postEventInventory: (id) => request(`/inventory/post-event/${id}`),
  createPostEventInventory: (inventory) => request('/inventory/post-event', { method: 'POST', body: inventory }),
  sheets: () => request('/spreadsheet/sheets'),
  sheet: (sheet) => request(`/spreadsheet/${sheet}`),
  updateSheetProduct: (id, payload) => request(`/spreadsheet/produtos/${id}`, { method: 'PATCH', body: payload }),
  updateSheetSale: (id, payload) => request(`/spreadsheet/vendas/${id}`, { method: 'PATCH', body: payload }),
  confirmSheetSalePayment: (id, payload) => request(`/spreadsheet/vendas/${id}`, { method: 'PATCH', body: payload }),
  updateSheetMovement: (id, payload) => request(`/spreadsheet/movimentacoes/${id}`, { method: 'PATCH', body: payload }),
  setupStatus: () => request('/system/setup-status', { cache: 'no-store' }),
  updateInitialLoad: (payload) => request('/system/initial-load', { method: 'PATCH', body: payload }),
  telegramAlertsStatus: () => request('/system/telegram-alerts', { cache: 'no-store' }),
  testTelegramAlerts: () => request('/system/telegram-alerts/test', { method: 'POST' }),
  resetOperationalData: (payload) => request('/system/reset-operational-data', { method: 'POST', body: payload }),
  backup: () => request('/backup', { method: 'POST' }),
  backups: () => request('/backup'),
  downloadReport: (type, format) => download(`/reports/export?type=${type}&format=${format}`, `${type}.${format}`)
}
