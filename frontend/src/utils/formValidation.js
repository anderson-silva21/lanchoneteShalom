export function fieldLabel(field) {
  const label = field.labels?.[0]
  const text = label && Array.from(label.childNodes).filter((node) => !node.matches?.('input, select, textarea, .form-field-error')).map((node) => node.textContent).join(' ').trim()
  return field.getAttribute('aria-label') || text || field.placeholder || field.name.replaceAll('_', ' ') || 'este campo'
}

export function fieldError(field, form) {
  if (!field.willValidate) return ''
  const value = field.type === 'password' ? field.value : field.value.trim()
  const label = fieldLabel(field)
  if (field.required && !value) return field.dataset.requiredMessage || `Preencha ${label}.`
  if (field.validity.badInput) return 'Informe um numero valido.'
  if (!value) return ''
  if (field.minLength > 0 && value.length < field.minLength) return `Use pelo menos ${field.minLength} caracteres.`
  if (field.maxLength > 0 && value.length > field.maxLength) return `Use no maximo ${field.maxLength} caracteres.`
  if (field.validity.typeMismatch) return field.type === 'email' ? 'Informe um e-mail valido, como nome@exemplo.com.' : 'Informe uma URL completa, como https://exemplo.com.'
  if (field.validity.rangeUnderflow) return `Informe um valor maior ou igual a ${field.min}.`
  if (field.validity.rangeOverflow) return `Informe um valor menor ou igual a ${field.max}.`
  if (field.validity.stepMismatch) return `Use incrementos de ${field.step}.`
  if (field.dataset.format === 'phone' && !/^\+?[\d\s().-]+$/.test(value)) return 'Informe apenas numeros, DDD e, se necessario, DDI.'
  if (field.dataset.format === 'phone' && (value.replace(/\D/g, '').length < 10 || value.replace(/\D/g, '').length > 15)) return 'Informe de 10 a 15 digitos, incluindo o DDD.'
  if (field.dataset.format === 'http-url') {
    try {
      if (!['http:', 'https:'].includes(new URL(value).protocol)) return 'Use uma URL HTTP ou HTTPS.'
    } catch {
      return 'Informe uma URL completa, como https://exemplo.com.'
    }
  }
  if (field.dataset.format === 'decimal' && (!/^\d+([.,]\d{1,2})?$/.test(value) || Number(value.replace(',', '.')) <= 0)) return 'Informe um valor maior que zero, como 12,50.'
  if (field.dataset.match && value !== form.elements.namedItem(field.dataset.match)?.value) return 'Repita a nova senha exatamente como foi digitada.'
  if (field.validity.patternMismatch) return field.dataset.patternMessage || 'Confira o formato informado.'
  return field.validity.valid ? '' : 'Confira o valor informado neste campo.'
}

export function validateForm(form) {
  return Object.fromEntries(Array.from(form.elements).filter((field) => field.id && field.willValidate).map((field) => [field.id, fieldError(field, form)]).filter(([, message]) => message))
}

function issueMessage(issue, field) {
  if (issue.code === 'too_small') return issue.origin === 'string' ? `Use pelo menos ${issue.minimum} caracteres.` : `Informe um valor ${issue.inclusive ? 'maior ou igual a' : 'maior que'} ${issue.minimum}.`
  if (issue.code === 'too_big') return issue.origin === 'string' ? `Use no maximo ${issue.maximum} caracteres.` : `Informe um valor menor ou igual a ${issue.maximum}.`
  if (issue.code === 'invalid_type') return `Informe um valor valido para ${fieldLabel(field)}.`
  if (issue.code === 'invalid_format') return issue.format === 'url' ? 'Informe uma URL completa, como https://exemplo.com.' : 'Confira o formato informado.'
  return issue.message || 'Confira o valor informado neste campo.'
}

export function serverFieldErrors(form, error) {
  const issues = error.payload?.issues || []
  const errors = {}
  for (const issue of issues) {
    const name = issue.path?.join('.')
    const field = Array.from(form.elements).find((control) => control.name === name && control.willValidate)
    if (field && !errors[field.id]) errors[field.id] = issueMessage(issue, field)
  }
  for (const [name, message] of Object.entries(error.payload?.fieldErrors || {})) {
    const field = Array.from(form.elements).find((control) => control.name === name && control.willValidate)
    if (field) errors[field.id] = Array.isArray(message) ? message.join(' ') : message
  }
  return errors
}

export function reportFormError(form, error) {
  form?.dispatchEvent(new CustomEvent('form-error', { detail: error }))
}
