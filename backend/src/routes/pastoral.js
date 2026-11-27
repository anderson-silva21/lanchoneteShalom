const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { db } = require('../db');
const { authenticate } = require('../middleware/auth');
const { requireAnyBrotherPermission, requireBrotherPermission } = require('../middleware/brotherAccess');
const { BROTHER_PERMISSIONS, replaceBrotherPermissions } = require('../services/brotherPermissionsService');
const { recordAudit } = require('../services/auditService');
const { generateTemporaryPassword } = require('../utils/passwords');
const { assignRole, assignSheep, endAssignment, endCoordinatorLink, getCommunityOverview, getLinkedBrother, getOwnProfile, getPastoralHome, getSheepProfile, linkPastorToCoordinator, listAppointments, listAssignedSheep, listCalendar, mayManageFollowup, pastoralTree, saveAppointment, saveEvent, saveGroupSchedule, setEventOccurrence, setGroupOccurrence, updateAppointment } = require('../services/pastoralService');

const router = express.Router();
const date = z.string().refine((value)=>{
  const parsed=Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed)&&new Date(parsed).toISOString().slice(0,10)===value;
},'Informe uma data valida no formato AAAA-MM-DD.');
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const permissions = z.array(z.enum(BROTHER_PERMISSIONS)).refine((items) => new Set(items).size === items.length, 'Permissoes duplicadas.');
router.use(authenticate);

