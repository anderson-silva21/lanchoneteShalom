const express = require('express');
const { z } = require('zod');
const { authenticate } = require('../middleware/auth');
const { requireScreen } = require('../middleware/accessControl');
const { createCombo, listActiveCombos } = require('../services/comboService');

const router = express.Router();

const comboSchema = z.object({
  name: z.string().trim().min(2),
  sale_price: z.coerce.number().positive(),
  is_promotion: z.coerce.boolean().default(false),
  expires_at: z.preprocess(
    (value) => value === '' || value === undefined ? null : value,
    z.string().datetime().nullable()
  ),
  items: z.array(z.object({
    product_id: z.coerce.number().int().positive(),
    quantity: z.coerce.number().positive()
  })).min(1)
});

router.use(authenticate, requireScreen('sales'));

router.get('/', (req, res) => {
  return res.json(listActiveCombos());
});

router.post('/', (req, res, next) => {
  try {
    return res.status(201).json(createCombo(comboSchema.parse(req.body), req.user.id));
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
