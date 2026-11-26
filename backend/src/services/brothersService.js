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

function listGroups() {
  return db.prepare(`SELECT g.id, g.name, g.description, g.responsible_brother_id, b.full_name AS responsible_name, g.active,
      (SELECT COUNT(*) FROM brother_group_memberships m WHERE m.group_id = g.id AND m.ended_on IS NULL) AS member_count
    FROM prayer_groups g LEFT JOIN brothers b ON b.id = g.responsible_brother_id
    ORDER BY g.name COLLATE NOCASE`).all().map((row) => ({ ...row, active: Boolean(row.active) }));
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
  const result = db.transaction(() => {
    let groupId = id;
    const previous = id ? db.prepare('SELECT responsible_brother_id FROM prayer_groups WHERE id = ?').get(id) : null;
    if (id) {
      if (!db.prepare('SELECT id FROM prayer_groups WHERE id = ?').get(id)) throw notFound('Grupo de oracao nao encontrado.');
      db.prepare(`UPDATE prayer_groups SET name = ?, description = ?, responsible_brother_id = ?, active = ?, updated_at = datetime('now', '-3 hours') WHERE id = ?`)
        .run(payload.name, payload.description ?? null, payload.responsible_brother_id ?? null, payload.active ? 1 : 0, id);
    } else {
      groupId = Number(db.prepare('INSERT INTO prayer_groups (name, description, responsible_brother_id, active, created_by) VALUES (?, ?, ?, ?, ?)')
        .run(payload.name, payload.description ?? null, payload.responsible_brother_id ?? null, payload.active ? 1 : 0, actor.id).lastInsertRowid);
    }
    if (previous?.responsible_brother_id && previous.responsible_brother_id !== payload.responsible_brother_id) {
      writeHistory(previous.responsible_brother_id, actor.id, 'group.responsibility.ended', 'Responsabilidade em grupo de oracao encerrada.', { group_id: groupId });
    }
    if (payload.responsible_brother_id && previous?.responsible_brother_id !== payload.responsible_brother_id) {
      writeHistory(payload.responsible_brother_id, actor.id, 'group.responsibility.started', 'Responsabilidade em grupo de oracao iniciada.', { group_id: groupId });
    }
    writeAudit(req, id ? 'brother.group.update' : 'brother.group.create', groupId, id ? 'Grupo de oracao atualizado.' : 'Grupo de oracao criado.');
    return groupId;
  })();
  return listGroups().find((group) => group.id === result);
}

function listMinistries() {
  return db.prepare(`SELECT m.id, m.name, m.description, m.responsible_brother_id, b.full_name AS responsible_name, m.active,
      (SELECT COUNT(*) FROM brother_ministry_memberships x WHERE x.ministry_id = m.id AND x.ended_on IS NULL) AS member_count
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
    writeAudit(req, id ? 'brother.ministry.update' : 'brother.ministry.create', ministryId, id ? 'Servico atualizado.' : 'Servico criado.');
    return ministryId;
  })();
  return listMinistries().find((ministry) => ministry.id === result);
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
    writeAudit(req, `brother.${type}.membership.end`, brotherId, 'Vinculo comunitario encerrado.', { [foreignKey]: relation[foreignKey] });
  })();
  return { ...relation, ended_on: endedOn };
}

function listFollowups(brotherId) {
  if (!db.prepare('SELECT id FROM brothers WHERE id = ?').get(brotherId)) throw notFound('Irmao nao encontrado.');
  return db.prepare(`SELECT f.id, f.brother_id, f.occurred_on, f.responsible_user_id, u.name AS responsible_name,
      f.category, f.notes, f.next_on, f.status, f.created_at, f.updated_at
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
      db.prepare(`UPDATE brother_followups SET occurred_on = ?, responsible_user_id = ?, category = ?, notes = ?, next_on = ?, status = ?, updated_by = ?, updated_at = datetime('now', '-3 hours') WHERE id = ?`)
        .run(payload.occurred_on, responsibleId, payload.category, payload.notes, payload.next_on ?? null, payload.status, actor.id, id);
    } else {
      followupId = Number(db.prepare(`INSERT INTO brother_followups (brother_id, occurred_on, responsible_user_id, category, notes, next_on, status, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(brotherId, payload.occurred_on, responsibleId, payload.category, payload.notes, payload.next_on ?? null, payload.status, actor.id).lastInsertRowid);
    }
    writeAudit(req, id ? 'brother.followup.update' : 'brother.followup.create', brotherId, id ? 'Acompanhamento atualizado.' : 'Acompanhamento registrado.', { followup_id: followupId });
    return followupId;
  })();
  if (!actor.brother_permissions?.includes('brothers:followups:read')) return { id: result, [id ? 'updated' : 'created']: true };
  return db.prepare(`SELECT id, brother_id, occurred_on, responsible_user_id, category, notes, next_on, status, created_at, updated_at FROM brother_followups WHERE id = ?`).get(result);
}

module.exports = {
  addMembership, createBrother, endMembership, getBrother, listBrotherPeople, listBrothers, listFollowups, listGroups, listMinistries,
  saveFollowup, saveGroup, saveMinistry, updateBrother
};