router.get('/me', requireBrotherPermission('brothers:self:access'), (req,res) => res.json(getOwnProfile(req.user)));
router.get('/overview', requireAnyBrotherPermission('brothers:read','brothers:create','brothers:update','brothers:groups:manage','brothers:ministries:manage','brothers:calendar:read','brothers:calendar:manage','brothers:followups:read','brothers:followups:create','brothers:self:access','brothers:users:manage'), (req,res)=>res.json(getCommunityOverview(req.user)));
router.get('/home', requireAnyBrotherPermission('brothers:read','brothers:create','brothers:update','brothers:pastoral:coordinate','brothers:pastoral:manage','brothers:calendar:read','brothers:calendar:manage','brothers:followups:read','brothers:followups:create','brothers:self:access','brothers:users:manage'), (req,res)=>res.json(getPastoralHome(req.user)));
router.get('/orgchart', requireAnyBrotherPermission('brothers:read','brothers:pastoral:coordinate','brothers:pastoral:manage','brothers:calendar:read','brothers:self:access'), (req,res) => res.json(pastoralTree(req.user)));
router.get('/sheep', requireAnyBrotherPermission('brothers:pastoral:coordinate','brothers:pastoral:manage','brothers:followups:read','brothers:followups:create'), (req,res) => res.json(listAssignedSheep(req.user)));
router.get('/sheep/:id', requireAnyBrotherPermission('brothers:pastoral:coordinate','brothers:pastoral:manage','brothers:followups:read','brothers:followups:create'), (req,res) => res.json(getSheepProfile(req.user,Number(req.params.id))));
router.get('/pastors', requireAnyBrotherPermission('brothers:read','brothers:groups:manage','brothers:ministries:manage'), (req,res)=>res.json(db.prepare(`SELECT b.id,b.full_name,b.preferred_name FROM brother_pastoral_roles r JOIN brothers b ON b.id=r.brother_id WHERE r.role='pastor' AND r.ended_on IS NULL AND b.status='active' ORDER BY b.full_name COLLATE NOCASE`).all()));
router.post('/appointments', requireBrotherPermission('brothers:followups:create'), (req,res) => {
  const payload=z.object({brother_id:z.coerce.number().int().positive(),occurred_on:date,start_time:time.nullable().optional(),end_time:time.nullable().optional(),location:z.string().trim().max(240).nullable().optional(),category:z.string().trim().min(2).max(80),notes:z.string().trim().min(2).max(10000)}).strict().parse(req.body);
  if(payload.start_time && payload.end_time && payload.end_time<=payload.start_time) return res.status(400).json({message:'O termino deve ser posterior ao inicio.'});
  const appointment=saveAppointment(payload,req.user);
  recordAudit({req,strict:true,action:'brother.appointment.create',entityType:'brother_followup',entityId:appointment.id,summary:'Acompanhamento pastoral agendado.',metadata:{brother_id:payload.brother_id,occurred_on:payload.occurred_on}});
  return res.status(201).json(appointment);
});
router.get('/appointments', requireBrotherPermission('brothers:followups:read'), (req,res) => res.json(listAppointments(req.user)));
router.patch('/appointments/:id', requireBrotherPermission('brothers:followups:update'), (req,res) => {
  const payload=z.object({occurred_on:date,start_time:time.nullable().optional(),end_time:time.nullable().optional(),location:z.string().trim().max(240).nullable().optional(),category:z.string().trim().min(2).max(80),notes:z.string().trim().min(2).max(10000),status:z.enum(['scheduled','completed','cancelled'])}).strict().parse(req.body);
  const result=updateAppointment(Number(req.params.id),payload,req.user);
  recordAudit({req,strict:true,action:'brother.appointment.update',entityType:'brother_followup',entityId:result.id,summary:'Acompanhamento ou horario atualizado.',metadata:{brother_id:result.brother_id,occurred_on:result.occurred_on,status:result.status}});
  return res.json(result);
});
router.get('/appointments/:id/history', requireBrotherPermission('brothers:followups:read'), (req,res) => {
  const appointment=db.prepare('SELECT id,brother_id FROM brother_followups WHERE id=?').get(req.params.id);
  if(!appointment) return res.status(404).json({message:'Acompanhamento nao encontrado.'});
  if(!mayManageFollowup(req.user,appointment.brother_id)) return res.status(403).json({message:'O irmao nao esta vinculado a sua responsabilidade pastoral.'});
  return res.json(db.prepare('SELECT id,change_type,previous_occurred_on,occurred_on,previous_start_time,start_time,previous_end_time,end_time,previous_status,status,changed_at FROM brother_followup_history WHERE followup_id=? ORDER BY changed_at DESC,id DESC').all(appointment.id));
});
router.post('/roles', requireBrotherPermission('brothers:pastoral:manage'), (req,res) => {
  const payload=z.object({brother_id:z.coerce.number().int().positive(),role:z.enum(['coordinator','pastor','sheep']),started_on:date}).strict().parse(req.body);
  const id=assignRole(payload.brother_id,payload.role,payload.started_on,req.user);
  recordAudit({req,strict:true,action:'brother.pastoral.role.assign',entityType:'brother',entityId:payload.brother_id,summary:'Papel pastoral alterado.',metadata:{role:payload.role,started_on:payload.started_on}});
  return res.status(201).json({id,...payload});
});
router.post('/assignments', requireBrotherPermission('brothers:pastoral:manage'), (req,res) => {
  const payload=z.object({sheep_brother_id:z.coerce.number().int().positive(),pastor_brother_id:z.coerce.number().int().positive(),started_on:date}).strict().parse(req.body);
  const id=assignSheep(payload.sheep_brother_id,payload.pastor_brother_id,payload.started_on,req.user);
  recordAudit({req,strict:true,action:'brother.pastoral.assignment',entityType:'brother',entityId:payload.sheep_brother_id,summary:'Vinculo pastoral atualizado.',metadata:{pastor_brother_id:payload.pastor_brother_id,started_on:payload.started_on}});
  return res.status(201).json({id,...payload});
});
router.patch('/assignments/:id/end', requireBrotherPermission('brothers:pastoral:manage'), (req,res) => {
  const {ended_on}=z.object({ended_on:date}).strict().parse(req.body);
  const result=endAssignment(Number(req.params.id),ended_on,req.user);
  recordAudit({req,strict:true,action:'brother.pastoral.assignment.end',entityType:'pastoral_assignment',entityId:Number(req.params.id),summary:'Vinculo pastoral encerrado.',metadata:{ended_on}});
  return res.json(result);
});
router.post('/coordinator-assignments', requireBrotherPermission('brothers:pastoral:manage'), (req,res) => {
  const payload=z.object({pastor_brother_id:z.coerce.number().int().positive(),coordinator_brother_id:z.coerce.number().int().positive(),started_on:date}).strict().parse(req.body);
  const id=linkPastorToCoordinator(payload.pastor_brother_id,payload.coordinator_brother_id,payload.started_on,req.user);
  recordAudit({req,strict:true,action:'brother.pastoral.coordinator.assignment',entityType:'pastoral_coordinator_assignment',entityId:id,summary:'Pastor vinculado a coordenacao.',metadata:payload});
  return res.status(201).json({id,...payload});
});
router.patch('/coordinator-assignments/:id/end', requireBrotherPermission('brothers:pastoral:manage'), (req,res) => {
  const {ended_on}=z.object({ended_on:date}).strict().parse(req.body);
  const result=endCoordinatorLink(Number(req.params.id),ended_on,req.user);
  recordAudit({req,strict:true,action:'brother.pastoral.coordinator.assignment.end',entityType:'pastoral_coordinator_assignment',entityId:Number(req.params.id),summary:'Vinculo com coordenacao encerrado.',metadata:{ended_on}});
  return res.json(result);
});

