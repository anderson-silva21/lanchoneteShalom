const { db } = require('../db');
const { hasBrotherPermission } = require('./brotherPermissionsService');

function failure(status, message) { return Object.assign(new Error(message), { status }); }
function dateValue(value) { return String(value || '').slice(0, 10); }
function addDays(date, days) { const result = new Date(`${date}T12:00:00Z`); result.setUTCDate(result.getUTCDate() + days); return result.toISOString().slice(0, 10); }
function isOccurrenceDate(start, interval, until, date) {
  const startTime = Date.parse(`${start}T12:00:00Z`);
  const dateTime = Date.parse(`${date}T12:00:00Z`);
  if (!Number.isFinite(startTime) || !Number.isFinite(dateTime) || date < start || (until && date > until)) return false;
  if (!interval) return date === start;
  const elapsedDays = (dateTime - startTime) / 86400000;
  return Number.isInteger(elapsedDays) && elapsedDays % (7 * interval) === 0;
}
function getLinkedBrother(userId) { return db.prepare('SELECT brother_id FROM brother_account_links WHERE user_id = ?').get(userId)?.brother_id || null; }
function isCoordinator(user) { return user?.role === 'admin' || user?.roles?.includes('admin') || user?.brother_permissions?.includes('brothers:pastoral:coordinate'); }

function recordHistory(brotherId, actorId, type, summary, details = null) {
  db.prepare('INSERT INTO brother_history (brother_id,actor_user_id,event_type,summary,details) VALUES (?,?,?,?,?)')
    .run(brotherId, actorId, type, summary, details ? JSON.stringify(details) : null);
}

function assignRole(brotherId, role, startedOn, actor) {
  const brother = db.prepare("SELECT id FROM brothers WHERE id = ? AND status = 'active'").get(brotherId);
  if (!brother) throw failure(404, 'Irmao ativo nao encontrado.');
  const current = db.prepare('SELECT * FROM brother_pastoral_roles WHERE brother_id = ? AND ended_on IS NULL').get(brotherId);
  if(current?.role===role) return current.id;
  const transaction = db.transaction(() => {
    if (current) {
      if (startedOn <= current.started_on) throw failure(400, 'A nova atribuicao deve comecar depois do inicio do papel atual.');
      const endedOn = addDays(startedOn, -1);
      db.prepare('UPDATE brother_pastoral_roles SET ended_on = ? WHERE id = ?').run(endedOn, current.id);
      if (current.role === 'coordinator') db.prepare('UPDATE pastoral_coordinator_assignments SET ended_on=? WHERE coordinator_brother_id=? AND ended_on IS NULL').run(endedOn,brotherId);
      if (current.role === 'pastor' && role !== 'pastor') {
        db.prepare('UPDATE pastoral_coordinator_assignments SET ended_on=? WHERE pastor_brother_id=? AND ended_on IS NULL').run(endedOn,brotherId);
        db.prepare('UPDATE pastoral_assignments SET ended_on=? WHERE pastor_brother_id=? AND ended_on IS NULL').run(endedOn,brotherId);
      }
      if (current.role === 'sheep' && role !== 'sheep') db.prepare('UPDATE pastoral_assignments SET ended_on=? WHERE sheep_brother_id=? AND ended_on IS NULL').run(endedOn,brotherId);
      recordHistory(brotherId, actor.id, 'pastoral.role.ended', 'Papel pastoral encerrado.', { role: current.role, ended_on: endedOn });
    }
    if (role === 'coordinator') {
      const activeCoordinator=db.prepare("SELECT brother_id,started_on FROM brother_pastoral_roles WHERE role='coordinator' AND ended_on IS NULL").get();
      if(activeCoordinator && activeCoordinator.brother_id!==brotherId){
        if(startedOn<=activeCoordinator.started_on) throw failure(400,'A nova coordenacao deve iniciar apos a atual.');
        const endedOn=addDays(startedOn,-1);
        db.prepare("UPDATE brother_pastoral_roles SET ended_on=? WHERE brother_id=? AND role='coordinator' AND ended_on IS NULL").run(endedOn,activeCoordinator.brother_id);
        db.prepare('UPDATE pastoral_coordinator_assignments SET ended_on=? WHERE coordinator_brother_id=? AND ended_on IS NULL').run(endedOn,activeCoordinator.brother_id);
        recordHistory(activeCoordinator.brother_id,actor.id,'pastoral.coordinator.transferred','Coordenacao pastoral transferida.',{to_coordinator_id:brotherId,ended_on:endedOn});
      }
    }
    const inserted = db.prepare('INSERT INTO brother_pastoral_roles (brother_id,role,started_on,assigned_by) VALUES (?,?,?,?)')
      .run(brotherId, role, startedOn, actor.id);
    if(role==='coordinator'){
      const pastors=db.prepare("SELECT brother_id FROM brother_pastoral_roles WHERE role='pastor' AND ended_on IS NULL AND brother_id<>?").all(brotherId);
      const link=db.prepare('INSERT INTO pastoral_coordinator_assignments (coordinator_brother_id,pastor_brother_id,started_on,assigned_by) VALUES (?,?,?,?)');
      pastors.forEach(({brother_id:pastorId})=>link.run(brotherId,pastorId,startedOn,actor.id));
    } else if(role==='pastor') {
      const activeCoordinator=db.prepare("SELECT brother_id FROM brother_pastoral_roles WHERE role='coordinator' AND ended_on IS NULL").get();
      if(activeCoordinator) db.prepare('INSERT INTO pastoral_coordinator_assignments (coordinator_brother_id,pastor_brother_id,started_on,assigned_by) VALUES (?,?,?,?)').run(activeCoordinator.brother_id,brotherId,startedOn,actor.id);
    }
    recordHistory(brotherId, actor.id, 'pastoral.role.assigned', 'Papel pastoral atribuido.', { role, started_on: startedOn });
    return Number(inserted.lastInsertRowid);
  });
  return transaction();
}

