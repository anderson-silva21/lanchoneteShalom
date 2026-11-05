
const crypto = require('crypto')

const PIX_KEY = process.env.PIX_KEY ||
  'financeirosaojosecampos@comshalom.org'

const MERCHANT_NAME = 'COMUNIDADE CATOLICA SHALO'
const MERCHANT_CITY = 'FORTALEZA'

function tlv(id, value) {
  const content = String(value)
  const length = Buffer.byteLength(content, 'utf8')

  if (length > 99) {
    throw new Error(`Campo Pix ${id} excede o limite`)
  }

  return id + String(length).padStart(2, '0') + content
}

function crc16(payload) {
  let crc = 0xffff

  for (const byte of Buffer.from(payload, 'utf8')) {
    crc ^= byte << 8

    for (let i = 0; i < 8; i++) {
      if (crc & 0x8000) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff
      } else {
        crc = (crc << 1) & 0xffff
      }
    }
  }

  return crc.toString(16).toUpperCase().padStart(4, '0')
}

function gerarPix(valorEmCentavos, txid) {
  if (!Number.isSafeInteger(valorEmCentavos) || valorEmCentavos <= 0) {
    throw new Error('Valor Pix inválido')
  }

  const identificador = txid ||
    crypto.randomBytes(10).toString('hex').toUpperCase()

  if (!/^[a-zA-Z0-9]{1,25}$/.test(identificador)) {
    throw new Error('Identificador Pix inválido')
  }

  // Dados da conta Pix
  const merchantAccount =
    tlv('00', 'br.gov.bcb.pix') +
    tlv('01', PIX_KEY) +
    tlv('02', 'Pix')

  // Converte centavos para reais sem depender de operações
  // de ponto flutuante.
  const valor = `${Math.floor(valorEmCentavos / 100)}.${String(
    valorEmCentavos % 100
  ).padStart(2, '0')}`

  const payload =
    tlv('00', '01') +
    tlv('01', '11') +
    tlv('26', merchantAccount) +
    tlv('52', '0000') +
    tlv('53', '986') +
    tlv('54', valor) +
    tlv('58', 'BR') +
    tlv('59', MERCHANT_NAME) +
    tlv('60', MERCHANT_CITY) +
    tlv('62', tlv('05', identificador)) +
    '6304'

  return {
    payload: payload + crc16(payload),
    txid: identificador
  }
}

module.exports = { gerarPix }
