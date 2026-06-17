const https = require('https');
const { db } = require('../db');
const { getDashboardAnalytics } = require('./analyticsService');

const LAST_SENT_KEY = 'telegram_alert_last_sent_at';
let schedulerStarted = false;

const moneyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL'
});

const decimalFormatter = new Intl.NumberFormat('pt-BR', {
  maximumFractionDigits: 3
});

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'sim', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function getTelegramConfig() {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const chatId = String(process.env.TELEGRAM_CHAT_ID || '').trim();
  const hasCredentials = Boolean(token && chatId);
  const enabled = hasCredentials && parseBoolean(process.env.TELEGRAM_ALERTS_ENABLED, true);
  const intervalMinutes = Math.max(5, Number(process.env.TELEGRAM_ALERT_INTERVAL_MINUTES || 360));
  const maxItems = Math.max(3, Number(process.env.TELEGRAM_ALERT_MAX_ITEMS || 8));

  return {
    token,
    chatId,
    configured: hasCredentials,
    enabled,
    intervalMinutes,
    intervalMs: intervalMinutes * 60 * 1000,
    maxItems
  };
}

function getLastSentAt() {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(LAST_SENT_KEY);
  return row?.value || null;
}

function setLastSentAt(value) {
  db.prepare(`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = CURRENT_TIMESTAMP
  `).run(LAST_SENT_KEY, value);
}

function formatQuantity(value, unit) {
  return `${decimalFormatter.format(Number(value || 0))} ${unit || 'un.'}`;
}

function formatMoney(value) {
  return moneyFormatter.format(Number(value || 0));
}

function limitRows(rows, maxItems) {
  return rows.slice(0, maxItems);
}

function appendLimitedSection(lines, title, rows, maxItems, formatter) {
  if (!rows.length) return;

  lines.push('', title);
  limitRows(rows, maxItems).forEach((row, index) => {
    lines.push(`${index + 1}. ${formatter(row)}`);
  });

  if (rows.length > maxItems) {
    lines.push(`... e mais ${rows.length - maxItems}.`);
  }
}

function buildTelegramAlertMessage(analytics, { force = false, maxItems = 8 } = {}) {
  const lowStockProducts = analytics.low_stock_products || [];
  const expirationAlerts = analytics.expiration_alerts || [];
  const missingExpirationProducts = analytics.missing_expiration_products || [];
  const pendingPayments = analytics.pending_payments || [];
  const hasAlerts = lowStockProducts.length
    || expirationAlerts.length
    || missingExpirationProducts.length
    || pendingPayments.length;

  if (!hasAlerts && !force) return '';

  const lines = [
    'ALERTA SH82',
    `Gerado em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
    '',
    `Estoque baixo: ${lowStockProducts.length}`,
    `Validades em atencao: ${expirationAlerts.length}`,
    `Lotes sem validade: ${missingExpirationProducts.length}`,
    `Pagamentos pendentes: ${pendingPayments.length} (${formatMoney(analytics.kpis?.pending_payment_total || 0)})`
  ];

  if (!hasAlerts) {
    lines.push('', 'Nenhum alerta operacional no momento.');
    return lines.join('\n');
  }

  appendLimitedSection(lines, 'Estoque baixo', lowStockProducts, maxItems, (item) => (
    `${item.name}: ${formatQuantity(item.stock_quantity, item.unit)} em estoque, minimo ${formatQuantity(item.min_stock, item.unit)}`
  ));

  appendLimitedSection(lines, 'Validades proximas ou vencidas', expirationAlerts, maxItems, (item) => {
    const status = item.expiration_status === 'expired' ? 'vencido' : `vence em ${decimalFormatter.format(Number(item.days_to_expire || 0))} dias`;
    return `${item.name} lote #${item.batch_id}: ${status}, ${formatQuantity(item.stock_quantity, item.unit)}`;
  });

  appendLimitedSection(lines, 'Lotes sem validade', missingExpirationProducts, maxItems, (item) => (
    `${item.name}: ${formatQuantity(item.stock_quantity, item.unit)} sem validade registrada`
  ));

  appendLimitedSection(lines, 'Pagamentos pendentes', pendingPayments, maxItems, (item) => (
    `Venda #${item.id}: ${item.customer_name || 'cliente nao informado'} - ${formatMoney(item.total)}`
  ));

  const message = lines.join('\n');
  return message.length > 3900 ? `${message.slice(0, 3890)}\n...` : message;
}

