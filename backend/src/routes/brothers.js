const express = require('express');
const { z } = require('zod');
const { authenticate } = require('../middleware/auth');
const { requireAnyBrotherPermission, requireBrotherPermission } = require('../middleware/brotherAccess');
const { hasBrotherPermission } = require('../services/brotherPermissionsService');
const { mayManageFollowup } = require('../services/pastoralService');
const { recordAudit } = require('../services/auditService');
const {
  addMembership, addMinistryNodeMember, createBrother, endGroupPastor, endMembership, getBrother, getPrayerGroup,
  listBrotherPeople, listBrothers, listFollowups, listGroups, listMinistries, ministryStructure, saveFollowup,
  saveGroup, saveGroupPastor, saveMinistry, saveMinistryNode, transferGroupMember, updateBrother
} = require('../services/brothersService');

const router = express.Router();
const nullableText = (max) => z.string().trim().max(max).nullable().optional();
const optionalId = z.preprocess((value) => value === '' || value === undefined ? null : value, z.coerce.number().int().positive().nullable().optional());
const isoDate = z.string().refine((value) => {
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}, 'Informe uma data valida no formato AAAA-MM-DD.');
const date = isoDate.nullable().optional();

const brotherSchema = z.object({
  full_name: z.string().trim().min(3).max(160),
  preferred_name: nullableText(100), birth_date: date,
  phone: nullableText(24), email: z.string().trim().email().max(254).nullable().optional(),
  postal_code: nullableText(12), address_street: nullableText(180), address_number: nullableText(30),
  address_complement: nullableText(100), district: nullableText(100), city: nullableText(100), state: z.string().trim().regex(/^[A-Za-z]{2}$/).nullable().optional(),
  community_joined_on: date, status: z.enum(['active', 'inactive']).optional(), community_status: nullableText(100)
}).strict();
const brotherUpdateSchema = brotherSchema.partial().refine((payload) => Object.keys(payload).length > 0, 'Informe ao menos um campo.');
const groupSchema = z.object({
  name: z.string().trim().min(2).max(120), description: nullableText(1000),
  responsible_brother_id: optionalId, service_id: optionalId,
  habitual_day_of_week: z.coerce.number().int().min(0).max(6).nullable().optional(),
  habitual_start_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
  location: nullableText(240), starts_on: date, active: z.boolean().default(true)
}).strict();
const ministrySchema = groupSchema;
const followupSchema = z.object({
  occurred_on: isoDate,
  responsible_user_id: optionalId,
  category: z.string().trim().min(2).max(80),
  notes: z.string().trim().min(2).max(10000),
  start_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
  end_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
  location: nullableText(240),
  next_on: date,
  status: z.enum(['scheduled', 'completed', 'cancelled']).default('completed')
}).strict();

router.use(authenticate);

router.get('/', requireBrotherPermission('brothers:read'), (req, res) => {
  return res.json(listBrothers({
    q: String(req.query.q || ''), groupId: req.query.group_id || '', ministryId: req.query.ministry_id || '',
    status: ['active', 'inactive'].includes(req.query.status) ? req.query.status : '',
    page: req.query.page, pageSize: req.query.page_size
  }));
});

router.post('/', requireBrotherPermission('brothers:create'), (req, res) => {
  const created = createBrother(brotherSchema.parse(req.body), req.user, req);
  return res.status(201).json(hasBrotherPermission(req.user, 'brothers:read') ? created : { id: created.id, created: true });
});

router.get('/people', requireAnyBrotherPermission('brothers:read', 'brothers:groups:manage', 'brothers:ministries:manage', 'brothers:pastoral:manage', 'brothers:users:manage'), (req, res) => {
  return res.json(listBrotherPeople());
});

router.get('/groups', requireAnyBrotherPermission('brothers:read', 'brothers:groups:manage'), (req, res) => {
  return res.json(listGroups({service_id:req.query.service_id,responsible_brother_id:req.query.responsible_brother_id,day_of_week:req.query.day_of_week,active:req.query.active,q:String(req.query.q||'')}));
});

