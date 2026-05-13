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
    throw new Error(errorPayload.message || 'Nao foi possivel completar a acao.')
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
  login: (email, password) => request('/auth/login', { method: 'POST', body: { email, password } }),
  me: () => request('/auth/me'),
  dashboard: () => request('/analytics/dashboard'),
  products: (params = {}) => request(`/products?${new URLSearchParams(params)}`),
  createProduct: (product) => request('/products', { method: 'POST', body: product }),
  updateProduct: (id, product) => request(`/products/${id}`, { method: 'PATCH', body: product }),
  combos: () => request('/combos'),
  createSale: (sale) => request('/sales', { method: 'POST', body: sale }),
  sales: () => request('/sales?limit=80'),
  movements: () => request('/inventory/movements'),
  createMovement: (movement) => request('/inventory/movements', { method: 'POST', body: movement }),
  sheets: () => request('/spreadsheet/sheets'),
  sheet: (sheet) => request(`/spreadsheet/${sheet}`),
  updateSheetProduct: (id, payload) => request(`/spreadsheet/produtos/${id}`, { method: 'PATCH', body: payload }),
  backup: () => request('/backup', { method: 'POST' }),
  backups: () => request('/backup'),
  powerBiDataset: () => request('/powerbi/dataset'),
  pushPowerBi: () => request('/powerbi/push', { method: 'POST' }),
  downloadReport: (type, format) => download(`/reports/export?type=${type}&format=${format}`, `${type}.${format}`)
}