function assignSheep(sheepId, pastorId, startedOn, actor) {
  if (!db.prepare("SELECT id FROM brothers WHERE id = ? AND status = 'active'").get(sheepId)) throw failure(404, 'Ovelha ativa nao encontrada.');
  if (!db.prepare("SELECT id FROM brothers WHERE id = ? AND status = 'active'").get(pastorId)) throw failure(404, 'Pastor ativo nao encontrado.');
  const sheepRole = db.prepare("SELECT id FROM brother_pastoral_roles WHERE brother_id = ? AND role = 'sheep' AND ended_on IS NULL").get(sheepId);
  const pastorRole = db.prepare("SELECT id FROM brother_pastoral_roles WHERE brother_id = ? AND role = 'pastor' AND ended_on IS NULL").get(pastorId);
  if (!sheepRole || !pastorRole) throw failure(400, 'Atribua os papeis pastorais de pastor e ovelha antes do vinculo.');
  const existing = db.prepare('SELECT * FROM pastoral_assignments WHERE sheep_brother_id = ? AND ended_on IS NULL').get(sheepId);
  return db.transaction(() => {
    if (existing) {
      if(startedOn<=existing.started_on) throw failure(400,'A transferencia deve iniciar depois do vinculo atual.');
      const endedOn = addDays(startedOn, -1);
      db.prepare('UPDATE pastoral_assignments SET ended_on = ? WHERE id = ?').run(endedOn, existing.id);
      recordHistory(sheepId, actor.id, 'pastoral.assignment.transferred', 'Responsabilidade pastoral transferida.', { from_pastor_id: existing.pastor_brother_id, to_pastor_id: pastorId, ended_on: endedOn });
    }
    const result = db.prepare('INSERT INTO pastoral_assignments (pastor_brother_id,sheep_brother_id,started_on,assigned_by) VALUES (?,?,?,?)')
      .run(pastorId, sheepId, startedOn, actor.id);
    return Number(result.lastInsertRowid);
  })();
}

function linkPastorToCoordinator(pastorId,coordinatorId,startedOn,actor){
  if(!db.prepare("SELECT 1 FROM brother_pastoral_roles WHERE brother_id=? AND role='pastor' AND ended_on IS NULL").get(pastorId)) throw failure(400,'O irmao selecionado nao possui papel ativo de pastor.');
  if(!db.prepare("SELECT 1 FROM brother_pastoral_roles WHERE brother_id=? AND role='coordinator' AND ended_on IS NULL").get(coordinatorId)) throw failure(400,'O irmao selecionado nao possui papel ativo de coordenador.');
  const existing=db.prepare('SELECT * FROM pastoral_coordinator_assignments WHERE pastor_brother_id=? AND ended_on IS NULL').get(pastorId);
  return db.transaction(()=>{
    if(existing){
      if(startedOn<=existing.started_on) throw failure(400,'A transferencia deve iniciar depois do vinculo atual.');
      db.prepare('UPDATE pastoral_coordinator_assignments SET ended_on=? WHERE id=?').run(addDays(startedOn,-1),existing.id);
    }
    const result=db.prepare('INSERT INTO pastoral_coordinator_assignments (coordinator_brother_id,pastor_brother_id,started_on,assigned_by) VALUES (?,?,?,?)').run(coordinatorId,pastorId,startedOn,actor.id);
    recordHistory(pastorId,actor.id,'pastoral.coordinator.assignment','Pastor vinculado a coordenacao.',{coordinator_brother_id:coordinatorId,started_on:startedOn});
    return Number(result.lastInsertRowid);
  })();
}

function endCoordinatorLink(id,endedOn,actor){
  const link=db.prepare('SELECT * FROM pastoral_coordinator_assignments WHERE id=? AND ended_on IS NULL').get(id);
  if(!link) throw failure(404,'Vinculo ativo nao encontrado.');
  if(endedOn<link.started_on) throw failure(400,'A data de encerramento deve ser posterior ao inicio.');
  db.transaction(()=>{
    db.prepare('UPDATE pastoral_coordinator_assignments SET ended_on=? WHERE id=?').run(endedOn,id);
    recordHistory(link.pastor_brother_id,actor.id,'pastoral.coordinator.assignment.end','Vinculo com a coordenacao encerrado.',{coordinator_brother_id:link.coordinator_brother_id,ended_on:endedOn});
  })();
  return {id,ended_on:endedOn};
}

function endAssignment(id, endedOn, actor) {
  const row = db.prepare('SELECT * FROM pastoral_assignments WHERE id = ? AND ended_on IS NULL').get(id);
  if (!row) throw failure(404, 'Vinculo pastoral ativo nao encontrado.');
  if (endedOn < row.started_on) throw failure(400, 'A data de encerramento deve ser posterior ao inicio.');
  db.transaction(() => {
    db.prepare('UPDATE pastoral_assignments SET ended_on = ? WHERE id = ?').run(endedOn, id);
    recordHistory(row.sheep_brother_id, actor.id, 'pastoral.assignment.ended', 'Responsabilidade pastoral encerrada.', { pastor_brother_id: row.pastor_brother_id, ended_on: endedOn });
  })();
  return { id, ended_on: endedOn };
}

