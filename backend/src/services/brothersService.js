const { db } = require('../db');
const { brazilDate } = require('../utils/time');

function notFound(message = 'Cadastro nao encontrado.') {
  return Object.assign(new Error(message), { status: 404 });
}

function conflict(message) {
  return Object.assign(new Error(message), { status: 409 });
}

function dateToday() {
  return brazilDate();
}

function timeAfter(value, minutes) {
  const [hour, minute] = value.split(':').map(Number);
  const total = (hour * 60 + minute + minutes) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2,'0')}:${String(total % 60).padStart(2,'0')}`;
}

function writeHistory(brotherId, actorUserId, eventType, summary, details = null) {
  db.prepare(`
    INSERT INTO brother_history (brother_id, actor_user_id, event_type, summary, details)
    VALUES (?, ?, ?, ?, ?)
  `).run(brotherId, actorUserId, eventType, summary, details ? JSON.stringify(details) : null);
}

function writeAudit(req, action, brotherId, summary, metadata = null) {
  const { recordAudit } = require('./auditService');
  recordAudit({
    req, strict: true, action, entityType: 'brother', entityId: brotherId,
    summary, metadata
  });
}

function listBrothers({ q = '', groupId = '', ministryId = '', status = '', page = 1, pageSize = 25 } = {}) {
  const where = [];
  const params = [];
  if (q.trim()) {
    where.push('(b.full_name LIKE ? COLLATE NOCASE OR b.preferred_name LIKE ? COLLATE NOCASE)');
    params.push(`%${q.trim()}%`, `%${q.trim()}%`);
  }
  if (status) { where.push('b.status = ?'); params.push(status); }
  if (groupId) {
    where.push('EXISTS (SELECT 1 FROM brother_group_memberships bgm WHERE bgm.brother_id = b.id AND bgm.group_id = ? AND bgm.ended_on IS NULL)');
    params.push(groupId);
  }
  if (ministryId) {
    where.push('EXISTS (SELECT 1 FROM brother_ministry_memberships bmm WHERE bmm.brother_id = b.id AND bmm.ministry_id = ? AND bmm.ended_on IS NULL)');
    params.push(ministryId);
  }
  const filterSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) AS total FROM brothers b ${filterSql}`).get(...params).total;
  const normalizedPage = Math.max(Number(page) || 1, 1);
  const normalizedPageSize = Math.min(Math.max(Number(pageSize) || 25, 1), 100);
  const items = db.prepare(`
    SELECT b.id, b.full_name, b.preferred_name, b.status
    FROM brothers b ${filterSql}
    ORDER BY b.full_name COLLATE NOCASE ASC, b.id ASC
    LIMIT ? OFFSET ?
  `).all(...params, normalizedPageSize, (normalizedPage - 1) * normalizedPageSize);
  return { items, pagination: { page: normalizedPage, page_size: normalizedPageSize, total, total_pages: Math.ceil(total / normalizedPageSize) } };
}

function getBrother(brotherId) {
  const brother = db.prepare('SELECT * FROM brothers WHERE id = ?').get(brotherId);
  if (!brother) throw notFound('Irmao nao encontrado.');
  const groups = db.prepare(`
    SELECT bgm.id AS membership_id, bgm.started_on, bgm.ended_on, pg.id, pg.name, pg.responsible_brother_id,
      rb.full_name AS responsible_name
    FROM brother_group_memberships bgm JOIN prayer_groups pg ON pg.id = bgm.group_id
    LEFT JOIN brothers rb ON rb.id = pg.responsible_brother_id
    WHERE bgm.brother_id = ? ORDER BY bgm.ended_on IS NULL DESC, bgm.started_on DESC
  `).all(brotherId);
  const ministries = db.prepare(`
    SELECT bmm.id AS membership_id, bmm.function_title, bmm.started_on, bmm.ended_on, m.id, m.name,
      m.responsible_brother_id, rb.full_name AS responsible_name
    FROM brother_ministry_memberships bmm JOIN ministries m ON m.id = bmm.ministry_id
    LEFT JOIN brothers rb ON rb.id = m.responsible_brother_id
    WHERE bmm.brother_id = ? ORDER BY bmm.ended_on IS NULL DESC, bmm.started_on DESC
  `).all(brotherId);
  const history = db.prepare(`
    SELECT h.id, h.event_type, h.summary, h.details, h.created_at, u.name AS actor_name
    FROM brother_history h LEFT JOIN users u ON u.id = h.actor_user_id
    WHERE h.brother_id = ? ORDER BY h.created_at DESC, h.id DESC
  `).all(brotherId).map((item) => ({ ...item, details: item.details ? JSON.parse(item.details) : null }));
  return { ...brother, groups, ministries, history };
}

const brotherFields = [
  'full_name', 'preferred_name', 'birth_date', 'phone', 'email', 'postal_code', 'address_street',
  'address_number', 'address_complement', 'district', 'city', 'state', 'community_joined_on', 'status', 'community_status'
];

