const BRAZIL_OFFSET = '-03:00';
const BRAZIL_OFFSET_MINUTES = -3 * 60;
const BRAZIL_SQL_NOW = "datetime('now', '-3 hours')";

function toBrazilDate(date = new Date()) {
  return new Date(date.getTime() + BRAZIL_OFFSET_MINUTES * 60 * 1000);
}

function brazilTimestamp(date = new Date()) {
  return toBrazilDate(date).toISOString().slice(0, 19).replace('T', ' ');
}

function brazilDate(date = new Date()) {
  return toBrazilDate(date).toISOString().slice(0, 10);
}

function parseBrazilTimestamp(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (!text) return null;
  if (/[zZ]$|[+-]\d{2}:\d{2}$/.test(text)) return new Date(text);
  return new Date(`${text.replace(' ', 'T')}${BRAZIL_OFFSET}`);
}

module.exports = {
  BRAZIL_SQL_NOW,
  brazilDate,
  brazilTimestamp,
  parseBrazilTimestamp
};