function pastoralTree(user) {
  const linkedId = getLinkedBrother(user.id);
  const all = isCoordinator(user) || user?.brother_permissions?.includes('brothers:pastoral:manage') || user?.brother_permissions?.includes('brothers:read');
  const coordinator = db.prepare(`SELECT b.id,b.full_name,b.preferred_name,b.photo_url FROM brother_pastoral_roles r JOIN brothers b ON b.id = r.brother_id WHERE r.role='coordinator' AND r.ended_on IS NULL`).get() || null;
  let pastorRows;
  if (all) pastorRows = db.prepare(`SELECT b.id,b.full_name,b.preferred_name,b.photo_url,a.id AS coordinator_assignment_id FROM brothers b JOIN brother_pastoral_roles r ON r.brother_id=b.id AND r.role='pastor' AND r.ended_on IS NULL LEFT JOIN pastoral_coordinator_assignments a ON a.pastor_brother_id=b.id AND a.ended_on IS NULL WHERE b.status='active' ORDER BY b.full_name COLLATE NOCASE`).all();
  else if (linkedId) pastorRows = db.prepare(`SELECT DISTINCT p.id,p.full_name,p.preferred_name,p.photo_url FROM pastoral_assignments a JOIN brothers p ON p.id=a.pastor_brother_id WHERE a.sheep_brother_id=? AND a.ended_on IS NULL UNION SELECT id,full_name,preferred_name,photo_url FROM brothers WHERE id=? AND EXISTS (SELECT 1 FROM brother_pastoral_roles WHERE brother_id=? AND role='pastor' AND ended_on IS NULL)`).all(linkedId, linkedId, linkedId);
  if(coordinator && all) pastorRows=db.prepare(`SELECT b.id,b.full_name,b.preferred_name,b.photo_url,a.id AS coordinator_assignment_id FROM pastoral_coordinator_assignments a JOIN brothers b ON b.id=a.pastor_brother_id JOIN brother_pastoral_roles r ON r.brother_id=b.id AND r.role='pastor' AND r.ended_on IS NULL WHERE a.coordinator_brother_id=? AND a.ended_on IS NULL AND b.status='active' ORDER BY b.full_name COLLATE NOCASE`).all(coordinator.id);
  else if (!all && !linkedId) pastorRows=[];
  const pastors = pastorRows.map((pastor) => {
    const sheep = all || linkedId === pastor.id
      ? db.prepare(`SELECT b.id,b.full_name,b.preferred_name,b.photo_url FROM pastoral_assignments a JOIN brothers b ON b.id=a.sheep_brother_id WHERE a.pastor_brother_id=? AND a.ended_on IS NULL AND b.status='active' ORDER BY b.full_name COLLATE NOCASE`).all(pastor.id)
      : [];
    return { ...pastor, sheep_count: db.prepare('SELECT COUNT(*) AS n FROM pastoral_assignments WHERE pastor_brother_id=? AND ended_on IS NULL').get(pastor.id).n, sheep };
  });
  const linkedRole=linkedId ? db.prepare('SELECT role FROM brother_pastoral_roles WHERE brother_id=? AND ended_on IS NULL').get(linkedId)?.role : null;
  if (!all && linkedId && linkedRole==='sheep' && !user?.brother_permissions?.includes('brothers:pastoral:manage')) {
    const self = db.prepare('SELECT id,full_name,preferred_name,photo_url FROM brothers WHERE id=?').get(linkedId);
    return { coordinator, pastors, self, self_pastor: db.prepare(`SELECT p.id,p.full_name,p.preferred_name,p.photo_url FROM pastoral_assignments a JOIN brothers p ON p.id=a.pastor_brother_id WHERE a.sheep_brother_id=? AND a.ended_on IS NULL`).get(linkedId) || null };
  }
  return { coordinator, pastors };
}

function getOwnProfile(user) {
  const id = getLinkedBrother(user.id);
  if (!id) throw failure(404, 'Este usuario nao esta vinculado a um cadastro de irmao.');
  const brother = db.prepare('SELECT id,full_name,preferred_name,birth_date,phone,email,community_joined_on,community_status,status,photo_url FROM brothers WHERE id=?').get(id);
  const assignment = db.prepare(`SELECT p.id AS pastor_id,p.full_name AS pastor_name,p.preferred_name AS pastor_preferred_name,a.started_on FROM pastoral_assignments a JOIN brothers p ON p.id=a.pastor_brother_id WHERE a.sheep_brother_id=? AND a.ended_on IS NULL`).get(id) || null;
  return { ...brother, pastor: assignment };
}

function listAssignedSheep(user) {
  if (isCoordinator(user) || user?.brother_permissions?.includes('brothers:pastoral:manage')) return db.prepare(`SELECT b.id,b.full_name,b.preferred_name FROM brothers b JOIN pastoral_assignments a ON a.sheep_brother_id=b.id AND a.ended_on IS NULL WHERE b.status='active' ORDER BY b.full_name COLLATE NOCASE`).all();
  const ownId=getLinkedBrother(user.id);
  if (!ownId) return [];
  return db.prepare(`SELECT b.id,b.full_name,b.preferred_name FROM brothers b JOIN pastoral_assignments a ON a.sheep_brother_id=b.id AND a.ended_on IS NULL WHERE a.pastor_brother_id=? AND b.status='active' ORDER BY b.full_name COLLATE NOCASE`).all(ownId);
}

function getSheepProfile(user,brotherId) {
  if(!mayManageFollowup(user,brotherId)) throw failure(403,'O irmao nao esta vinculado a sua responsabilidade pastoral.');
  const brother=db.prepare("SELECT id,full_name,preferred_name,community_status,community_joined_on,status FROM brothers WHERE id=? AND status='active'").get(brotherId);
  if(!brother) throw failure(404,'Ovelha ativa nao encontrada.');
  const groups=db.prepare(`SELECT g.id,g.name,m.started_on FROM brother_group_memberships m JOIN prayer_groups g ON g.id=m.group_id WHERE m.brother_id=? AND m.ended_on IS NULL AND g.active=1 ORDER BY g.name COLLATE NOCASE`).all(brotherId);
  return {...brother,groups};
}

