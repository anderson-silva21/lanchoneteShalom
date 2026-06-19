const { db } = require('../db');
const { brazilDate } = require('../utils/time');

function createHttpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

const createEventTransaction = db.transaction((payload) => {
  const existing = db.prepare(`
    SELECT id, name, event_date
    FROM events
    WHERE date(event_date) = date(?)
    LIMIT 1
  `).get(payload.event_date);

  if (existing) {
    throw createHttpError(`Ja existe o evento ${existing.name} em ${existing.event_date}.`, 409);
  }

  const eventId = db.prepare(`
    INSERT INTO events (name, event_date, notes)
    VALUES (?, ?, ?)
  `).run(payload.name, payload.event_date, payload.notes || null).lastInsertRowid;

  const assignment = db.prepare(`
    UPDATE sales
    SET event_id = ?
    WHERE date(created_at) = date(?)
  `).run(eventId, payload.event_date);

  const revenue = db.prepare(`
    SELECT COALESCE(SUM(total), 0) AS revenue
    FROM sales
    WHERE event_id = ?
  `).get(eventId).revenue;

  return {
    ...db.prepare('SELECT * FROM events WHERE id = ?').get(eventId),
    assigned_sales: Number(assignment.changes || 0),
    assigned_revenue: Number(revenue || 0)
  };
});

function createEvent(payload) {
  return createEventTransaction(payload);
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
  findEventForToday
};