function createBrother(payload, actor, req) {
  if (payload.birth_date) {
    const duplicate = db.prepare('SELECT id FROM brothers WHERE lower(full_name) = lower(?) AND birth_date = ?').get(payload.full_name, payload.birth_date);
    if (duplicate) throw conflict('Ja existe cadastro com este nome e data de nascimento.');
  }
  const created = db.transaction(() => {
    const fields = brotherFields.filter((field) => Object.hasOwn(payload, field));
    const insert = db.prepare(`INSERT INTO brothers (${fields.join(', ')}, created_by, updated_by) VALUES (${fields.map(() => '?').join(', ')}, ?, ?)`);
    const result = insert.run(...fields.map((field) => payload[field] ?? null), actor.id, actor.id);
    const brotherId = Number(result.lastInsertRowid);
    writeHistory(brotherId, actor.id, 'created', 'Cadastro criado.');
    writeAudit(req, 'brother.create', brotherId, 'Cadastro de irmao criado.');
    return brotherId;
  })();
  return getBrother(created);
}

function updateBrother(brotherId, payload, actor, req) {
  const current = db.prepare('SELECT * FROM brothers WHERE id = ?').get(brotherId);
  if (!current) throw notFound('Irmao nao encontrado.');
  const nextName = payload.full_name ?? current.full_name;
  const nextBirthDate = Object.hasOwn(payload, 'birth_date') ? payload.birth_date : current.birth_date;
  if (nextBirthDate) {
    const duplicate = db.prepare('SELECT id FROM brothers WHERE lower(full_name) = lower(?) AND birth_date = ? AND id != ?').get(nextName, nextBirthDate, brotherId);
    if (duplicate) throw conflict('Ja existe cadastro com este nome e data de nascimento.');
  }
  const fields = brotherFields.filter((field) => Object.hasOwn(payload, field));
  if (!fields.length) return getBrother(brotherId);
  const previousStatus = current.community_status;
  const previousRecordStatus = current.status;
  db.transaction(() => {
    db.prepare(`UPDATE brothers SET ${fields.map((field) => `${field} = ?`).join(', ')}, updated_by = ?, updated_at = datetime('now', '-3 hours') WHERE id = ?`)
      .run(...fields.map((field) => payload[field] ?? null), actor.id, brotherId);
    if (Object.hasOwn(payload, 'community_status') && payload.community_status !== previousStatus) {
      writeHistory(brotherId, actor.id, 'community_status.changed', 'Situacao na comunidade atualizada.', {
        previous: previousStatus, current: payload.community_status
      });
    }
    if (Object.hasOwn(payload, 'status') && payload.status !== previousRecordStatus) {
      writeHistory(brotherId, actor.id, 'registration_status.changed', 'Situacao cadastral atualizada.', {
        previous: previousRecordStatus, current: payload.status
      });
    }
    writeAudit(req, 'brother.update', brotherId, 'Cadastro de irmao atualizado.', { fields: fields.filter((field) => !['phone', 'email', 'postal_code', 'address_street', 'address_number', 'address_complement', 'district', 'city', 'state'].includes(field)) });
  })();
  return getBrother(brotherId);
}

