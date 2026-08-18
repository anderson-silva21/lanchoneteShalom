const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lanchonete-telegram-alerts-'));
process.env.DB_PATH = path.join(tempDir, 'test.sqlite');
process.env.JWT_SECRET = 'telegram-alert-test-secret';
process.env.TELEGRAM_BOT_TOKEN = 'telegram-test-token';
process.env.TELEGRAM_ALERTS_ENABLED = 'true';

const { db, getAppSetting, initDatabase, setAppSetting } = require('../src/db');
const { updateTelegramAlertSettings } = require('../src/services/telegramAlertService');

initDatabase();

test.after(() => {
  db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('configuracao do Telegram preserva chat_id quando o campo fica vazio', () => {
  setAppSetting('telegram_chat_id', '-1001234567890');

  const status = updateTelegramAlertSettings({
    enabled: true,
    chat_id: '',
    interval_minutes: 30,
    max_items: 5
  });

  assert.equal(getAppSetting('telegram_chat_id'), '-1001234567890');
  assert.equal(status.configured, true);
  assert.equal(status.chat_id_preview, '-100...7890');
});