router.get('/calendar', requireAnyBrotherPermission('brothers:calendar:read','brothers:calendar:manage','brothers:followups:read','brothers:followups:create','brothers:self:access'), (req,res) => {
  const from=date.parse(req.query.from || new Date().toISOString().slice(0,10));
  const to=date.parse(req.query.to || from);
  if (to < from || (Date.parse(`${to}T12:00:00Z`)-Date.parse(`${from}T12:00:00Z`))/86400000 > 92) return res.status(400).json({message:'Selecione um intervalo de ate 93 dias.'});
  return res.json(listCalendar(req.user,from,to));
});
const eventSchema=z.object({title:z.string().trim().min(2).max(180),description:z.string().trim().max(4000).nullable().optional(),event_type:z.enum(['work','pastoral_meeting','other']),event_date:date,start_time:time.nullable().optional(),end_time:time.nullable().optional(),location:z.string().trim().max(240).nullable().optional(),responsible_user_id:z.coerce.number().int().positive().nullable().optional(),participant_ids:z.array(z.coerce.number().int().positive()).max(500).default([]),ministry_id:z.coerce.number().int().positive().nullable().optional(),group_id:z.coerce.number().int().positive().nullable().optional(),visibility:z.enum(['community','pastoral','private']),status:z.enum(['scheduled','cancelled','completed']).default('scheduled'),recurrence_interval:z.coerce.number().int().min(0).max(52).default(0),recurrence_until:date.nullable().optional()}).strict();
router.post('/events', requireBrotherPermission('brothers:calendar:manage'), (req,res) => {
  const payload=eventSchema.parse(req.body); const event=saveEvent(null,payload,req.user);
  recordAudit({req,strict:true,action:'community_event.create',entityType:'community_event',entityId:event.id,summary:'Evento comunitario criado.',metadata:{event_type:event.event_type,event_date:event.event_date}});
  return res.status(201).json(event);
});
router.patch('/events/:id', requireBrotherPermission('brothers:calendar:manage'), (req,res) => {
  const event=saveEvent(Number(req.params.id),eventSchema.parse(req.body),req.user);
  recordAudit({req,strict:true,action:'community_event.update',entityType:'community_event',entityId:event.id,summary:'Evento comunitario atualizado.',metadata:{event_type:event.event_type,event_date:event.event_date}});
  return res.json(event);
});
const personalEventSchema=eventSchema.omit({participant_ids:true,visibility:true,responsible_user_id:true}).extend({recurrence_interval:z.coerce.number().int().min(0).max(52).default(0)});
router.post('/personal-events', requireBrotherPermission('brothers:followups:create'), (req,res)=>{
  const payload=personalEventSchema.parse(req.body);
  const event=saveEvent(null,{...payload,visibility:'private',participant_ids:[],responsible_user_id:req.user.id},req.user);
  recordAudit({req,strict:true,action:'community_event.personal.create',entityType:'community_event',entityId:event.id,summary:'Compromisso pessoal criado.',metadata:{event_date:event.event_date}});
  return res.status(201).json(event);
});
router.patch('/personal-events/:id', requireBrotherPermission('brothers:followups:create'), (req,res)=>{
  const payload=personalEventSchema.parse(req.body);
  const current=db.prepare("SELECT id FROM community_events WHERE id=? AND responsible_user_id=? AND visibility='private'").get(req.params.id,req.user.id);
  if(!current) return res.status(404).json({message:'Compromisso pessoal nao encontrado.'});
  const event=saveEvent(Number(req.params.id),{...payload,visibility:'private',participant_ids:[],responsible_user_id:req.user.id},req.user);
  recordAudit({req,strict:true,action:'community_event.personal.update',entityType:'community_event',entityId:event.id,summary:'Compromisso pessoal atualizado.',metadata:{event_date:event.event_date}});
  return res.json(event);
});
router.put('/personal-events/:id/occurrences/:date', requireBrotherPermission('brothers:followups:create'), (req,res)=>{
  const eventDate=date.parse(req.params.date); const payload=z.object({status:z.enum(['scheduled','cancelled','completed']),title:z.string().trim().max(180).nullable().optional(),description:z.string().trim().max(4000).nullable().optional(),start_time:time.nullable().optional(),end_time:time.nullable().optional(),location:z.string().trim().max(240).nullable().optional(),moved_to_date:date.nullable().optional()}).strict().parse(req.body);
  const owned=db.prepare("SELECT id FROM community_events WHERE id=? AND responsible_user_id=? AND visibility='private'").get(req.params.id,req.user.id);
  if(!owned) return res.status(404).json({message:'Compromisso pessoal nao encontrado.'});
  return res.json(setEventOccurrence(Number(req.params.id),eventDate,payload,req.user));
});
router.put('/events/:id/occurrences/:date', requireBrotherPermission('brothers:calendar:manage'), (req,res) => {
  const eventDate=date.parse(req.params.date); const payload=z.object({status:z.enum(['scheduled','cancelled','completed']),title:z.string().trim().max(180).nullable().optional(),description:z.string().trim().max(4000).nullable().optional(),start_time:time.nullable().optional(),end_time:time.nullable().optional(),location:z.string().trim().max(240).nullable().optional(),moved_to_date:date.nullable().optional()}).strict().parse(req.body);
  const result=setEventOccurrence(Number(req.params.id),eventDate,payload,req.user);
  recordAudit({req,strict:true,action:'community_event.occurrence.update',entityType:'community_event',entityId:Number(req.params.id),summary:'Ocorrencia de evento atualizada.',metadata:{event_date:eventDate,status:payload.status}});
  return res.json(result);
});