function listGroups(filters = {}) {
  const clauses = [];
  const params = [];
  if (filters.responsible_brother_id) { clauses.push('g.responsible_brother_id = ?'); params.push(Number(filters.responsible_brother_id)); }
  if (filters.day_of_week !== '' && filters.day_of_week !== undefined) { clauses.push('g.habitual_day_of_week = ?'); params.push(Number(filters.day_of_week)); }
  if (filters.active !== '' && filters.active !== undefined) { clauses.push('g.active = ?'); params.push(filters.active === 'true' || filters.active === true ? 1 : 0); }
  if (filters.q?.trim()) { clauses.push('(g.name LIKE ? COLLATE NOCASE OR g.description LIKE ? COLLATE NOCASE)'); params.push(`%${filters.q.trim()}%`, `%${filters.q.trim()}%`); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return db.prepare(`SELECT g.id,g.name,g.description,g.responsible_brother_id,b.full_name AS responsible_name,g.active,
      g.habitual_day_of_week,g.habitual_start_time,g.location,g.starts_on,
      COALESCE((SELECT COUNT(*) FROM brother_group_memberships x WHERE x.group_id=g.id AND x.ended_on IS NULL),0) AS member_count
    FROM prayer_groups g LEFT JOIN brothers b ON b.id=g.responsible_brother_id
    ${where} ORDER BY g.name COLLATE NOCASE`).all(...params).map((row) => ({ ...row, active: Boolean(row.active) }));
}

function getPrayerGroup(groupId) {
  const group = listGroups().find((item) => item.id === Number(groupId));
  if (!group) throw notFound('Grupo de oracao nao encontrado.');
  const members = db.prepare(`SELECT x.id AS membership_id,x.brother_id,x.started_on,x.ended_on,b.full_name,b.preferred_name
    FROM brother_group_memberships x JOIN brothers b ON b.id=x.brother_id WHERE x.group_id=?
    ORDER BY x.ended_on IS NULL DESC,b.full_name COLLATE NOCASE`).all(groupId);
  const pastors = db.prepare(`SELECT x.id AS link_id,x.brother_id,x.started_on,x.ended_on,b.full_name,b.preferred_name
    FROM prayer_group_pastors x JOIN brothers b ON b.id=x.brother_id WHERE x.group_id=?
    ORDER BY x.ended_on IS NULL DESC,b.full_name COLLATE NOCASE`).all(groupId);
  const history = db.prepare('SELECT id,action,summary,details,created_at FROM prayer_group_history WHERE group_id=? ORDER BY id DESC LIMIT 100').all(groupId);
  const schedules = db.prepare('SELECT * FROM prayer_group_schedules WHERE group_id=? ORDER BY active DESC,starts_on DESC').all(groupId);
  return { ...group, members, pastors, history, schedules };
}

function listBrotherPeople() {
  return db.prepare("SELECT id, full_name, preferred_name FROM brothers WHERE status = 'active' ORDER BY full_name COLLATE NOCASE LIMIT 500")
    .all();
}

function saveGroup(id, payload, actor, req) {
  const duplicate = db.prepare('SELECT id FROM prayer_groups WHERE lower(name) = lower(?) AND id != ?').get(payload.name, id || 0);
  if (duplicate) throw conflict('Ja existe um grupo de oracao com este nome.');
  if (payload.responsible_brother_id && !db.prepare("SELECT id FROM brothers WHERE id = ? AND status = 'active'").get(payload.responsible_brother_id)) {
    throw notFound('Responsavel ativo nao encontrado.');
  }
  if (payload.habitual_day_of_week !== undefined && payload.habitual_day_of_week !== null && (payload.habitual_day_of_week < 0 || payload.habitual_day_of_week > 6)) throw Object.assign(new Error('Dia da semana invalido.'),{status:400});
  const result = db.transaction(() => {
    let groupId = id;
    const previous = id ? db.prepare('SELECT * FROM prayer_groups WHERE id = ?').get(id) : null;
    if (id) {
      if (!db.prepare('SELECT id FROM prayer_groups WHERE id = ?').get(id)) throw notFound('Grupo de oracao nao encontrado.');
      db.prepare(`UPDATE prayer_groups SET name=?,description=?,responsible_brother_id=?,active=?,habitual_day_of_week=?,habitual_start_time=?,location=?,starts_on=?,updated_at=datetime('now','-3 hours') WHERE id=?`)
        .run(payload.name,payload.description??null,payload.responsible_brother_id??null,payload.active?1:0,payload.habitual_day_of_week??null,payload.habitual_start_time??null,payload.location??null,payload.starts_on??null,id);
    } else {
      groupId = Number(db.prepare(`INSERT INTO prayer_groups (name,description,responsible_brother_id,active,created_by,habitual_day_of_week,habitual_start_time,location,starts_on)
        VALUES (?,?,?,?,?,?,?,?,?)`).run(payload.name,payload.description??null,payload.responsible_brother_id??null,payload.active?1:0,actor.id,payload.habitual_day_of_week??null,payload.habitual_start_time??null,payload.location??null,payload.starts_on??dateToday()).lastInsertRowid);
    }
    if (previous?.responsible_brother_id && previous.responsible_brother_id !== payload.responsible_brother_id) {
      writeHistory(previous.responsible_brother_id, actor.id, 'group.responsibility.ended', 'Responsabilidade em grupo de oracao encerrada.', { group_id: groupId });
    }
    if (payload.responsible_brother_id && previous?.responsible_brother_id !== payload.responsible_brother_id) {
      writeHistory(payload.responsible_brother_id, actor.id, 'group.responsibility.started', 'Responsabilidade em grupo de oracao iniciada.', { group_id: groupId });
    }
    if (Object.hasOwn(payload,'habitual_day_of_week')) {
      const schedule=db.prepare('SELECT id FROM prayer_group_schedules WHERE group_id=? AND group_profile_schedule=1 ORDER BY id LIMIT 1').get(groupId);
      if(payload.habitual_day_of_week!==undefined&&payload.habitual_day_of_week!==null&&payload.habitual_start_time&&payload.starts_on){
        const scheduleData=[payload.habitual_day_of_week,payload.habitual_start_time,timeAfter(payload.habitual_start_time,60),payload.location??null,payload.starts_on,payload.active?1:0];
        if(schedule) db.prepare('UPDATE prayer_group_schedules SET day_of_week=?,start_time=?,end_time=?,location=?,starts_on=?,ends_on=NULL,interval_weeks=1,active=? WHERE id=?').run(...scheduleData,schedule.id);
        else db.prepare('INSERT INTO prayer_group_schedules (group_id,day_of_week,start_time,end_time,location,starts_on,interval_weeks,active,created_by,group_profile_schedule) VALUES (?,?,?,?,?,?,1,?,?,1)').run(groupId,...scheduleData.slice(0,5),scheduleData[5],actor.id);
      } else if(schedule) db.prepare('UPDATE prayer_group_schedules SET active=0 WHERE id=?').run(schedule.id);
    }
    db.prepare('INSERT INTO prayer_group_history (group_id,actor_user_id,action,summary,details) VALUES (?,?,?,?,?)')
      .run(groupId,actor.id,id?'updated':'created',id?'Dados do grupo atualizados.':'Grupo de oracao criado.',JSON.stringify({name:payload.name,active:payload.active}));
    writeAudit(req, id ? 'brother.group.update' : 'brother.group.create', groupId, id ? 'Grupo de oracao atualizado.' : 'Grupo de oracao criado.');
    return groupId;
  })();
  return getPrayerGroup(result);
}

function listMinistries() {
  return db.prepare(`SELECT m.id, m.name, m.description, m.responsible_brother_id, b.full_name AS responsible_name, m.active,
      (SELECT COUNT(*) FROM brother_ministry_memberships x WHERE x.ministry_id = m.id AND x.ended_on IS NULL) AS member_count,
      (SELECT COUNT(*) FROM ministry_structure_nodes n WHERE n.ministry_id=m.id AND n.active=1) AS structure_count
    FROM ministries m LEFT JOIN brothers b ON b.id = m.responsible_brother_id
    ORDER BY m.name COLLATE NOCASE`).all().map((row) => ({ ...row, active: Boolean(row.active) }));
}

function saveMinistry(id, payload, actor, req) {
  const duplicate = db.prepare('SELECT id FROM ministries WHERE lower(name) = lower(?) AND id != ?').get(payload.name, id || 0);
  if (duplicate) throw conflict('Ja existe um servico com este nome.');
  if (payload.responsible_brother_id && !db.prepare("SELECT id FROM brothers WHERE id = ? AND status = 'active'").get(payload.responsible_brother_id)) {
    throw notFound('Responsavel ativo nao encontrado.');
  }
  const result = db.transaction(() => {
    let ministryId = id;
    const previous = id ? db.prepare('SELECT responsible_brother_id FROM ministries WHERE id = ?').get(id) : null;
    if (id) {
      if (!db.prepare('SELECT id FROM ministries WHERE id = ?').get(id)) throw notFound('Servico nao encontrado.');
      db.prepare(`UPDATE ministries SET name = ?, description = ?, responsible_brother_id = ?, active = ?, updated_at = datetime('now', '-3 hours') WHERE id = ?`)
        .run(payload.name, payload.description ?? null, payload.responsible_brother_id ?? null, payload.active ? 1 : 0, id);
    } else {
      ministryId = Number(db.prepare('INSERT INTO ministries (name, description, responsible_brother_id, active, created_by) VALUES (?, ?, ?, ?, ?)')
        .run(payload.name, payload.description ?? null, payload.responsible_brother_id ?? null, payload.active ? 1 : 0, actor.id).lastInsertRowid);
    }
    if (previous?.responsible_brother_id && previous.responsible_brother_id !== payload.responsible_brother_id) {
      writeHistory(previous.responsible_brother_id, actor.id, 'ministry.responsibility.ended', 'Responsabilidade em servico encerrada.', { ministry_id: ministryId });
    }
    if (payload.responsible_brother_id && previous?.responsible_brother_id !== payload.responsible_brother_id) {
      writeHistory(payload.responsible_brother_id, actor.id, 'ministry.responsibility.started', 'Responsabilidade em servico iniciada.', { ministry_id: ministryId });
    }
    db.prepare('INSERT INTO ministry_history (ministry_id,actor_user_id,action,summary,details) VALUES (?,?,?,?,?)')
      .run(ministryId,actor.id,id?'updated':'created',id?'Dados do servico atualizados.':'Servico criado.',JSON.stringify({name:payload.name,active:payload.active}));
    writeAudit(req, id ? 'brother.ministry.update' : 'brother.ministry.create', ministryId, id ? 'Servico atualizado.' : 'Servico criado.');
    return ministryId;
  })();
  return listMinistries().find((ministry) => ministry.id === result);
}

function ministryStructure(ministryId) {
  const service = db.prepare('SELECT id,name,description,active,responsible_brother_id FROM ministries WHERE id=?').get(ministryId);
  if (!service) throw notFound('Servico ou ministerio nao encontrado.');
  const nodes = db.prepare(`SELECT n.*,b.full_name AS responsible_name,b.preferred_name AS responsible_preferred_name,
      (SELECT COUNT(*) FROM brother_ministry_memberships x WHERE x.structure_node_id=n.id AND x.ended_on IS NULL) AS member_count
    FROM ministry_structure_nodes n LEFT JOIN brothers b ON b.id=n.responsible_brother_id
    WHERE n.ministry_id=? ORDER BY n.name COLLATE NOCASE`).all(ministryId);
  const memberships = db.prepare(`SELECT x.id,x.structure_node_id,x.brother_id,x.function_title,x.started_on,b.full_name,b.preferred_name
    FROM brother_ministry_memberships x JOIN brothers b ON b.id=x.brother_id WHERE x.ministry_id=? AND x.ended_on IS NULL ORDER BY b.full_name COLLATE NOCASE`).all(ministryId);
  const history = db.prepare('SELECT id,action,summary,details,created_at FROM ministry_history WHERE ministry_id=? ORDER BY id DESC LIMIT 100').all(ministryId);
  const byParent = new Map();
  for (const node of nodes) {
    node.active = Boolean(node.active);
    node.members = memberships.filter((member) => member.structure_node_id === node.id);
    const key = node.parent_node_id ?? null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(node);
  }
  const build = (parentId = null, seen = new Set()) => (byParent.get(parentId) || []).map((node) => {
    if (seen.has(node.id)) return { ...node, children: [] };
    return { ...node, children: build(node.id, new Set([...seen,node.id])) };
  });
  const rootMembers=memberships.filter((member)=>!member.structure_node_id);
  return { ...service, root_members:rootMembers,nodes: build(), history };
}

function saveMinistryNode(ministryId, nodeId, payload, actor, req) {
  if (!db.prepare('SELECT id FROM ministries WHERE id=? AND active=1').get(ministryId)) throw notFound('Servico ativo nao encontrado.');
  if (payload.responsible_brother_id && !db.prepare("SELECT id FROM brothers WHERE id=? AND status='active'").get(payload.responsible_brother_id)) throw notFound('Responsavel ativo nao encontrado.');
  if (payload.parent_node_id) {
    const parent = db.prepare('SELECT id FROM ministry_structure_nodes WHERE id=? AND ministry_id=? AND active=1').get(payload.parent_node_id,ministryId);
    if (!parent) throw notFound('O nivel superior selecionado nao pertence a este servico.');
    if (Number(payload.parent_node_id) === Number(nodeId)) throw conflict('Um nivel nao pode ser pai de si mesmo.');
    if (nodeId) {
      const descendant = db.prepare(`WITH RECURSIVE tree(id) AS (SELECT id FROM ministry_structure_nodes WHERE parent_node_id=? UNION ALL SELECT n.id FROM ministry_structure_nodes n JOIN tree t ON n.parent_node_id=t.id) SELECT 1 FROM tree WHERE id=?`).get(nodeId,payload.parent_node_id);
      if (descendant) throw conflict('A estrutura nao pode conter ciclos.');
    }
  }
  let id=nodeId;
  db.transaction(()=>{
    const previous=nodeId?db.prepare('SELECT * FROM ministry_structure_nodes WHERE id=? AND ministry_id=?').get(nodeId,ministryId):null;
    if(nodeId&&!previous) throw notFound('Nivel da estrutura nao encontrado.');
    if(nodeId) db.prepare(`UPDATE ministry_structure_nodes SET parent_node_id=?,node_type=?,name=?,description=?,responsible_brother_id=?,active=?,updated_at=datetime('now','-3 hours') WHERE id=?`)
      .run(payload.parent_node_id??null,payload.node_type,payload.name,payload.description??null,payload.responsible_brother_id??null,payload.active?1:0,nodeId);
    else id=Number(db.prepare(`INSERT INTO ministry_structure_nodes (ministry_id,parent_node_id,node_type,name,description,responsible_brother_id,active,created_by) VALUES (?,?,?,?,?,?,?,?)`)
      .run(ministryId,payload.parent_node_id??null,payload.node_type,payload.name,payload.description??null,payload.responsible_brother_id??null,payload.active?1:0,actor.id).lastInsertRowid);
    db.prepare('INSERT INTO ministry_structure_history (node_id,actor_user_id,action,summary,details) VALUES (?,?,?,?,?)')
      .run(id,actor.id,nodeId?'updated':'created',nodeId?'Nivel da estrutura atualizado.':'Nivel da estrutura criado.',JSON.stringify({parent_node_id:payload.parent_node_id??null,node_type:payload.node_type,name:payload.name,active:payload.active}));
    db.prepare('INSERT INTO ministry_history (ministry_id,actor_user_id,action,summary,details) VALUES (?,?,?,?,?)')
      .run(ministryId,actor.id,'structure.changed','Estrutura do servico atualizada.',JSON.stringify({node_id:id}));
  })();
  writeAudit(req,nodeId?'brother.ministry.node.update':'brother.ministry.node.create',id,'Estrutura do servico atualizada.');
  return ministryStructure(ministryId);
}

function addMinistryNodeMember(ministryId,nodeId,brotherId,payload,actor,req) {
  const node=db.prepare('SELECT id,name FROM ministry_structure_nodes WHERE id=? AND ministry_id=? AND active=1').get(nodeId,ministryId);
  if(!node) throw notFound('Equipe ou coordenacao ativa nao encontrada.');
  if(!db.prepare("SELECT id FROM brothers WHERE id=? AND status='active'").get(brotherId)) throw notFound('Irmao ativo nao encontrado.');
  if(db.prepare('SELECT id FROM brother_ministry_memberships WHERE brother_id=? AND ministry_id=? AND ended_on IS NULL').get(brotherId,ministryId)) throw conflict('Este irmao ja possui um vinculo ativo neste servico.');
  const startedOn=payload.started_on||dateToday();
  const id=Number(db.prepare('INSERT INTO brother_ministry_memberships (brother_id,ministry_id,function_title,started_on,created_by,structure_node_id) VALUES (?,?,?,?,?,?)')
    .run(brotherId,ministryId,payload.function_title??null,startedOn,actor.id,nodeId).lastInsertRowid);
  writeHistory(brotherId,actor.id,'ministry.node.joined',`Vinculo iniciado: ${node.name}.`,{ministry_id:ministryId,node_id:nodeId,membership_id:id});
  db.prepare('INSERT INTO ministry_structure_history (node_id,actor_user_id,action,summary,details) VALUES (?,?,?,?,?)')
    .run(nodeId,actor.id,'member.added','Irmao vinculado a equipe ou coordenacao.',JSON.stringify({brother_id:brotherId,membership_id:id,started_on:startedOn}));
  db.prepare('INSERT INTO ministry_history (ministry_id,actor_user_id,action,summary,details) VALUES (?,?,?,?,?)')
    .run(ministryId,actor.id,'member.added','Irmao vinculado a equipe ou coordenacao.',JSON.stringify({node_id:nodeId,membership_id:id,started_on:startedOn}));
  writeAudit(req,'brother.ministry.node.member.add',brotherId,'Irmao vinculado a estrutura do servico.',{ministry_id:ministryId,node_id:nodeId});
  return {id,brother_id:brotherId,ministry_id:ministryId,structure_node_id:nodeId,started_on:startedOn};
}

function transferGroupMember(groupId,membershipId,payload,actor,req) {
  const current=db.prepare('SELECT * FROM brother_group_memberships WHERE id=? AND group_id=? AND ended_on IS NULL').get(membershipId,groupId);
  if(!current) throw notFound('Vinculo ativo nao encontrado.');
  const startedOn=payload.started_on||dateToday();
  if(startedOn<=current.started_on) throw Object.assign(new Error('A transferencia deve iniciar depois do vinculo atual.'),{status:400});
  const target=db.prepare('SELECT id,name FROM prayer_groups WHERE id=? AND active=1').get(payload.group_id);
  if(!target) throw notFound('Grupo de destino ativo nao encontrado.');
  if(Number(payload.group_id)===Number(groupId)) throw conflict('Selecione um grupo diferente para transferir o integrante.');
  if(db.prepare('SELECT id FROM brother_group_memberships WHERE brother_id=? AND group_id=? AND ended_on IS NULL').get(current.brother_id,payload.group_id)) throw conflict('O irmao ja possui vinculo ativo com o grupo de destino.');
  const result=db.transaction(()=>{
    db.prepare('UPDATE brother_group_memberships SET ended_on=? WHERE id=?').run(addDate(startedOn,-1),membershipId);
    const newId=Number(db.prepare('INSERT INTO brother_group_memberships (brother_id,group_id,started_on,created_by) VALUES (?,?,?,?)').run(current.brother_id,payload.group_id,startedOn,actor.id).lastInsertRowid);
    writeHistory(current.brother_id,actor.id,'group.transferred','Integrante transferido entre grupos de oracao.',{from_group_id:groupId,to_group_id:payload.group_id,started_on:startedOn,previous_membership_id:membershipId,membership_id:newId});
    for(const [id,name] of [[groupId,'Grupo de origem'],[payload.group_id,target.name]]) db.prepare('INSERT INTO prayer_group_history (group_id,actor_user_id,action,summary,details) VALUES (?,?,?,?,?)').run(id,actor.id,'member.transferred','Transferencia de integrante registrada.',JSON.stringify({brother_id:current.brother_id,from_group_id:groupId,to_group_id:payload.group_id,started_on:startedOn}));
    return newId;
  })();
  writeAudit(req,'brother.group.membership.transfer',current.brother_id,'Integrante transferido entre grupos.',{from_group_id:groupId,to_group_id:payload.group_id});
  return {id:result,brother_id:current.brother_id,from_group_id:groupId,to_group_id:Number(payload.group_id),ended_on:addDate(startedOn,-1),started_on:startedOn};
}

function addDate(date,days) { const value=new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate()+days); return value.toISOString().slice(0,10); }

