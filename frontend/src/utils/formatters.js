export const money = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL'
})

export const decimal = new Intl.NumberFormat('pt-BR', {
  maximumFractionDigits: 2
})

export function formatDateTime(value) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(new Date(value))
}

export function stockLabel(status) {
  if (status === 'critical' || status === 'critico') return 'Critico'
  if (status === 'warning' || status === 'atencao') return 'Atencao'
  return 'Normal'
}
