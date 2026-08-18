const bcrypt = require('bcryptjs');
const { db, initDatabase } = require('../src/db');

const roles = new Set(['admin', 'manager', 'cashier', 'finance']);

function usage() {
  console.log('Uso: npm run user:create -- <username> <senha> <role> <nome completo>');
  console.log('Roles: admin, manager, cashier, finance');
  console.log('Exemplo: npm run user:create -- joao MinhaSenha123 manager "Joao Silva"');
}

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

function fail(message) {
  console.error(message);
  usage();
  process.exit(1);
}

const [rawUsername, password, role = 'cashier', ...nameParts] = process.argv.slice(2);
const username = normalizeUsername(rawUsername);
const name = nameParts.join(' ').trim() || username;
const email = `${username}@lanchonete.local`;

if (!username || !/^[a-z0-9._-]{3,40}$/.test(username)) {
  fail('Informe um username com 3 a 40 caracteres usando letras, numeros, ponto, underline ou hifen.');
}

if (!password || password.length < 6) {
  fail('Informe uma senha com pelo menos 6 caracteres.');
}

if (!roles.has(role)) {
  fail('Perfil invalido.');
}

initDatabase();

const existing = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
if (existing) {
  fail('Ja existe um usuario com esse username ou email.');
}

const result = db.prepare(`
  INSERT INTO users (name, username, email, password_hash, role)
  VALUES (?, ?, ?, ?, ?)
`).run(
  name,
  username,
  email,
  bcrypt.hashSync(password, 10),
  role
);

console.log(`Usuario criado: ${username} (#${result.lastInsertRowid})`);