function saveGroupPastor(groupId,brotherId,startedOn,actor,req) {
  if(!db.prepare('SELECT id FROM prayer_groups WHERE id=? AND active=1').get(groupId)) throw notFound('Grupo ativo nao encontrado.');
  if(!db.prepare("SELECT 1 FROM brother_pastoral_roles WHERE brother_id=? AND role='pastor' AND ended_on IS NULL").get(brotherId)) throw Object.assign(new Error('O irmao precisa ter papel pastoral de pastor ativo.'),{status:400});
  if(db.prepare('SELECT id FROM prayer_group_pastors WHERE group_id=? AND brother_id=? AND ended_on IS NULL').get(groupId,brotherId)) throw conflict('Este pastor ja esta vinculado ao grupo.');
  const id=Number(db.prepare('INSERT INTO prayer_group_pastors (group_id,brother_id,started_on,created_by) VALUES (?,?,?,?)').run(groupId,brotherId,startedOn,actor.id).lastInsertRowid);
  db.prepare('INSERT INTO prayer_group_history (group_id,actor_user_id,action,summary,details) VALUES (?,?,?,?,?)').run(groupId,actor.id,'pastor.added','Pastor vinculado ao grupo.',JSON.stringify({brother_id:brotherId,started_on:startedOn}));
  writeAudit(req,'brother.group.pastor.add',brotherId,'Pastor vinculado ao grupo.',{group_id:groupId});
  return {id,group_id:groupId,brother_id:brotherId,started_on:startedOn};
}

