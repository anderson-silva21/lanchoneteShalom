export const emptyLibraryRequestSaleDraft = {
  customer_name: '',
  payment_method: 'manual',
  notes: ''
}

export function draftForLibraryRequest(drafts, reference) {
  return {
    ...emptyLibraryRequestSaleDraft,
    ...(drafts[reference] || {})
  }
}

export function updateLibraryRequestDraft(drafts, reference, patch) {
  if (!reference) return drafts
  return {
    ...drafts,
    [reference]: {
      ...draftForLibraryRequest(drafts, reference),
      ...patch
    }
  }
}

export function clearLibraryRequestDraft(drafts, reference) {
  if (!reference || !drafts[reference]) return drafts
  const nextDrafts = { ...drafts }
  delete nextDrafts[reference]
  return nextDrafts
}

export function formatLibraryCustomerContact(contact) {
  const digits = String(contact || '').replace(/\D/g, '')
  if (!digits) return 'Contato nao informado'
  if (digits.length === 13 && digits.startsWith('55')) {
    return `+55 ${digits.slice(2, 4)} ${digits.slice(4, 9)}-${digits.slice(9)}`
  }
  if (digits.length === 12 && digits.startsWith('55')) {
    return `+55 ${digits.slice(2, 4)} ${digits.slice(4, 8)}-${digits.slice(8)}`
  }
  if (digits.length === 11) {
    return `+55 ${digits.slice(0, 2)} ${digits.slice(2, 7)}-${digits.slice(7)}`
  }
  if (digits.length === 10) {
    return `+55 ${digits.slice(0, 2)} ${digits.slice(2, 6)}-${digits.slice(6)}`
  }
  return `+${digits}`
}