router.get('/groups/:groupId', requireAnyBrotherPermission('brothers:read','brothers:groups:manage'), (req,res)=>res.json(getPrayerGroup(Number(req.params.groupId))));

router.get('/groups/:groupId/members', requireAnyBrotherPermission('brothers:read','brothers:groups:manage'), (req,res)=>res.json(getPrayerGroup(Number(req.params.groupId)).members));

router.post('/groups/:groupId/members', requireBrotherPermission('brothers:groups:manage'), (req,res)=>{
  const payload=z.object({brother_id:z.coerce.number().int().positive(),started_on:date}).strict().parse(req.body);
  return res.status(201).json(addMembership('group',payload.brother_id,{...payload,group_id:Number(req.params.groupId)},req.user,req));
});

router.patch('/groups/:groupId/members/:membershipId/end', requireBrotherPermission('brothers:groups:manage'), (req,res)=>{
  const {ended_on}=z.object({ended_on:isoDate}).strict().parse(req.body);
  const current=db.prepare('SELECT brother_id FROM brother_group_memberships WHERE id=? AND group_id=?').get(req.params.membershipId,req.params.groupId);
  if(!current) return res.status(404).json({message:'Vinculo de grupo nao encontrado.'});
  return res.json(endMembership('group',current.brother_id,Number(req.params.membershipId),ended_on,req.user,req));
});

router.post('/groups/:groupId/members/:membershipId/transfer', requireBrotherPermission('brothers:groups:manage'), (req,res)=>{
  const payload=z.object({group_id:z.coerce.number().int().positive(),started_on:isoDate}).strict().parse(req.body);
  return res.status(201).json(transferGroupMember(Number(req.params.groupId),Number(req.params.membershipId),payload,req.user,req));
});

router.post('/groups/:groupId/pastors', requireBrotherPermission('brothers:groups:manage'), (req,res)=>{
  const payload=z.object({brother_id:z.coerce.number().int().positive(),started_on:isoDate}).strict().parse(req.body);
  return res.status(201).json(saveGroupPastor(Number(req.params.groupId),payload.brother_id,payload.started_on,req.user,req));
});

router.patch('/groups/:groupId/pastors/:linkId/end', requireBrotherPermission('brothers:groups:manage'), (req,res)=>{
  const {ended_on}=z.object({ended_on:isoDate}).strict().parse(req.body);
  return res.json(endGroupPastor(Number(req.params.groupId),Number(req.params.linkId),ended_on,req.user,req));
});

router.post('/groups', requireBrotherPermission('brothers:groups:manage'), (req, res) => {
  return res.status(201).json(saveGroup(null, groupSchema.parse(req.body), req.user, req));
});

router.patch('/groups/:groupId', requireBrotherPermission('brothers:groups:manage'), (req, res) => {
  return res.json(saveGroup(Number(req.params.groupId), groupSchema.parse(req.body), req.user, req));
});

router.get('/ministries', requireAnyBrotherPermission('brothers:read', 'brothers:ministries:manage'), (req, res) => {
  return res.json(listMinistries());
});

router.post('/ministries', requireBrotherPermission('brothers:ministries:manage'), (req, res) => {
  return res.status(201).json(saveMinistry(null, ministrySchema.parse(req.body), req.user, req));
});

router.patch('/ministries/:ministryId', requireBrotherPermission('brothers:ministries:manage'), (req, res) => {
  return res.json(saveMinistry(Number(req.params.ministryId), ministrySchema.parse(req.body), req.user, req));
});

