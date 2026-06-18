const { db } = require('../db');

const MAX_METADATA_LENGTH = 20000;

function serializeMetadata(metadata) {
  if (metadata === undefined || metadata === null) return null;

  try {
    const value = JSON.stringify(metadata);
    return value.length > MAX_METADATA_LENGTH ? value.slice(0, MAX_METADATA_LENGTH) : value;
  } catch (error) {
    return JSON.stringify({ unserializable: true });
  }
}

function recordAudit({
  req = null,
  user = null,
  action,
  entityType = null,
  entityId = null,
  summary,
  metadata = null
}) {
  try {
    const actor = user || req?.user || {};
    db.prepare(`
      INSERT INTO audit_logs
        (user_id, username, role, action, entity_type, entity_id, summary, metadata, ip, request_id)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      actor.id || null,
      actor.username || actor.email || null,
      actor.role || null,
      action,
      entityType,
      entityId === undefined || entityId === null ? null : String(entityId),
      summary,
      serializeMetadata(metadata),
      req?.ip || null,
      req?.id || null
    );
  } catch (error) {
    console.error(`Falha ao registrar auditoria: ${error.message}`);
  }
}

function listAuditLogs({ limit = 80, entityType = '', entityId = '', action = '' } = {}) {
  const where = [];
  const params = [];

  if (entityType) {
    where.push('entity_type = ?');
    params.push(entityType);
  }

  if (entityId) {
    where.push('entity_id = ?');
    params.push(String(entityId));
  }

  if (action) {
    where.push('action = ?');
    params.push(action);
  }

  params.push(Math.min(Math.max(Number(limit) || 80, 1), 300));

  return db.prepare(`
    SELECT
      id,
      user_id,
      username,
      role,
      action,
      entity_type,
      entity_id,
      summary,
      metadata,
      ip,
      request_id,
      created_at
    FROM audit_logs
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY datetime(created_at) DESC, id DESC
    LIMIT ?
  `).all(...params).map((row) => ({
    ...row,
    metadata: row.metadata ? JSON.parse(row.metadata) : null
  }));
}

module.exports = {
  listAuditLogs,
  recordAudit
};
