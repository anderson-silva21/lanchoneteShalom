const express = require('express');
const { z } = require('zod');
const { authenticate, requireRole } = require('../middleware/auth');
const { requireScreen } = require('../middleware/accessControl');
const { createCombo, deleteComboSafely, listActiveCombos, listCombos, updateCombo } = require('../services/comboService');
const { recordAudit } = require('../services/auditService');

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
  })).min(1),
  active: z.coerce.boolean().default(true)
});

router.use(authenticate, requireScreen('sales'));

router.get('/', (req, res) => {
  return res.json(listActiveCombos());
});

router.get('/manage', requireRole('admin', 'manager', 'finance'), (req, res) => res.json(listCombos()));

router.post('/', requireRole('admin', 'manager', 'finance'), (req, res, next) => {
  try {
    const combo = createCombo(comboSchema.parse(req.body), req.user.id);
    recordAudit({
      req,
      action: 'combo.create',
      entityType: 'combo',
      entityId: combo.id,
      summary: `Combo criado: ${combo.name}`,
      metadata: combo
    });
    return res.status(201).json(combo);
  } catch (error) {
    return next(error);
  }
});

router.patch('/:id', requireRole('admin', 'manager', 'finance'), (req, res, next) => {
  try {
    const combo = updateCombo(req.params.id, comboSchema.parse(req.body));
    recordAudit({ req, action: 'combo.update', entityType: 'combo', entityId: combo.id, summary: `Combo atualizado: ${combo.name}`, metadata: combo });
    return res.json(combo);
  } catch (error) {
    return next(error);
  }
});

router.delete('/:id', requireRole('admin', 'manager', 'finance'), (req, res, next) => {
  try {
    const result = deleteComboSafely(req.params.id);
    recordAudit({
      req,
      action: 'combo.delete',
      entityType: 'combo',
      entityId: result.combo.id,
      summary: `Combo excluido: ${result.combo.name}`,
      metadata: result
    });
    return res.json(result);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
