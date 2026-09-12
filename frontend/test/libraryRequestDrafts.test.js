import test from 'node:test'
import assert from 'node:assert/strict'
import {
  clearLibraryRequestDraft,
  draftForLibraryRequest,
  formatLibraryCustomerContact,
  updateLibraryRequestDraft
} from '../src/utils/libraryRequestDrafts.js'

test('draft de atendimento fica isolado por referencia', () => {
  let drafts = {}
  drafts = updateLibraryRequestDraft(drafts, 'LS-4ZCMH', { customer_name: 'Anderson' })
  drafts = updateLibraryRequestDraft(drafts, 'LS-3YMZ7', { customer_name: 'Maria' })

  assert.equal(draftForLibraryRequest(drafts, 'LS-4ZCMH').customer_name, 'Anderson')
  assert.equal(draftForLibraryRequest(drafts, 'LS-3YMZ7').customer_name, 'Maria')

  drafts = updateLibraryRequestDraft(drafts, 'LS-4ZCMH', { notes: 'Retirar no balcao' })

  assert.equal(draftForLibraryRequest(drafts, 'LS-4ZCMH').notes, 'Retirar no balcao')
  assert.equal(draftForLibraryRequest(drafts, 'LS-3YMZ7').notes, '')
})

test('limpar draft remove apenas o atendimento informado', () => {
  const drafts = {
    'LS-4ZCMH': { customer_name: 'Anderson' },
    'LS-KHBX8': { customer_name: 'Joao' }
  }

  const nextDrafts = clearLibraryRequestDraft(drafts, 'LS-4ZCMH')

  assert.equal(draftForLibraryRequest(nextDrafts, 'LS-4ZCMH').customer_name, '')
  assert.equal(draftForLibraryRequest(nextDrafts, 'LS-KHBX8').customer_name, 'Joao')
})

test('contato do cliente e formatado com fallback para legado sem telefone', () => {
  assert.equal(formatLibraryCustomerContact('5581999998888'), '+55 81 99999-8888')
  assert.equal(formatLibraryCustomerContact('81999998888'), '+55 81 99999-8888')
  assert.equal(formatLibraryCustomerContact(''), 'Contato nao informado')
  assert.equal(formatLibraryCustomerContact(null), 'Contato nao informado')
})
