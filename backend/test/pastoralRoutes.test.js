const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const { randomBytes } = require('node:crypto');

const tempDir=fs.mkdtempSync(path.join(os.tmpdir(),'shalom-pastoral-'));
process.env.DB_PATH=path.join(tempDir,'pastoral.sqlite');
process.env.JWT_SECRET=randomBytes(32).toString('hex');
const {db,initDatabase}=require('../src/db');
initDatabase();
const {publicUser,signUser}=require('../src/middleware/auth');
const app=express();app.use(express.json());app.use('/api/brothers',require('../src/routes/brothers'));app.use('/api/pastoral',require('../src/routes/pastoral'));app.use(require('../src/middleware/errorHandler'));
let server,baseUrl,adminToken,pastorToken,adminId,pastorId,sheepId,otherSheepId,groupId;

test.before(async()=>{
  const admin=db.prepare("SELECT * FROM users WHERE role='admin' LIMIT 1").get();adminId=admin.id;adminToken=signUser(publicUser(admin));
  server=app.listen(0,'127.0.0.1');await new Promise((resolve)=>server.once('listening',resolve));baseUrl=`http://127.0.0.1:${server.address().port}/api`;
});
test.after(async()=>{if(server)await new Promise((resolve)=>server.close(resolve));if(db.open)db.close();fs.rmSync(tempDir,{recursive:true,force:true});});
async function request(route,token,options={}){const response=await fetch(`${baseUrl}${route}`,{...options,headers:{...(options.body?{'content-type':'application/json'}:{}),authorization:`Bearer ${token}`,...options.headers},body:options.body?JSON.stringify(options.body):undefined});return{response,body:await response.json().catch(()=>null)};}
async function createBrother(name){const result=await request('/brothers',adminToken,{method:'POST',body:{full_name:name}});assert.equal(result.response.status,201);return result.body.id;}

