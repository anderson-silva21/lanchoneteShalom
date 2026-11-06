
const express = require('express')
const router = express.Router()

const { gerarPix, MAX_AMOUNT_CENTS } = require('../utils/pix')

router.post('/gerar', (req, res) => {
  try {
    const { amountCents } = req.body || {}

    if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > MAX_AMOUNT_CENTS) {
      return res.status(400).json({
        message: 'Valor da venda inválido'
      })
    }

    const pix = gerarPix(amountCents)

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