function endGroupPastor(groupId,linkId,endedOn,actor,req) {
  const link=db.prepare('SELECT * FROM prayer_group_pastors WHERE id=? AND group_id=? AND ended_on IS NULL').get(linkId,groupId);
  if(!link) throw notFound('Vinculo pastoral ativo nao encontrado.');
  if(endedOn<link.started_on) throw Object.assign(new Error('A data final deve ser posterior a data inicial.'),{status:400});
  db.prepare('UPDATE prayer_group_pastors SET ended_on=? WHERE id=?').run(endedOn,linkId);
  db.prepare('INSERT INTO prayer_group_history (group_id,actor_user_id,action,summary,details) VALUES (?,?,?,?,?)').run(groupId,actor.id,'pastor.ended','Vinculo pastoral do grupo encerrado.',JSON.stringify({brother_id:link.brother_id,ended_on:endedOn}));
  writeAudit(req,'brother.group.pastor.end',link.brother_id,'Vinculo pastoral do grupo encerrado.',{group_id:groupId,ended_on:endedOn});
  return {...link,ended_on:endedOn};
}

function addMembership(type, brotherId, payload, actor, req) {
  const isGroup = type === 'group';
  const table = isGroup ? 'brother_group_memberships' : 'brother_ministry_memberships';
  const parentTable = isGroup ? 'prayer_groups' : 'ministries';
  const parentId = isGroup ? payload.group_id : payload.ministry_id;
  const parentName = db.prepare(`SELECT name FROM ${parentTable} WHERE id = ? AND active = 1`).get(parentId);
  if (!db.prepare('SELECT id FROM brothers WHERE id = ? AND status = \'active\'').get(brotherId)) throw notFound('Irmao ativo nao encontrado.');
  if (!parentName) throw notFound(isGroup ? 'Grupo ativo nao encontrado.' : 'Servico ativo nao encontrado.');
  if (db.prepare(`SELECT id FROM ${table} WHERE brother_id = ? AND ${isGroup ? 'group_id' : 'ministry_id'} = ? AND ended_on IS NULL`).get(brotherId, parentId)) {
    throw conflict('Este vinculo ja esta ativo.');
  }
  const membershipId = db.transaction(() => {
    const fields = isGroup ? ['brother_id', 'group_id', 'started_on', 'created_by'] : ['brother_id', 'ministry_id', 'function_title', 'started_on', 'created_by'];
    const values = isGroup
      ? [brotherId, parentId, payload.started_on || dateToday(), actor.id]
      : [brotherId, parentId, payload.function_title ?? null, payload.started_on || dateToday(), actor.id];
    const result = Number(db.prepare(`INSERT INTO ${table} (${fields.join(', ')}) VALUES (${fields.map(() => '?').join(', ')})`).run(...values).lastInsertRowid);
    writeHistory(brotherId, actor.id, `${type}.joined`, `Vinculo iniciado: ${parentName.name}.`, { [isGroup ? 'group_id' : 'ministry_id']: parentId, membership_id: result });
    if(isGroup) db.prepare('INSERT INTO prayer_group_history (group_id,actor_user_id,action,summary,details) VALUES (?,?,?,?,?)').run(parentId,actor.id,'member.added','Integrante vinculado ao grupo.',JSON.stringify({brother_id:brotherId,membership_id:result,started_on:payload.started_on||dateToday()}));
    else db.prepare('INSERT INTO ministry_history (ministry_id,actor_user_id,action,summary,details) VALUES (?,?,?,?,?)').run(parentId,actor.id,'member.added','Irmao vinculado ao servico.',JSON.stringify({brother_id:brotherId,membership_id:result,started_on:payload.started_on||dateToday()}));
    writeAudit(req, `brother.${type}.membership.create`, brotherId, `Vinculo comunitario iniciado.`, { [isGroup ? 'group_id' : 'ministry_id']: parentId });
    return result;
  })();
  return db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(membershipId);
}