function mayManageFollowup(user, brotherId) {
  if (isCoordinator(user)) return true;
  const ownId=getLinkedBrother(user.id);
  if (!ownId) return user?.brother_permissions?.includes('brothers:followups:read') || user?.brother_permissions?.includes('brothers:followups:create');
  if (ownId===Number(brotherId)) return false;
  return Boolean(db.prepare('SELECT 1 FROM pastoral_assignments WHERE pastor_brother_id=? AND sheep_brother_id=? AND ended_on IS NULL').get(ownId,brotherId));
}

function saveAppointment(payload,user) {
  if (!mayManageFollowup(user,payload.brother_id)) throw failure(403,'O irmao nao esta vinculado a sua responsabilidade pastoral.');
  const row=db.prepare("INSERT INTO brother_followups (brother_id,occurred_on,responsible_user_id,category,notes,next_on,status,start_time,end_time,location,created_by) VALUES (?,?,?,?,?,NULL,'scheduled',?,?,?,?)")
    .run(payload.brother_id,payload.occurred_on,user.id,payload.category,payload.notes,payload.start_time||null,payload.end_time||null,payload.location||null,user.id);
  return {id:Number(row.lastInsertRowid),brother_id:payload.brother_id,occurred_on:payload.occurred_on,start_time:payload.start_time||null,end_time:payload.end_time||null,status:'scheduled'};
}

function listAppointments(user) {
  const ownId=getLinkedBrother(user.id);
  if (isCoordinator(user)) return db.prepare(`SELECT f.id,f.brother_id,b.full_name,f.occurred_on,f.start_time,f.end_time,f.location,f.category,f.notes,f.status,f.responsible_user_id FROM brother_followups f JOIN brothers b ON b.id=f.brother_id ORDER BY f.occurred_on DESC,f.id DESC LIMIT 500`).all();
  if (!ownId) {
    if(user?.brother_permissions?.includes('brothers:followups:read')) return db.prepare(`SELECT f.id,f.brother_id,b.full_name,f.occurred_on,f.start_time,f.end_time,f.location,f.category,f.notes,f.status,f.responsible_user_id FROM brother_followups f JOIN brothers b ON b.id=f.brother_id ORDER BY f.occurred_on DESC,f.id DESC LIMIT 500`).all();
    return db.prepare(`SELECT f.id,f.brother_id,b.full_name,f.occurred_on,f.start_time,f.end_time,f.location,f.category,f.notes,f.status,f.responsible_user_id FROM brother_followups f JOIN brothers b ON b.id=f.brother_id WHERE f.responsible_user_id=? ORDER BY f.occurred_on DESC,f.id DESC LIMIT 500`).all(user.id);
  }
  return db.prepare(`SELECT f.id,f.brother_id,b.full_name,f.occurred_on,f.start_time,f.end_time,f.location,f.category,f.notes,f.status,f.responsible_user_id FROM brother_followups f JOIN brothers b ON b.id=f.brother_id WHERE f.responsible_user_id=? OR f.brother_id IN (SELECT sheep_brother_id FROM pastoral_assignments WHERE pastor_brother_id=? AND ended_on IS NULL) ORDER BY f.occurred_on DESC,f.id DESC LIMIT 500`).all(user.id,ownId);
}