const scheduleSchema=z.object({day_of_week:z.coerce.number().int().min(0).max(6),start_time:time,end_time:time,location:z.string().trim().max(240).nullable().optional(),starts_on:date,ends_on:date.nullable().optional(),interval_weeks:z.coerce.number().int().min(1).max(52).default(1),active:z.boolean().default(true)}).strict();
router.get('/groups/:groupId/schedules', requireAnyBrotherPermission('brothers:read','brothers:groups:manage'), (req,res) => res.json(db.prepare('SELECT * FROM prayer_group_schedules WHERE group_id=? ORDER BY starts_on DESC').all(req.params.groupId)));
router.post('/groups/:groupId/schedules', requireBrotherPermission('brothers:groups:manage'), (req,res) => {
  const schedule=saveGroupSchedule(null,Number(req.params.groupId),scheduleSchema.parse(req.body),req.user);
  recordAudit({req,strict:true,action:'prayer_group.schedule.create',entityType:'prayer_group_schedule',entityId:schedule.id,summary:'Recorrencia de grupo de oracao criada.',metadata:{group_id:Number(req.params.groupId),day_of_week:schedule.day_of_week}});
  return res.status(201).json(schedule);
});
router.patch('/groups/:groupId/schedules/:id', requireBrotherPermission('brothers:groups:manage'), (req,res) => {
  const schedule=saveGroupSchedule(Number(req.params.id),Number(req.params.groupId),scheduleSchema.parse(req.body),req.user);
  recordAudit({req,strict:true,action:'prayer_group.schedule.update',entityType:'prayer_group_schedule',entityId:schedule.id,summary:'Recorrencia de grupo de oracao atualizada.',metadata:{group_id:Number(req.params.groupId),day_of_week:schedule.day_of_week}});
  return res.json(schedule);
});
router.put('/group-schedules/:id/occurrences/:date', requireBrotherPermission('brothers:groups:manage'), (req,res) => {
  const eventDate=date.parse(req.params.date); const payload=z.object({status:z.enum(['scheduled','cancelled','completed']),start_time:time.nullable().optional(),end_time:time.nullable().optional(),location:z.string().trim().max(240).nullable().optional(),moved_to_date:date.nullable().optional()}).strict().parse(req.body);
  const result=setGroupOccurrence(Number(req.params.id),eventDate,payload);
  recordAudit({req,strict:true,action:'prayer_group.occurrence.update',entityType:'prayer_group_schedule',entityId:Number(req.params.id),summary:'Ocorrencia de grupo de oracao atualizada.',metadata:{event_date:eventDate,status:payload.status}});
  return res.json(result);
});