function endMembership(type, brotherId, membershipId, endedOn, actor, req) {
  const isGroup = type === 'group';
  const table = isGroup ? 'brother_group_memberships' : 'brother_ministry_memberships';
  const parentTable = isGroup ? 'prayer_groups' : 'ministries';
  const foreignKey = isGroup ? 'group_id' : 'ministry_id';
  const relation = db.prepare(`SELECT membership.*, parent.name FROM ${table} membership JOIN ${parentTable} parent ON parent.id = membership.${foreignKey} WHERE membership.id = ? AND membership.brother_id = ? AND membership.ended_on IS NULL`).get(membershipId, brotherId);
  if (!relation) throw notFound('Vinculo ativo nao encontrado.');
  if (endedOn < relation.started_on) throw Object.assign(new Error('A data final deve ser posterior a data inicial.'), { status: 400 });
  db.transaction(() => {
    db.prepare(`UPDATE ${table} SET ended_on = ? WHERE id = ?`).run(endedOn, membershipId);
    writeHistory(brotherId, actor.id, `${type}.left`, `Vinculo encerrado: ${relation.name}.`, { [foreignKey]: relation[foreignKey], ended_on: endedOn });
    if(isGroup) db.prepare('INSERT INTO prayer_group_history (group_id,actor_user_id,action,summary,details) VALUES (?,?,?,?,?)').run(relation[foreignKey],actor.id,'member.ended','Vinculo de integrante encerrado.',JSON.stringify({brother_id:brotherId,membership_id:membershipId,ended_on:endedOn}));
    else db.prepare('INSERT INTO ministry_history (ministry_id,actor_user_id,action,summary,details) VALUES (?,?,?,?,?)').run(relation[foreignKey],actor.id,'member.ended','Vinculo de irmao encerrado.',JSON.stringify({brother_id:brotherId,membership_id:membershipId,ended_on:endedOn}));
    writeAudit(req, `brother.${type}.membership.end`, brotherId, 'Vinculo comunitario encerrado.', { [foreignKey]: relation[foreignKey] });
  })();
  return { ...relation, ended_on: endedOn };
}