function updateAppointment(id,payload,user) {
  const current=db.prepare('SELECT * FROM brother_followups WHERE id=?').get(id);
  if (!current) throw failure(404,'Acompanhamento nao encontrado.');
  if (!mayManageFollowup(user,current.brother_id)) throw failure(403,'O irmao nao esta vinculado a sua responsabilidade pastoral.');
  if (payload.start_time && payload.end_time && payload.end_time<=payload.start_time) throw failure(400,'O termino deve ser posterior ao inicio.');
  db.transaction(()=>{
    db.prepare(`INSERT INTO brother_followup_history (followup_id,actor_user_id,change_type,previous_occurred_on,occurred_on,previous_start_time,start_time,previous_end_time,end_time,previous_status,status)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(id,user.id,payload.status==='cancelled'?'cancelled':payload.occurred_on!==current.occurred_on?'rescheduled':'updated',current.occurred_on,payload.occurred_on,current.start_time,payload.start_time??null,current.end_time,payload.end_time??null,current.status,payload.status);
    db.prepare(`UPDATE brother_followups SET occurred_on=?,start_time=?,end_time=?,location=?,status=?,category=?,notes=?,updated_by=?,updated_at=datetime('now','-3 hours') WHERE id=?`)
      .run(payload.occurred_on,payload.start_time??null,payload.end_time??null,payload.location??null,payload.status,payload.category,payload.notes,user.id,id);
  })();
  return {id,brother_id:current.brother_id,occurred_on:payload.occurred_on,start_time:payload.start_time??null,end_time:payload.end_time??null,status:payload.status};
}

function eventVisibility(event, user) {
  if (event.visibility === 'community') return true;
  if (isCoordinator(user) || user?.brother_permissions?.includes('brothers:pastoral:manage')) return true;
  if (event.visibility === 'pastoral') {
    const linkedId=getLinkedBrother(user.id);
    if(linkedId && db.prepare("SELECT 1 FROM brother_pastoral_roles WHERE brother_id=? AND role='sheep' AND ended_on IS NULL").get(linkedId)) return false;
    return Boolean(user?.brother_permissions?.includes('brothers:calendar:read'));
  }
  if (Number(event.responsible_user_id) === Number(user.id)) return true;
  return Boolean(db.prepare('SELECT 1 FROM community_event_participants p JOIN brother_account_links l ON l.brother_id=p.brother_id WHERE p.event_id=? AND l.user_id=?').get(event.id,user.id));
}

function dateInRange(date, from, to) { return date >= from && date <= to; }
function eventOccurrence(row, date, override = {}) {
  return { id: row.id, series_date: date, occurrence_date: override.moved_to_date || date, title: override.title ?? row.title, description: override.description ?? row.description,
    event_type: row.event_type, start_time: override.start_time ?? row.start_time, end_time: override.end_time ?? row.end_time,
    location: override.location ?? row.location, status: override.status ?? row.status, visibility: row.visibility,
    responsible_user_id: row.responsible_user_id,service_id:row.ministry_id,service_name:row.service_name,group_id:row.group_id,group_name:row.group_name,recurrence: row.recurrence_interval > 0 };
}

function listCalendar(user, from, to) {
  const events = db.prepare(`SELECT e.*,m.name AS service_name,g.name AS group_name FROM community_events e LEFT JOIN ministries m ON m.id=e.ministry_id LEFT JOIN prayer_groups g ON g.id=e.group_id
    WHERE e.event_date <= ? AND (e.recurrence_until IS NULL OR e.recurrence_until >= ? OR e.recurrence_interval = 0 OR EXISTS (SELECT 1 FROM community_event_occurrences o WHERE o.event_id=e.id AND o.moved_to_date BETWEEN ? AND ?))`).all(to,from,from,to);
  const output = [];
  for (const event of events) {
    const occurrenceRows=db.prepare('SELECT * FROM community_event_occurrences WHERE event_id=? AND (event_date BETWEEN ? AND ? OR moved_to_date BETWEEN ? AND ?)').all(event.id,from,to,from,to);
    const occurrenceOverrides = new Map(occurrenceRows.map((entry) => [entry.event_date, entry]));
    const dates = [];
    if (!event.recurrence_interval) dates.push(event.event_date);
    else {
      const until = event.recurrence_until || to;
      for (let cursor = event.event_date; cursor <= to && cursor <= until; cursor = addDays(cursor, 7 * event.recurrence_interval)) dates.push(cursor);
    }
    const includedOverrides=new Set();
    for (const date of dates) if (dateInRange(date, from, to)) {
      const override = occurrenceOverrides.get(date);
      if(override?.moved_to_date && !dateInRange(override.moved_to_date,from,to)) continue;
      const item = eventOccurrence(event, date, override || {});
      if(override) includedOverrides.add(date);
      if (item.status !== 'cancelled' && eventVisibility(event, user)) output.push(item);
    }
    for(const override of occurrenceRows) if(!includedOverrides.has(override.event_date)&&override.moved_to_date&&dateInRange(override.moved_to_date,from,to)){
      const item=eventOccurrence(event,override.event_date,override);
      if(item.status!=='cancelled'&&eventVisibility(event,user))output.push(item);
    }
  }
  const schedules = db.prepare(`SELECT s.*,g.name AS group_name FROM prayer_group_schedules s JOIN prayer_groups g ON g.id=s.group_id WHERE s.active=1 AND g.active=1 AND s.starts_on<=? AND (s.ends_on IS NULL OR s.ends_on>=? OR EXISTS (SELECT 1 FROM prayer_group_occurrences o WHERE o.schedule_id=s.id AND o.moved_to_date BETWEEN ? AND ?))`).all(to,from,from,to);
  for (const schedule of schedules) {
    const occurrenceRows=db.prepare('SELECT * FROM prayer_group_occurrences WHERE schedule_id=? AND (event_date BETWEEN ? AND ? OR moved_to_date BETWEEN ? AND ?)').all(schedule.id,from,to,from,to);
    const overrides = new Map(occurrenceRows.map((entry) => [entry.event_date, entry]));
    const includedOverrides=new Set();
    const start = schedule.starts_on > from ? schedule.starts_on : from;
    for (let cursor = start; cursor <= to && (!schedule.ends_on || cursor <= schedule.ends_on); cursor = addDays(cursor, 1)) {
      if (new Date(`${cursor}T12:00:00Z`).getUTCDay() !== schedule.day_of_week) continue;
      const elapsedWeeks = Math.floor((Date.parse(`${cursor}T12:00:00Z`) - Date.parse(`${schedule.starts_on}T12:00:00Z`)) / (7 * 86400000));
      if (elapsedWeeks % schedule.interval_weeks) continue;
      const override = overrides.get(cursor);
      if (override?.status === 'cancelled' || (override?.moved_to_date && !dateInRange(override.moved_to_date,from,to))) continue;
      if(override)includedOverrides.add(cursor);
      output.push({ id: `group-${schedule.id}-${cursor}`, source_id: schedule.id, series_date: cursor, occurrence_date: override?.moved_to_date || cursor, title: schedule.group_name,group_id:schedule.group_id,group_name:schedule.group_name,
        event_type: 'prayer_group', start_time: override?.start_time || schedule.start_time, end_time: override?.end_time || schedule.end_time,
        location: override?.location ?? schedule.location, status: override?.status || 'scheduled', visibility: 'community' });
    }
    for(const override of occurrenceRows) if(!includedOverrides.has(override.event_date)&&override.moved_to_date&&dateInRange(override.moved_to_date,from,to)&&override.status!=='cancelled'){
      output.push({id:`group-${schedule.id}-${override.event_date}`,source_id:schedule.id,series_date:override.event_date,occurrence_date:override.moved_to_date,title:schedule.group_name,group_id:schedule.group_id,group_name:schedule.group_name,event_type:'prayer_group',start_time:override.start_time||schedule.start_time,end_time:override.end_time||schedule.end_time,location:override.location??schedule.location,status:override.status||'scheduled',visibility:'community'});
    }
  }
  const ownId = getLinkedBrother(user.id);
  if (isCoordinator(user) || user?.brother_permissions?.includes('brothers:followups:read') || ownId) {
    const rows = isCoordinator(user)
      ? db.prepare(`SELECT f.id,f.brother_id,f.responsible_user_id,f.occurred_on,f.start_time,f.end_time,f.location,f.status,b.full_name FROM brother_followups f JOIN brothers b ON b.id=f.brother_id WHERE f.occurred_on BETWEEN ? AND ? AND f.status='scheduled'`).all(from, to)
      : db.prepare(`SELECT f.id,f.brother_id,f.responsible_user_id,f.occurred_on,f.start_time,f.end_time,f.location,f.status,b.full_name FROM brother_followups f JOIN brothers b ON b.id=f.brother_id LEFT JOIN pastoral_assignments a ON a.sheep_brother_id=f.brother_id AND a.ended_on IS NULL WHERE f.occurred_on BETWEEN ? AND ? AND f.status='scheduled' AND (f.brother_id=? OR f.responsible_user_id=? OR a.pastor_brother_id=?)`).all(from, to, ownId, user.id, ownId);
    for (const row of rows) output.push({ id: `followup-${row.id}`, occurrence_date: row.occurred_on, title: row.brother_id === ownId && !isCoordinator(user) ? 'Acompanhamento pastoral' : `Acompanhamento: ${row.full_name}`,
      event_type: 'pastoral_appointment', start_time: row.start_time, end_time: row.end_time, location: row.location, status: row.status, visibility: 'private' });
  }
  return output.sort((a, b) => a.occurrence_date.localeCompare(b.occurrence_date) || String(a.start_time || '').localeCompare(String(b.start_time || '')));
}

function getCommunityOverview(user) {
  const canReadBrothers=hasBrotherPermission(user,'brothers:read');
  const canReadGroups=hasBrotherPermission(user,'brothers:groups:manage')||canReadBrothers;
  const canReadServices=hasBrotherPermission(user,'brothers:ministries:manage')||canReadBrothers;
  const canReadPastoral=canReadBrothers||hasBrotherPermission(user,'brothers:pastoral:coordinate')||hasBrotherPermission(user,'brothers:pastoral:manage');
  const canReadCalendar=hasBrotherPermission(user,'brothers:calendar:read')||hasBrotherPermission(user,'brothers:calendar:manage')||hasBrotherPermission(user,'brothers:followups:read')||hasBrotherPermission(user,'brothers:followups:create')||hasBrotherPermission(user,'brothers:self:access');
  const brotherCount=canReadBrothers?db.prepare("SELECT COUNT(*) AS count FROM brothers WHERE status='active'").get().count:null;
  const services=canReadServices?db.prepare(`SELECT m.id,m.name,m.active,(SELECT COUNT(*) FROM brother_ministry_memberships x WHERE x.ministry_id=m.id AND x.ended_on IS NULL) AS member_count,(SELECT COUNT(*) FROM ministry_structure_nodes n WHERE n.ministry_id=m.id AND n.active=1) AS structure_count FROM ministries m WHERE m.active=1 ORDER BY m.name COLLATE NOCASE`).all():[];
  const groupStats=canReadGroups?db.prepare(`SELECT COUNT(*) AS groups_count,COALESCE(SUM(member_count),0) AS linked_members FROM (SELECT g.id,COUNT(x.id) AS member_count FROM prayer_groups g LEFT JOIN brother_group_memberships x ON x.group_id=g.id AND x.ended_on IS NULL WHERE g.active=1 GROUP BY g.id)`).get():null;
  const groups=canReadGroups?db.prepare(`SELECT g.id,g.name,g.habitual_day_of_week,g.habitual_start_time,(SELECT COUNT(*) FROM brother_group_memberships x WHERE x.group_id=g.id AND x.ended_on IS NULL) AS member_count FROM prayer_groups g WHERE g.active=1 ORDER BY g.name COLLATE NOCASE`).all():[];
  const pastoralTotals=canReadPastoral?{pastors:db.prepare("SELECT COUNT(*) AS count FROM brother_pastoral_roles WHERE role='pastor' AND ended_on IS NULL").get().count,sheep:db.prepare("SELECT COUNT(*) AS count FROM pastoral_assignments a JOIN brother_pastoral_roles r ON r.brother_id=a.sheep_brother_id AND r.role='sheep' AND r.ended_on IS NULL WHERE a.ended_on IS NULL").get().count}:null;
  const from=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const upcoming=canReadCalendar?listCalendar(user,from,addDays(from,30)).slice(0,8):[];
  const activities=canReadServices||canReadGroups?db.prepare(`SELECT summary,created_at,action FROM (
    SELECT summary,created_at,action FROM ministry_history
    UNION ALL SELECT summary,created_at,action FROM prayer_group_history
  ) ORDER BY created_at DESC LIMIT 8`).all():[];
  return {totals:{brothers:brotherCount,services:canReadServices?services.length:null,groups:groupStats?.groups_count??null,group_members:groupStats?.linked_members??null,pastors:pastoralTotals?.pastors??null,sheep:pastoralTotals?.sheep??null},services,groups,upcoming,recent_activities:activities};
}

function getPastoralHome(user) {
  const brotherId=getLinkedBrother(user.id);
  const role=brotherId?db.prepare('SELECT role FROM brother_pastoral_roles WHERE brother_id=? AND ended_on IS NULL').get(brotherId)?.role:null;
  const from=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const through=addDays(from,45);
  const canViewCalendar=['brothers:calendar:read','brothers:calendar:manage','brothers:followups:read','brothers:followups:create','brothers:self:access'].some((permission)=>hasBrotherPermission(user,permission));
  const events=canViewCalendar?listCalendar(user,from,through):[];
  const sheep=role==='pastor'?listAssignedSheep(user):[];
  const sheepIds=sheep.map((item)=>item.id);
  const completed=sheepIds.length?db.prepare(`SELECT f.id,f.brother_id,b.full_name,b.preferred_name,f.occurred_on FROM brother_followups f JOIN brothers b ON b.id=f.brother_id WHERE f.brother_id IN (${sheepIds.map(()=>'?').join(',')}) AND f.status='completed' ORDER BY f.occurred_on DESC LIMIT 8`).all(...sheepIds):[];
  const groupIds=brotherId?db.prepare(`SELECT DISTINCT g.id FROM prayer_groups g LEFT JOIN brother_group_memberships m ON m.group_id=g.id AND m.ended_on IS NULL LEFT JOIN prayer_group_pastors p ON p.group_id=g.id AND p.ended_on IS NULL WHERE g.responsible_brother_id=? OR m.brother_id=? OR p.brother_id=?`).all(brotherId,brotherId,brotherId).map((item)=>item.id):[];
  const groups=groupIds.length?db.prepare(`SELECT g.id,g.name,g.habitual_day_of_week,g.habitual_start_time,g.location FROM prayer_groups g WHERE g.id IN (${groupIds.map(()=>'?').join(',')}) AND g.active=1 ORDER BY g.name COLLATE NOCASE`).all(...groupIds):[];
  const upcomingAppointments=role==='pastor'&&sheepIds.length?db.prepare(`SELECT f.id,f.brother_id,b.full_name,b.preferred_name,f.occurred_on,f.start_time,f.end_time,f.status,f.location FROM brother_followups f JOIN brothers b ON b.id=f.brother_id WHERE f.brother_id IN (${sheepIds.map(()=>'?').join(',')}) AND f.status='scheduled' AND f.occurred_on>=? ORDER BY f.occurred_on,f.start_time LIMIT 20`).all(...sheepIds,from):[];
  const ownAppointments=role==='sheep'&&brotherId?db.prepare(`SELECT id,occurred_on,start_time,end_time,status,location FROM brother_followups WHERE brother_id=? AND status='scheduled' AND occurred_on>=? ORDER BY occurred_on,start_time LIMIT 20`).all(brotherId,from):[];
  return {role,profile:brotherId?db.prepare('SELECT id,full_name,preferred_name FROM brothers WHERE id=?').get(brotherId):null,sheep,upcoming_appointments:upcomingAppointments,completed_followups:completed,groups,community_events:events.filter((item)=>item.event_type!=='pastoral_appointment'&&item.visibility!=='private'),personal_events:events.filter((item)=>item.visibility==='private'&&Number(item.responsible_user_id)===Number(user.id)),own_appointments:ownAppointments};
}

function saveEvent(id, payload, actor) {
  if (payload.event_type === 'pastoral_meeting' && payload.visibility === 'community') throw failure(400, 'Reunioes pastorais nao podem ser publicadas no calendario comunitario.');
  if (payload.end_time && payload.start_time && payload.end_time <= payload.start_time) throw failure(400, 'O termino deve ser posterior ao inicio.');
  if(payload.ministry_id&&!db.prepare('SELECT id FROM ministries WHERE id=? AND active=1').get(payload.ministry_id)) throw failure(404,'Servico ativo nao encontrado.');
  if(payload.group_id&&!db.prepare('SELECT id FROM prayer_groups WHERE id=? AND active=1').get(payload.group_id)) throw failure(404,'Grupo ativo nao encontrado.');
  const fields = ['title','description','event_type','event_date','start_time','end_time','location','responsible_user_id','visibility','status','recurrence_interval','recurrence_until','ministry_id','group_id'];
  const params = fields.map((field) => payload[field] ?? null);
  const participantIds=payload.participant_ids || [];
  if(new Set(participantIds).size!==participantIds.length) throw failure(400,'Participantes duplicados.');
  if(participantIds.length){
    const validIds=new Set(db.prepare(`SELECT id FROM brothers WHERE status='active' AND id IN (${participantIds.map(()=>'?').join(',')})`).all(...participantIds).map((row)=>Number(row.id)));
    if(validIds.size!==participantIds.length) throw failure(400,'Todos os participantes devem ser irmaos ativos.');
  }
  if (!isCoordinator(actor) && payload.responsible_user_id && Number(payload.responsible_user_id) !== Number(actor.id)) throw failure(403, 'Somente a coordenacao pode atribuir eventos a outra pessoa.');
  if (!payload.responsible_user_id) params[7] = actor.id;
  if (!payload.recurrence_interval) params[10] = 0;
  if (id) {
    const current = db.prepare('SELECT * FROM community_events WHERE id=?').get(id);
    if (!current) throw failure(404, 'Evento nao encontrado.');
    if (Number(current.responsible_user_id) !== Number(actor.id) && !isCoordinator(actor)) throw failure(403, 'Voce so pode editar seus proprios eventos.');
    db.prepare(`UPDATE community_events SET ${fields.map((field) => `${field}=?`).join(',')},updated_by=?,updated_at=datetime('now','-3 hours') WHERE id=?`).run(...params, actor.id, id);
  } else {
    const result = db.prepare(`INSERT INTO community_events (${fields.join(',')},created_by,updated_by) VALUES (${fields.map(() => '?').join(',')},?,?)`).run(...params, actor.id, actor.id);
    id = Number(result.lastInsertRowid);
  }
  if (payload.participant_ids) {
    db.transaction(()=>{
      db.prepare('DELETE FROM community_event_participants WHERE event_id=?').run(id);
      const insert=db.prepare('INSERT INTO community_event_participants (event_id,brother_id) VALUES (?,?)');
      payload.participant_ids.forEach((brotherId)=>insert.run(id,brotherId));
    })();
  }
  return db.prepare('SELECT id,title,description,event_type,event_date,start_time,end_time,location,responsible_user_id,visibility,status,recurrence_interval,recurrence_until,ministry_id,group_id FROM community_events WHERE id=?').get(id);
}

function setEventOccurrence(eventId, date, payload, actor) {
  const event = db.prepare('SELECT id,responsible_user_id,event_date,recurrence_interval,recurrence_until FROM community_events WHERE id=?').get(eventId);
  if (!event) throw failure(404, 'Evento nao encontrado.');
  if(Number(event.responsible_user_id)!==Number(actor.id) && !isCoordinator(actor)) throw failure(403,'Voce so pode alterar seus proprios eventos.');
  if(!isOccurrenceDate(event.event_date,event.recurrence_interval,event.recurrence_until,date)) throw failure(400,'A data nao corresponde a uma ocorrencia desta serie.');
  if(payload.start_time && payload.end_time && payload.end_time<=payload.start_time) throw failure(400,'O termino deve ser posterior ao inicio.');
  db.prepare(`INSERT INTO community_event_occurrences (event_id,event_date,status,title,description,start_time,end_time,location,moved_to_date) VALUES (?,?,?,?,?,?,?,?,?)
    ON CONFLICT(event_id,event_date) DO UPDATE SET status=excluded.status,title=excluded.title,description=excluded.description,start_time=excluded.start_time,end_time=excluded.end_time,location=excluded.location,moved_to_date=excluded.moved_to_date`)
    .run(eventId, date, payload.status || 'scheduled', payload.title ?? null, payload.description ?? null, payload.start_time ?? null, payload.end_time ?? null, payload.location ?? null,payload.moved_to_date??null);
  return { event_id: eventId, event_date: date, ...payload };
}

function saveGroupSchedule(id, groupId, payload, actor) {
  if (!db.prepare('SELECT id FROM prayer_groups WHERE id=? AND active=1').get(groupId)) throw failure(404, 'Grupo ativo nao encontrado.');
  if (payload.end_time <= payload.start_time) throw failure(400, 'O termino deve ser posterior ao inicio.');
  if (id) {
    const result = db.prepare('UPDATE prayer_group_schedules SET day_of_week=?,start_time=?,end_time=?,location=?,starts_on=?,ends_on=?,interval_weeks=?,active=? WHERE id=? AND group_id=?')
      .run(payload.day_of_week,payload.start_time,payload.end_time,payload.location ?? null,payload.starts_on,payload.ends_on ?? null,payload.interval_weeks ?? 1,payload.active === false ? 0 : 1,id,groupId);
    if (!result.changes) throw failure(404, 'Recorrencia nao encontrada.');
  } else {
    const result = db.prepare('INSERT INTO prayer_group_schedules (group_id,day_of_week,start_time,end_time,location,starts_on,ends_on,interval_weeks,created_by) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(groupId,payload.day_of_week,payload.start_time,payload.end_time,payload.location ?? null,payload.starts_on,payload.ends_on ?? null,payload.interval_weeks ?? 1,actor.id);
    id = Number(result.lastInsertRowid);
  }
  return db.prepare('SELECT * FROM prayer_group_schedules WHERE id=?').get(id);
}

function setGroupOccurrence(scheduleId, date, payload) {
  const schedule = db.prepare('SELECT id,day_of_week,starts_on,ends_on,interval_weeks FROM prayer_group_schedules WHERE id=?').get(scheduleId);
  if (!schedule) throw failure(404, 'Recorrencia nao encontrada.');
  const timestamp=Date.parse(`${date}T12:00:00Z`);
  const startTimestamp=Date.parse(`${schedule.starts_on}T12:00:00Z`);
  const elapsedWeeks=Math.floor((timestamp-startTimestamp)/(7*86400000));
  if(date<schedule.starts_on||(schedule.ends_on&&date>schedule.ends_on)||new Date(timestamp).getUTCDay()!==schedule.day_of_week||elapsedWeeks%schedule.interval_weeks!==0) throw failure(400,'A data nao corresponde a uma ocorrencia desta recorrencia.');
  if(payload.start_time && payload.end_time && payload.end_time<=payload.start_time) throw failure(400,'O termino deve ser posterior ao inicio.');
  db.prepare(`INSERT INTO prayer_group_occurrences (schedule_id,event_date,status,start_time,end_time,location,moved_to_date) VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(schedule_id,event_date) DO UPDATE SET status=excluded.status,start_time=excluded.start_time,end_time=excluded.end_time,location=excluded.location,moved_to_date=excluded.moved_to_date`)
    .run(scheduleId,date,payload.status || 'scheduled',payload.start_time ?? null,payload.end_time ?? null,payload.location ?? null,payload.moved_to_date??null);
  return { schedule_id:scheduleId,event_date:date,...payload };
}

module.exports = { assignRole, assignSheep, endAssignment, endCoordinatorLink, getCommunityOverview, getLinkedBrother, getOwnProfile, getPastoralHome, getSheepProfile, isCoordinator, linkPastorToCoordinator, listAppointments, listAssignedSheep, listCalendar, mayManageFollowup, pastoralTree, saveAppointment, saveEvent, saveGroupSchedule, setEventOccurrence, setGroupOccurrence, updateAppointment };
