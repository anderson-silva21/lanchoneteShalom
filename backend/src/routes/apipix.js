
const express = require('express')
const router = express.Router()

const { gerarPix } = require('../utils/pix')

router.post('/gerar', (req, res) => {
  try {
    const { amountCents, saleId } = req.body || {}

    if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
      return res.status(400).json({
        message: 'Valor da venda inválido'
      })
    }

    if (saleId !== undefined && (!Number.isSafeInteger(saleId) || saleId <= 0)) {
      return res.status(400).json({ message: 'Identificador da venda inválido' })
    }

    const txid = saleId
      ? `LANC${String(saleId)}`
      : undefined

    const pix = gerarPix(amountCents, txid)

    return res.json({
      payload: pix.payload,
      txid: pix.txid
    })
  } catch (error) {
    console.error('Erro ao gerar Pix:', error)

    return res.status(500).json({
      message: 'Não foi possível gerar o QR Code Pix'
    })
  }
})

module.exports = router
