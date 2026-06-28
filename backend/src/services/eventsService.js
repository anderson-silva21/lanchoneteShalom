const { db } = require('../db');
const { brazilDate } = require('../utils/time');

function createHttpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function getEventAssignmentSummary(eventId) {
  const summary = db.prepare(`
    SELECT
      COUNT(*) AS assigned_sales,
      COALESCE(SUM(total), 0) AS assigned_revenue
    FROM sales
    WHERE event_id = ?
  `).get(eventId);

  return {
    assigned_sales: Number(summary?.assigned_sales || 0),
    assigned_revenue: Number(summary?.assigned_revenue || 0)
  };
}

function getEventWithSummary(eventId) {
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
  if (!event) return null;

  return {
    ...event,
    ...getEventAssignmentSummary(eventId)
  };
}

function findEventByDate(eventDate, excludeId = null) {
  if (excludeId) {
    return db.prepare(`
      SELECT id, name, event_date
      FROM events
      WHERE date(event_date) = date(?)
        AND id != ?
      LIMIT 1
    `).get(eventDate, excludeId);
  }

  return db.prepare(`
    SELECT id, name, event_date
    FROM events
    WHERE date(event_date) = date(?)
    LIMIT 1
  `).get(eventDate);
}

function ensureEventDateAvailable(eventDate, excludeId = null) {
  const existing = findEventByDate(eventDate, excludeId);

  if (existing) {
    throw createHttpError(`Ja existe o evento ${existing.name} em ${existing.event_date}.`, 409);
  }
}

const createEventTransaction = db.transaction((payload) => {
  ensureEventDateAvailable(payload.event_date);

  const eventId = db.prepare(`
    INSERT INTO events (name, event_date, notes)
    VALUES (?, ?, ?)
  `).run(payload.name, payload.event_date, payload.notes || null).lastInsertRowid;

  const assignment = db.prepare(`
    UPDATE sales
    SET event_id = ?
    WHERE date(created_at) = date(?)
  `).run(eventId, payload.event_date);

  const event = getEventWithSummary(eventId);

  return {
    ...event,
    assigned_sales: Number(assignment.changes || event.assigned_sales || 0)
  };
});

function createEvent(payload) {
  return createEventTransaction(payload);
}

function listEvents() {
  return db.prepare(`
    SELECT
      e.id,
      e.name,
      e.event_date,
      e.notes,
      e.created_at,
      COUNT(s.id) AS assigned_sales,
      COALESCE(SUM(s.total), 0) AS assigned_revenue
    FROM events e
    LEFT JOIN sales s ON s.event_id = e.id
    WHERE date(e.event_date) >= date('now', '-3 hours', 'start of year')
    GROUP BY e.id
    ORDER BY date(e.event_date) DESC, e.name ASC
  `).all().map((event) => ({
    ...event,
    assigned_sales: Number(event.assigned_sales || 0),
    assigned_revenue: Number(event.assigned_revenue || 0)
  }));
}

const updateEventTransaction = db.transaction((id, payload) => {
  const eventId = Number(id);
  if (!Number.isInteger(eventId) || eventId <= 0) {
    throw createHttpError('Evento invalido.', 400);
  }

  const current = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
  if (!current) {
    throw createHttpError('Evento nao encontrado.', 404);
  }

  ensureEventDateAvailable(payload.event_date, eventId);

  db.prepare(`
    UPDATE events
    SET name = ?, event_date = ?, notes = ?
    WHERE id = ?
  `).run(
    payload.name,
    payload.event_date,
    payload.notes !== undefined ? payload.notes || null : current.notes,
    eventId
  );

  if (current.event_date !== payload.event_date) {
    db.prepare('UPDATE cash_closings SET closing_date = ? WHERE event_id = ?').run(payload.event_date, eventId);
  }

  return {
    ...getEventWithSummary(eventId),
    reassigned_sales: 0,
    unassigned_sales: 0
  };
});

function updateEvent(id, payload) {
  return updateEventTransaction(id, payload);
}

function findEventForToday() {
  return db.prepare(`
    SELECT id, name, event_date
    FROM events
    WHERE date(event_date) = date(?)
    LIMIT 1
  `).get(brazilDate()) || null;
}

module.exports = {
  createEvent,
  findEventForToday,
  listEvents,
  updateEvent
};