test('usuario do modulo fica isolado, estrutura preserva historico e calendario protege notas pastorais',async()=>{
  pastorId=await createBrother('Pastor de Teste');sheepId=await createBrother('Ovelha Vinculada');otherSheepId=await createBrother('Ovelha Alheia');
  for(const [brother_id,role] of [[pastorId,'pastor'],[sheepId,'sheep'],[otherSheepId,'sheep']]){
    const assigned=await request('/pastoral/roles',adminToken,{method:'POST',body:{brother_id,role,started_on:'2026-01-01'}});assert.equal(assigned.response.status,201);
  }
  const relation=await request('/pastoral/assignments',adminToken,{method:'POST',body:{pastor_brother_id:pastorId,sheep_brother_id:sheepId,started_on:'2026-01-01'}});assert.equal(relation.response.status,201);
  const created=await request('/pastoral/users',adminToken,{method:'POST',body:{name:'Conta Pastoral',username:'pastoral.teste',brother_id:pastorId,permissions:['brothers:calendar:read','brothers:followups:read','brothers:followups:create','brothers:followups:update','brothers:self:access']}});
  assert.equal(created.response.status,201,JSON.stringify(created.body));
  db.prepare('UPDATE users SET password_must_change=0 WHERE id=?').run(created.body.user.id);
  const linked=db.prepare('SELECT * FROM users WHERE id=?').get(created.body.user.id);pastorToken=signUser(publicUser(linked));
  assert.deepEqual(publicUser(linked).roles,['brothers']);
  assert.deepEqual(db.prepare('SELECT role FROM user_roles WHERE user_id=?').all(linked.id),[{role:'brothers'}]);

  const appointment=await request('/pastoral/appointments',pastorToken,{method:'POST',body:{brother_id:sheepId,occurred_on:'2026-11-28',start_time:'15:00',end_time:'15:45',location:'Sala 2',category:'pastoral',notes:'NOTA PASTORAL RESERVADA'}});
  assert.equal(appointment.response.status,201,JSON.stringify(appointment.body));
  assert.equal((await request('/pastoral/appointments',pastorToken)).body[0].notes,'NOTA PASTORAL RESERVADA');
  const denied=await request('/pastoral/appointments',pastorToken,{method:'POST',body:{brother_id:otherSheepId,occurred_on:'2026-11-29',category:'pastoral',notes:'nao autorizado'}});
  assert.equal(denied.response.status,403);
  const calendar=await request('/pastoral/calendar?from=2026-11-28&to=2026-11-28',pastorToken);
  assert.equal(calendar.response.status,200);
  assert.equal(calendar.body[0].title,'Acompanhamento: Ovelha Vinculada');
  assert.equal(JSON.stringify(calendar.body).includes('NOTA PASTORAL RESERVADA'),false);

  const privateEvent=await request('/pastoral/events',adminToken,{method:'POST',body:{title:'Reuniao Reservada',event_type:'other',event_date:'2026-11-30',start_time:'18:00',end_time:'19:00',responsible_user_id:adminId,visibility:'private',status:'scheduled',participant_ids:[pastorId]}});
  assert.equal(privateEvent.response.status,201);
  const hiddenEvent=await request('/pastoral/events',adminToken,{method:'POST',body:{title:'Privado sem participacao',event_type:'other',event_date:'2026-11-30',responsible_user_id:adminId,visibility:'private',status:'scheduled',participant_ids:[]}});
  assert.equal(hiddenEvent.response.status,201);
  const sheepAccount=await request('/pastoral/users',adminToken,{method:'POST',body:{name:'Conta Ovelha',username:'ovelha.teste',brother_id:sheepId,permissions:['brothers:calendar:read','brothers:self:access']}});
  assert.equal(sheepAccount.response.status,201);
  db.prepare('UPDATE users SET password_must_change=0 WHERE id=?').run(sheepAccount.body.user.id);
  const sheepToken=signUser(publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(sheepAccount.body.user.id)));
  const sheepCalendar=await request('/pastoral/calendar?from=2026-11-28&to=2026-11-28',sheepToken);
  assert.equal(sheepCalendar.response.status,200);
  assert.equal(sheepCalendar.body.some((item)=>item.title==='Acompanhamento pastoral'),true);
  assert.equal(sheepCalendar.body.some((item)=>item.title==='Reuniao Reservada'),false);
  assert.equal(sheepCalendar.body.some((item)=>item.title==='Privado sem participacao'),false);
  assert.equal(JSON.stringify(sheepCalendar.body).includes('NOTA PASTORAL RESERVADA'),false);
  const pastorCalendar=await request('/pastoral/calendar?from=2026-11-30&to=2026-11-30',pastorToken);
  assert.equal(pastorCalendar.body.some((item)=>item.title==='Reuniao Reservada'),true);
  assert.equal(pastorCalendar.body.some((item)=>item.title==='Privado sem participacao'),false);

  const rescheduled=await request(`/pastoral/appointments/${appointment.body.id}`,pastorToken,{method:'PATCH',body:{occurred_on:'2026-11-30',start_time:'16:00',end_time:'16:30',location:'Sala 3',category:'pastoral',notes:'NOTA PASTORAL RESERVADA',status:'scheduled'}});
  assert.equal(rescheduled.response.status,200,JSON.stringify(rescheduled.body));
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM brother_followups WHERE brother_id=? AND occurred_on=? AND status=\'scheduled\'').get(sheepId,'2026-11-30').n,1);
  const history=await request(`/pastoral/appointments/${appointment.body.id}/history`,pastorToken);
  assert.equal(history.body[0].change_type,'rescheduled');
  assert.equal(JSON.stringify(history.body).includes('NOTA PASTORAL RESERVADA'),false);
  const sheepPrivateCalendar=await request('/pastoral/calendar?from=2026-11-30&to=2026-11-30',sheepToken);
  assert.equal(sheepPrivateCalendar.body.some((item)=>item.title==='Acompanhamento pastoral'),true);
  assert.equal(sheepPrivateCalendar.body.some((item)=>item.title==='Reuniao Reservada'),false);
  assert.equal(sheepPrivateCalendar.body.some((item)=>item.title==='Privado sem participacao'),false);
  assert.equal(JSON.stringify(sheepPrivateCalendar.body).includes('NOTA PASTORAL RESERVADA'),false);

  const group=await request('/brothers/groups',adminToken,{method:'POST',body:{name:'Grupo Semanal',responsible_brother_id:pastorId,active:true}});assert.equal(group.response.status,201);groupId=group.body.id;
  const schedule=await request(`/pastoral/groups/${groupId}/schedules`,adminToken,{method:'POST',body:{day_of_week:2,start_time:'19:30',end_time:'21:00',location:'Capela',starts_on:'2026-11-24',ends_on:'2026-12-31',interval_weeks:1,active:true}});assert.equal(schedule.response.status,201,JSON.stringify(schedule.body));
  const generated=await request('/pastoral/calendar?from=2026-11-24&to=2026-12-01',adminToken);
  assert.equal(generated.body.filter((item)=>item.event_type==='prayer_group').length,2);
  await request(`/pastoral/group-schedules/${schedule.body.id}/occurrences/2026-11-24`,adminToken,{method:'PUT',body:{status:'cancelled'}});
  const afterCancel=await request('/pastoral/calendar?from=2026-11-24&to=2026-12-01',adminToken);
  assert.equal(afterCancel.body.filter((item)=>item.event_type==='prayer_group').length,1);
  await request(`/pastoral/group-schedules/${schedule.body.id}/occurrences/2026-12-01`,adminToken,{method:'PUT',body:{status:'scheduled',moved_to_date:'2026-12-02'}});
  const movedGroup=await request('/pastoral/calendar?from=2026-12-02&to=2026-12-02',adminToken);
  assert.equal(movedGroup.body.filter((item)=>item.event_type==='prayer_group').length,1);
  assert.equal(movedGroup.body.find((item)=>item.event_type==='prayer_group').series_date,'2026-12-01');

  const recurring=await request('/pastoral/events',adminToken,{method:'POST',body:{title:'Evento Recorrente',event_type:'work',event_date:'2026-11-28',start_time:'10:00',end_time:'11:00',responsible_user_id:adminId,visibility:'community',status:'scheduled',recurrence_interval:1,recurrence_until:'2026-12-31',participant_ids:[]}});
  assert.equal(recurring.response.status,201);
  const movedEvent=await request(`/pastoral/events/${recurring.body.id}/occurrences/2026-11-28`,adminToken,{method:'PUT',body:{status:'scheduled',moved_to_date:'2026-12-02',start_time:'12:00',end_time:'13:00'}});
  assert.equal(movedEvent.response.status,200);
  const eventOnNewDate=await request('/pastoral/calendar?from=2026-12-02&to=2026-12-02',adminToken);
  assert.equal(eventOnNewDate.body.some((item)=>item.title==='Evento Recorrente'&&item.series_date==='2026-11-28'),true);
  const eventOnOldDate=await request('/pastoral/calendar?from=2026-11-28&to=2026-11-28',adminToken);
  assert.equal(eventOnOldDate.body.some((item)=>item.title==='Evento Recorrente'),false);

  const service=await request('/brothers/ministries',adminToken,{method:'POST',body:{name:'Serviço com estrutura flexível',description:'Descrição do serviço',responsible_brother_id:pastorId,active:true}});
  assert.equal(service.response.status,201,JSON.stringify(service.body));
  const ministryId=service.body.id;
  const coordination=await request(`/brothers/ministries/${ministryId}/nodes`,adminToken,{method:'POST',body:{parent_node_id:null,node_type:'coordination',name:'Coordenação de missão',description:null,responsible_brother_id:pastorId,active:true}});
  assert.equal(coordination.response.status,201,JSON.stringify(coordination.body));
  const rootNode=coordination.body.nodes[0];
  const team=await request(`/brothers/ministries/${ministryId}/nodes`,adminToken,{method:'POST',body:{parent_node_id:rootNode.id,node_type:'team',name:'Equipe de acolhida',description:null,responsible_brother_id:null,active:true}});
  assert.equal(team.response.status,201,JSON.stringify(team.body));
  const teamId=team.body.nodes[0].children[0].id;
  const nodeMember=await request(`/brothers/ministries/${ministryId}/nodes/${teamId}/members`,adminToken,{method:'POST',body:{brother_id:otherSheepId,function_title:'Acolhida',started_on:'2026-01-01'}});
  assert.equal(nodeMember.response.status,201,JSON.stringify(nodeMember.body));
  const structure=await request(`/brothers/ministries/${ministryId}/structure`,adminToken);
  assert.equal(structure.body.nodes[0].children[0].members[0].full_name,'Ovelha Alheia');
  const cycle=await request(`/brothers/ministries/${ministryId}/nodes/${rootNode.id}`,adminToken,{method:'PATCH',body:{parent_node_id:teamId,node_type:'coordination',name:'Coordenação de missão',description:null,responsible_brother_id:pastorId,active:true}});
  assert.equal(cycle.response.status,409);

  const secondGroup=await request('/brothers/groups',adminToken,{method:'POST',body:{name:'Grupo de destino',service_id:ministryId,responsible_brother_id:pastorId,habitual_day_of_week:5,habitual_start_time:'17:00',location:'Capela',starts_on:'2026-11-27',active:true}});
  assert.equal(secondGroup.response.status,201,JSON.stringify(secondGroup.body));
  assert.equal(secondGroup.body.habitual_day_of_week,5);
  const groupPastor=await request(`/brothers/groups/${secondGroup.body.id}/pastors`,adminToken,{method:'POST',body:{brother_id:pastorId,started_on:'2026-11-27'}});
  assert.equal(groupPastor.response.status,201,JSON.stringify(groupPastor.body));
  const groupFilter=await request(`/brothers/groups?service_id=${ministryId}&day_of_week=5&active=true`,adminToken);
  assert.equal(groupFilter.body.some((item)=>item.id===secondGroup.body.id),true);
  const addedMember=await request(`/brothers/groups/${groupId}/members`,adminToken,{method:'POST',body:{brother_id:sheepId,started_on:'2026-01-01'}});
  assert.equal(addedMember.response.status,201);
  const transfer=await request(`/brothers/groups/${groupId}/members/${addedMember.body.id}/transfer`,adminToken,{method:'POST',body:{group_id:secondGroup.body.id,started_on:'2026-02-01'}});
  assert.equal(transfer.response.status,201,JSON.stringify(transfer.body));
  assert.equal(transfer.body.ended_on,'2026-01-31');
  const groupDetail=await request(`/brothers/groups/${secondGroup.body.id}`,adminToken);
  assert.equal(groupDetail.body.members.some((item)=>item.brother_id===sheepId&&item.ended_on===null),true);
  assert.ok(groupDetail.body.history.some((item)=>item.action==='member.transferred'));
  const habitual=await request('/pastoral/calendar?from=2026-11-27&to=2026-11-27',adminToken);
  assert.equal(habitual.body.some((item)=>item.group_id===secondGroup.body.id),true);

  const linkedEvent=await request('/pastoral/events',adminToken,{method:'POST',body:{title:'Encontro de serviço',event_type:'work',event_date:'2026-11-28',responsible_user_id:adminId,ministry_id:ministryId,group_id:secondGroup.body.id,visibility:'community',status:'scheduled',participant_ids:[]}});
  assert.equal(linkedEvent.response.status,201,JSON.stringify(linkedEvent.body));
  const linkedCalendar=await request('/pastoral/calendar?from=2026-11-28&to=2026-11-28',adminToken);
  const serviceEvent=linkedCalendar.body.find((item)=>item.title==='Encontro de serviço');
  assert.equal(serviceEvent.service_name,'Serviço com estrutura flexível');
  assert.equal(serviceEvent.group_name,'Grupo de destino');
  const overview=await request('/pastoral/overview',adminToken);
  assert.equal(overview.response.status,200);
  assert.equal(typeof overview.body.totals.brothers,'number');
  assert.ok(overview.body.recent_activities.length>0);
  const home=await request('/pastoral/home',pastorToken);
  assert.equal(home.body.role,'pastor');
  assert.ok(home.body.sheep.some((item)=>item.id===sheepId));
  assert.equal((await request(`/pastoral/sheep/${sheepId}`,pastorToken)).response.status,200);
  assert.equal((await request(`/pastoral/sheep/${otherSheepId}`,pastorToken)).response.status,403);
  const personal=await request('/pastoral/personal-events',pastorToken,{method:'POST',body:{title:'Estudo pessoal',description:'Somente meu',event_type:'other',event_date:'2026-12-03',start_time:'20:00',end_time:'21:00',location:'Casa',status:'scheduled',recurrence_interval:1,recurrence_until:'2026-12-10'}});
  assert.equal(personal.response.status,201,JSON.stringify(personal.body));
  const personalCalendar=await request('/pastoral/calendar?from=2026-12-03&to=2026-12-03',pastorToken);
  assert.equal(personalCalendar.body.some((item)=>item.title==='Estudo pessoal'),true);
  const personalMoved=await request(`/pastoral/personal-events/${personal.body.id}/occurrences/2026-12-03`,pastorToken,{method:'PUT',body:{status:'scheduled',moved_to_date:'2026-12-04',start_time:'21:00',end_time:'22:00'}});
  assert.equal(personalMoved.response.status,200,JSON.stringify(personalMoved.body));
  const movedPersonalCalendar=await request('/pastoral/calendar?from=2026-12-04&to=2026-12-04',pastorToken);
  assert.equal(movedPersonalCalendar.body.some((item)=>item.title==='Estudo pessoal'),true);
  const sheepCalendarAfterPersonal=await request('/pastoral/calendar?from=2026-12-03&to=2026-12-03',sheepToken);
  assert.equal(sheepCalendarAfterPersonal.body.some((item)=>item.title==='Estudo pessoal'),false);
  const sheepCalendarAfterPersonalMove=await request('/pastoral/calendar?from=2026-12-04&to=2026-12-04',sheepToken);
  assert.equal(sheepCalendarAfterPersonalMove.body.some((item)=>item.title==='Estudo pessoal'),false);

  const coordinatorBrother=await createBrother('Coordenador de Teste');
  const coordinatorRole=await request('/pastoral/roles',adminToken,{method:'POST',body:{brother_id:coordinatorBrother,role:'coordinator',started_on:'2026-01-01'}});
  assert.equal(coordinatorRole.response.status,201,JSON.stringify(coordinatorRole.body));
  const coordinatorAccount=await request('/pastoral/users',adminToken,{method:'POST',body:{name:'Conta Coordenacao',username:'coordenacao.teste',brother_id:coordinatorBrother,permissions:['brothers:pastoral:coordinate','brothers:self:access','brothers:followups:read','brothers:calendar:read']}});
  assert.equal(coordinatorAccount.response.status,201,JSON.stringify(coordinatorAccount.body));
  db.prepare('UPDATE users SET password_must_change=0 WHERE id=?').run(coordinatorAccount.body.user.id);
  const coordinatorToken=signUser(publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(coordinatorAccount.body.user.id)));
  const coordinatorHome=await request('/pastoral/home',coordinatorToken);
  assert.equal(coordinatorHome.body.role,'coordinator');
  const coordinatorOverview=await request('/pastoral/overview',coordinatorToken);
  assert.ok(coordinatorOverview.body.totals.pastors>=1);
  assert.equal((await request(`/pastoral/sheep/${sheepId}`,coordinatorToken)).response.status,200);
});