function postJson(url, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const request = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (response) => {
      let responseBody = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        responseBody += chunk;
      });
      response.on('end', () => {
        let data = {};
        try {
          data = responseBody ? JSON.parse(responseBody) : {};
        } catch (error) {
          data = { description: responseBody };
        }
        if (response.statusCode >= 200 && response.statusCode < 300 && data.ok !== false) {
          resolve(data);
          return;
        }
        const error = new Error(data.description || 'Falha ao enviar alerta para o Telegram.');
        error.status = 502;
        reject(error);
      });
    });

    request.on('error', reject);
    request.write(body);
    request.end();
  });
}

async function sendTelegramMessage(text, config = getTelegramConfig()) {
  if (!config.configured) {
    const error = new Error('Configure TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID no backend.');
    error.status = 400;
    throw error;
  }

  const url = new URL(`https://api.telegram.org/bot${config.token}/sendMessage`);
  return postJson(url, {
    chat_id: config.chatId,
    text,
    disable_web_page_preview: true
  });
}

async function sendTelegramAlertDigest({ force = false } = {}) {
  const config = getTelegramConfig();
  if (!config.enabled && !force) {
    return { sent: false, reason: config.configured ? 'disabled' : 'not_configured' };
  }

  const analytics = getDashboardAnalytics();
  const text = buildTelegramAlertMessage(analytics, { force, maxItems: config.maxItems });
  if (!text) return { sent: false, reason: 'empty' };

  await sendTelegramMessage(text, config);
  const sentAt = new Date().toISOString();
  setLastSentAt(sentAt);
  return { sent: true, sent_at: sentAt };
}

async function sendScheduledTelegramAlert() {
  const config = getTelegramConfig();
  if (!config.enabled) return { sent: false, reason: config.configured ? 'disabled' : 'not_configured' };

  const lastSentAt = getLastSentAt();
  if (lastSentAt && Date.now() - new Date(lastSentAt).getTime() < config.intervalMs) {
    return { sent: false, reason: 'interval' };
  }

  return sendTelegramAlertDigest({ force: false });
}

function getTelegramAlertStatus() {
  const config = getTelegramConfig();
  return {
    configured: config.configured,
    enabled: config.enabled,
    interval_minutes: config.intervalMinutes,
    max_items: config.maxItems,
    last_sent_at: getLastSentAt()
  };
}

function startTelegramAlertScheduler() {
  if (schedulerStarted) return;
  schedulerStarted = true;

  const config = getTelegramConfig();
  if (!config.configured) {
    console.log('Alertas Telegram desativados: TELEGRAM_BOT_TOKEN ou TELEGRAM_CHAT_ID nao configurado.');
    return;
  }

  if (!config.enabled) {
    console.log('Alertas Telegram configurados, mas desativados por TELEGRAM_ALERTS_ENABLED.');
    return;
  }

  setTimeout(() => {
    sendScheduledTelegramAlert().catch((error) => {
      console.error('Falha ao enviar alerta Telegram:', error.message);
    });
  }, 10000);

  setInterval(() => {
    sendScheduledTelegramAlert().catch((error) => {
      console.error('Falha ao enviar alerta Telegram:', error.message);
    });
  }, config.intervalMs);

  console.log(`Alertas Telegram ativos a cada ${config.intervalMinutes} minutos.`);
}

module.exports = {
  buildTelegramAlertMessage,
  getTelegramAlertStatus,
  sendTelegramAlertDigest,
  startTelegramAlertScheduler
};