function listFollowups(brotherId) {
  if (!db.prepare('SELECT id FROM brothers WHERE id = ?').get(brotherId)) throw notFound('Irmao nao encontrado.');
  return db.prepare(`SELECT f.id, f.brother_id, f.occurred_on, f.responsible_user_id, u.name AS responsible_name,
      f.category, f.notes, f.next_on, f.status, f.start_time, f.end_time, f.location, f.created_at, f.updated_at
    FROM brother_followups f JOIN users u ON u.id = f.responsible_user_id
    WHERE f.brother_id = ? ORDER BY f.occurred_on DESC, f.id DESC`).all(brotherId);
}

function saveFollowup(id, brotherId, payload, actor, req) {
  const old = id ? db.prepare('SELECT * FROM brother_followups WHERE id = ? AND brother_id = ?').get(id, brotherId) : null;
  if (id && !old) throw notFound('Acompanhamento nao encontrado.');
  if (!db.prepare('SELECT id FROM brothers WHERE id = ?').get(brotherId)) throw notFound('Irmao nao encontrado.');
  const responsibleId = payload.responsible_user_id || old?.responsible_user_id || actor.id;
  if (!db.prepare('SELECT id FROM users WHERE id = ? AND active = 1').get(responsibleId)) throw notFound('Responsavel ativo nao encontrado.');
  const result = db.transaction(() => {
    let followupId = id;
    if (id) {
      db.prepare(`INSERT INTO brother_followup_history (followup_id,actor_user_id,change_type,previous_occurred_on,occurred_on,previous_start_time,start_time,previous_end_time,end_time,previous_status,status)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(id,actor.id,payload.status==='cancelled'?'cancelled':payload.occurred_on!==old.occurred_on?'rescheduled':'updated',old.occurred_on,payload.occurred_on,old.start_time,payload.start_time??null,old.end_time,payload.end_time??null,old.status,payload.status);
      db.prepare(`UPDATE brother_followups SET occurred_on = ?, responsible_user_id = ?, category = ?, notes = ?, next_on = ?, status = ?, start_time = ?, end_time = ?, location = ?, updated_by = ?, updated_at = datetime('now', '-3 hours') WHERE id = ?`)
        .run(payload.occurred_on, responsibleId, payload.category, payload.notes, payload.next_on ?? null, payload.status, payload.start_time ?? null, payload.end_time ?? null, payload.location ?? null, actor.id, id);
    } else {
      followupId = Number(db.prepare(`INSERT INTO brother_followups (brother_id, occurred_on, responsible_user_id, category, notes, next_on, status, start_time, end_time, location, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(brotherId, payload.occurred_on, responsibleId, payload.category, payload.notes, payload.next_on ?? null, payload.status, payload.start_time ?? null, payload.end_time ?? null, payload.location ?? null, actor.id).lastInsertRowid);
    }
    writeAudit(req, id ? 'brother.followup.update' : 'brother.followup.create', brotherId, id ? 'Acompanhamento atualizado.' : 'Acompanhamento registrado.', { followup_id: followupId });
    return followupId;
  })();
  if (!actor.brother_permissions?.includes('brothers:followups:read')) return { id: result, [id ? 'updated' : 'created']: true };
  return db.prepare(`SELECT id, brother_id, occurred_on, responsible_user_id, category, notes, next_on, status, start_time, end_time, location, created_at, updated_at FROM brother_followups WHERE id = ?`).get(result);
}

module.exports = {
  addMembership, addMinistryNodeMember, createBrother, endGroupPastor, endMembership, getBrother, getPrayerGroup,
  listBrotherPeople, listBrothers, listFollowups, listGroups, listMinistries, ministryStructure, saveFollowup,
  saveGroup, saveGroupPastor, saveMinistry, saveMinistryNode, transferGroupMember, updateBrother
};