router.get('/users', requireBrotherPermission('brothers:users:manage'), (req,res) => res.json(db.prepare(`SELECT u.id,u.name,u.username,u.email,u.active,u.password_must_change,l.brother_id,b.full_name,b.preferred_name FROM users u JOIN user_roles r ON r.user_id=u.id AND r.role='brothers' LEFT JOIN brother_account_links l ON l.user_id=u.id LEFT JOIN brothers b ON b.id=l.brother_id ORDER BY u.active DESC,u.name COLLATE NOCASE`).all().map((user)=>({...user,permissions:require('../services/brotherPermissionsService').getBrotherPermissions(user.id)}))));
const moduleUserSchema=z.object({name:z.string().trim().min(2).max(120),username:z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,40}$/),brother_id:z.coerce.number().int().positive(),permissions:permissions}).strict();
router.post('/users', requireBrotherPermission('brothers:users:manage'), (req,res) => {
  const payload=moduleUserSchema.parse(req.body);
  if (!db.prepare("SELECT id FROM brothers WHERE id=? AND status='active'").get(payload.brother_id)) return res.status(404).json({message:'Irmao ativo nao encontrado.'});
  const email=`${payload.username}@lanchonete.local`;
  if (db.prepare('SELECT id FROM users WHERE username=? OR email=?').get(payload.username,email)) return res.status(409).json({message:'Este usuario ja existe.'});
  const temporaryPassword=generateTemporaryPassword();
  const created=db.transaction(()=>{
    const result=db.prepare("INSERT INTO users (name,username,email,password_hash,role,active,password_must_change) VALUES (?,?,?,?, 'brothers',1,1)").run(payload.name,payload.username,email,bcrypt.hashSync(temporaryPassword,10));
    const id=Number(result.lastInsertRowid);
    replaceBrotherPermissions(id,payload.permissions,req.user.id);
    db.prepare('INSERT INTO brother_account_links (user_id,brother_id,linked_by) VALUES (?,?,?)').run(id,payload.brother_id,req.user.id);
    recordAudit({req,strict:true,action:'brothers.user.create',entityType:'user',entityId:id,summary:'Usuario exclusivo da Gestao de Irmaos criado.',metadata:{username:payload.username,brother_id:payload.brother_id,permissions:payload.permissions}});
    return id;
  })();
  return res.status(201).json({user:{id:created,name:payload.name,username:payload.username,email,role:'brothers',roles:['brothers'],brother_id:payload.brother_id,brother_permissions:payload.permissions,password_must_change:true},temporary_password:temporaryPassword});
});
router.patch('/users/:id', requireBrotherPermission('brothers:users:manage'), (req,res) => {
  const payload=z.object({permissions:permissions.optional(),active:z.boolean().optional()}).strict().refine((v)=>Object.keys(v).length>0).parse(req.body);
  const id=Number(req.params.id);
  if (!db.prepare("SELECT 1 FROM user_roles WHERE user_id=? AND role='brothers'").get(id)) return res.status(404).json({message:'Usuario exclusivo da Gestao de Irmaos nao encontrado.'});
  const currentPermissions=db.prepare("SELECT permission FROM brother_permissions WHERE user_id=?").all(id).map((row)=>row.permission);
  const relinquishingManager=currentPermissions.includes('brothers:users:manage') && (payload.active===false || (payload.permissions && !payload.permissions.includes('brothers:users:manage')));
  if(Number(req.user.id)===id && (payload.active===false || (payload.permissions && !payload.permissions.includes('brothers:users:manage')))) return res.status(400).json({message:'Nao e possivel remover seu proprio acesso de administracao do modulo.'});
  if(relinquishingManager){
    const otherManager=db.prepare(`SELECT 1 FROM users u JOIN brother_permissions p ON p.user_id=u.id AND p.permission='brothers:users:manage' WHERE u.active=1 AND u.id!=? LIMIT 1`).get(id);
    if(!otherManager) return res.status(400).json({message:'Mantenha pelo menos um administrador ativo da Gestao de Irmaos.'});
  }
  db.transaction(()=>{
    if (payload.permissions) replaceBrotherPermissions(id,payload.permissions,req.user.id);
    if (payload.active !== undefined) db.prepare('UPDATE users SET active=? WHERE id=?').run(payload.active?1:0,id);
    recordAudit({req,strict:true,action:'brothers.user.permissions.update',entityType:'user',entityId:id,summary:'Acesso de usuario da Gestao de Irmaos atualizado.',metadata:{permissions:payload.permissions,active:payload.active}});
  })();
  return res.json({id,permissions:payload.permissions,active:payload.active});
});

router.post('/users/:id/reset-password', requireBrotherPermission('brothers:users:manage'), (req,res) => {
  const id=Number(req.params.id);
  const user=db.prepare("SELECT id,username FROM users WHERE id=? AND active=1 AND EXISTS (SELECT 1 FROM user_roles WHERE user_id=? AND role='brothers')").get(id,id);
  if (!user) return res.status(404).json({message:'Usuario exclusivo da Gestao de Irmaos nao encontrado.'});
  const temporaryPassword=generateTemporaryPassword();
  db.prepare('UPDATE users SET password_hash=?,password_must_change=1 WHERE id=?').run(bcrypt.hashSync(temporaryPassword,10),id);
  recordAudit({req,strict:true,action:'brothers.user.reset_password',entityType:'user',entityId:id,summary:'Senha temporaria redefinida para usuario do modulo.',metadata:{username:user.username}});
  return res.json({temporary_password:temporaryPassword});
});

module.exports=router;