router.get('/ministries/:ministryId/structure', requireAnyBrotherPermission('brothers:read','brothers:ministries:manage'), (req,res)=>res.json(ministryStructure(Number(req.params.ministryId))));
const structureNodeSchema=z.object({parent_node_id:optionalId,node_type:z.enum(['coordination','team','custom']),name:z.string().trim().min(2).max(120),description:nullableText(1000),responsible_brother_id:optionalId,active:z.boolean().default(true)}).strict();
router.post('/ministries/:ministryId/nodes', requireBrotherPermission('brothers:ministries:manage'), (req,res)=>res.status(201).json(saveMinistryNode(Number(req.params.ministryId),null,structureNodeSchema.parse(req.body),req.user,req)));
router.patch('/ministries/:ministryId/nodes/:nodeId', requireBrotherPermission('brothers:ministries:manage'), (req,res)=>res.json(saveMinistryNode(Number(req.params.ministryId),Number(req.params.nodeId),structureNodeSchema.parse(req.body),req.user,req)));
router.post('/ministries/:ministryId/nodes/:nodeId/members', requireBrotherPermission('brothers:ministries:manage'), (req,res)=>{
  const payload=z.object({brother_id:z.coerce.number().int().positive(),function_title:nullableText(100),started_on:isoDate}).strict().parse(req.body);
  res.status(201).json(addMinistryNodeMember(Number(req.params.ministryId),Number(req.params.nodeId),payload.brother_id,payload,req.user,req));
});

router.get('/:id/followups', requireBrotherPermission('brothers:followups:read'), (req, res) => {
  const brotherId = Number(req.params.id);
  if (!mayManageFollowup(req.user, brotherId)) return res.status(403).json({ message: 'O irmao nao esta vinculado a sua responsabilidade pastoral.' });
  const followups = listFollowups(brotherId);
  recordAudit({ req, strict: true, action: 'brother.followup.read', entityType: 'brother', entityId: brotherId, summary: 'Acompanhamentos consultados.' });
  return res.json(followups);
});

router.post('/:id/followups', requireBrotherPermission('brothers:followups:create'), (req, res) => {
  if (!mayManageFollowup(req.user, Number(req.params.id))) return res.status(403).json({ message: 'O irmao nao esta vinculado a sua responsabilidade pastoral.' });
  return res.status(201).json(saveFollowup(null, Number(req.params.id), followupSchema.parse(req.body), req.user, req));
});

router.patch('/:id/followups/:followupId', requireBrotherPermission('brothers:followups:update'), (req, res) => {
  if (!mayManageFollowup(req.user, Number(req.params.id))) return res.status(403).json({ message: 'O irmao nao esta vinculado a sua responsabilidade pastoral.' });
  return res.json(saveFollowup(Number(req.params.followupId), Number(req.params.id), followupSchema.parse(req.body), req.user, req));
});

router.post('/:id/groups', requireBrotherPermission('brothers:update'), (req, res) => {
  const payload = z.object({ group_id: z.coerce.number().int().positive(), started_on: date }).strict().parse(req.body);
  return res.status(201).json(addMembership('group', Number(req.params.id), payload, req.user, req));
});

router.patch('/:id/groups/:membershipId/end', requireBrotherPermission('brothers:update'), (req, res) => {
  const { ended_on } = z.object({ ended_on: isoDate }).strict().parse(req.body);
  return res.json(endMembership('group', Number(req.params.id), Number(req.params.membershipId), ended_on, req.user, req));
});

router.post('/:id/ministries', requireBrotherPermission('brothers:update'), (req, res) => {
  const payload = z.object({ ministry_id: z.coerce.number().int().positive(), function_title: nullableText(100), started_on: date }).strict().parse(req.body);
  return res.status(201).json(addMembership('ministry', Number(req.params.id), payload, req.user, req));
});

router.patch('/:id/ministries/:membershipId/end', requireBrotherPermission('brothers:update'), (req, res) => {
  const { ended_on } = z.object({ ended_on: isoDate }).strict().parse(req.body);
  return res.json(endMembership('ministry', Number(req.params.id), Number(req.params.membershipId), ended_on, req.user, req));
});

router.get('/:id', requireBrotherPermission('brothers:read'), (req, res) => {
  return res.json(getBrother(Number(req.params.id)));
});

router.patch('/:id', requireBrotherPermission('brothers:update'), (req, res) => {
  const updated = updateBrother(Number(req.params.id), brotherUpdateSchema.parse(req.body), req.user, req);
  return res.json(hasBrotherPermission(req.user, 'brothers:read') ? updated : { id: updated.id, updated: true });
});

module.exports = router;
