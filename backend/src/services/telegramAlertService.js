const https = require('https');
const { db } = require('../db');
const { getDashboardAnalytics } = require('./analyticsService');

const LAST_SENT_KEY = 'telegram_alert_last_sent_at';
const TELEGRAM_MESSAGE_LIMIT = 3600;
let schedulerStarted = false;

const moneyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL'
});

const decimalFormatter = new Intl.NumberFormat('pt-BR', {
  maximumFractionDigits: 3
});

const unitForms = {
  unidade: ['unidade', 'unidades'],
  unidades: ['unidade', 'unidades'],
  un: ['un', 'un'],
  und: ['und', 'und'],
  garrafa: ['garrafa', 'garrafas'],
  garrafas: ['garrafa', 'garrafas'],
  garrafinha: ['garrafinha', 'garrafinhas'],
  garrafinhas: ['garrafinha', 'garrafinhas'],
  caixa: ['caixa', 'caixas'],
  caixas: ['caixa', 'caixas'],
  caixinha: ['caixinha', 'caixinhas'],
  caixinhas: ['caixinha', 'caixinhas'],
  pacote: ['pacote', 'pacotes'],
  pacotes: ['pacote', 'pacotes'],
  lata: ['lata', 'latas'],
  latas: ['lata', 'latas'],
  copo: ['copo', 'copos'],
  copos: ['copo', 'copos'],
  litro: ['litro', 'litros'],
  litros: ['litro', 'litros'],
  l: ['l', 'l'],
  ml: ['ml', 'ml'],
  kg: ['kg', 'kg'],
  g: ['g', 'g'],
  grama: ['grama', 'gramas'],
  gramas: ['grama', 'gramas'],
  quilo: ['quilo', 'quilos'],
  quilos: ['quilo', 'quilos'],
  porcao: ['porcao', 'porcoes'],
  porcoes: ['porcao', 'porcoes'],
  fatia: ['fatia', 'fatias'],
  fatias: ['fatia', 'fatias'],
  garfo: ['garfo', 'garfos'],
  garfos: ['garfo', 'garfos'],
  bandeja: ['bandeja', 'bandejas'],
  bandejas: ['bandeja', 'bandejas'],
  saco: ['saco', 'sacos'],
  sacos: ['saco', 'sacos']
};

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'sim', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function parseCsv(value, fallback) {
  const source = value === undefined ? fallback : value;
  return String(source || '')
    .split(',')
    .map((item) => normalizeText(item))
    .filter(Boolean);
}

function getTelegramConfig() {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const chatId = String(process.env.TELEGRAM_CHAT_ID || '').trim();
  const hasCredentials = Boolean(token && chatId);
  const enabled = hasCredentials && parseBoolean(process.env.TELEGRAM_ALERTS_ENABLED, true);
  const intervalMinutes = Math.max(5, Number(process.env.TELEGRAM_ALERT_INTERVAL_MINUTES || 360));
  const maxItems = Math.max(3, Number(process.env.TELEGRAM_ALERT_MAX_ITEMS || 8));
  const ignoredMissingExpirationCategories = parseCsv(
    process.env.TELEGRAM_IGNORE_MISSING_EXPIRATION_CATEGORIES,
    'Descartaveis'
  );

  return {
    token,
    chatId,
    configured: hasCredentials,
    enabled,
    intervalMinutes,
    intervalMs: intervalMinutes * 60 * 1000,
    maxItems,
    ignoredMissingExpirationCategories
  };
}

function getLastSentAt() {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(LAST_SENT_KEY);
  return row?.value || null;
}

function maskChatId(chatId) {
  const value = String(chatId || '').trim();
  if (!value) return '';
  if (value.length <= 6) return value;
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
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

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function genericPlural(unit) {
  if (!unit) return '';
  if (/^[a-z]{1,3}$/i.test(unit)) return unit;
  if (unit.endsWith('ao')) return `${unit.slice(0, -2)}oes`;
  if (unit.endsWith('m')) return `${unit.slice(0, -1)}ns`;
  if (/[rz]$/i.test(unit)) return `${unit}es`;
  if (/[aeiou]$/i.test(unit)) return `${unit}s`;
  return unit.endsWith('s') ? unit : `${unit}s`;
}

function genericSingular(unit) {
  if (!unit) return '';
  if (/^[a-z]{1,3}$/i.test(unit)) return unit;
  if (unit.endsWith('oes')) return `${unit.slice(0, -3)}ao`;
  if (unit.endsWith('ns')) return `${unit.slice(0, -2)}m`;
  if (unit.endsWith('es') && /[rz]es$/i.test(unit)) return unit.slice(0, -2);
  if (unit.endsWith('s')) return unit.slice(0, -1);
  return unit;
}

function pluralizeUnit(unit, quantity) {
  const normalized = normalizeText(unit);
  if (!normalized) return '';

  const forms = unitForms[normalized];
  const isSingular = Math.abs(Number(quantity)) === 1;
  if (forms) return isSingular ? forms[0] : forms[1];
  return isSingular ? genericSingular(normalized) : genericPlural(normalized);
}

function formatQuantity(value, unit) {
  const quantity = Number(value || 0);
  return `${decimalFormatter.format(quantity)} ${pluralizeUnit(unit, quantity) || 'un.'}`;
}

function formatMoney(value) {
  return moneyFormatter.format(Number(value || 0));
}

function shouldIgnoreMissingExpiration(item, ignoredCategories) {
  if (!ignoredCategories.length) return false;
  return ignoredCategories.includes(normalizeText(item.category));
}

function splitRows(rows, size) {
  const chunks = [];
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }
  return chunks;
}

function chunkLines(lines, limit = TELEGRAM_MESSAGE_LIMIT) {
  const chunks = [];
  let current = [];

  lines.forEach((line) => {
    const next = [...current, line];
    if (next.join('\n').length > limit && current.length) {
      chunks.push(current.join('\n'));
      current = [line];
      return;
    }
    current = next;
  });

  if (current.length) chunks.push(current.join('\n'));
  return chunks;
}

function buildSummaryLines({
  lowStockProducts,
  expirationAlerts,
  missingExpirationProducts,
  ignoredMissingExpirationCount,
  pendingPayments,
  pendingPaymentTotal,
  force
}) {
  const lines = [
    '<b>ALERTA SH82 - Operacional</b>',
    `<code>${escapeHtml(new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }))}</code>`,
    '',
    '<b>Resumo</b>',
    `Estoque baixo: <b>${lowStockProducts.length}</b>`,
    `Validades em atenção: <b>${expirationAlerts.length}</b>`,
    `Sem validade relevante: <b>${missingExpirationProducts.length}</b>`,
    `Pagamentos pendentes: <b>${pendingPayments.length}</b> (${escapeHtml(formatMoney(pendingPaymentTotal))})`
  ];

  if (ignoredMissingExpirationCount > 0) {
    lines.push(`Sem validade ignorados por categoria: ${ignoredMissingExpirationCount}`);
  }

  if (force && !lowStockProducts.length && !expirationAlerts.length && !missingExpirationProducts.length && !pendingPayments.length) {
    lines.push('', 'Nenhum alerta operacional no momento.');
  }

  return lines;
}

function buildSectionMessages(title, rows, pageSize, formatter) {
  if (!rows.length) return [];

  return splitRows(rows, pageSize).flatMap((chunk, pageIndex, pages) => {
    const suffix = pages.length > 1 ? ` (${pageIndex + 1}/${pages.length})` : '';
    const lines = [
      `<b>${escapeHtml(title)}${suffix}</b>`,
      ''
    ];

    chunk.forEach((item, index) => {
      const number = pageIndex * pageSize + index + 1;
      lines.push(`${number}. ${formatter(item)}`);
    });

    return chunkLines(lines);
  });
}

function buildTelegramAlertMessages(analytics, options = {}) {
  const force = Boolean(options.force);
  const maxItems = Math.max(3, Number(options.maxItems || 8));
  const ignoredCategories = options.ignoredMissingExpirationCategories || [];
  const lowStockProducts = analytics.low_stock_products || [];
  const expirationAlerts = analytics.expiration_alerts || [];
  const rawMissingExpirationProducts = analytics.missing_expiration_products || [];
  const missingExpirationProducts = rawMissingExpirationProducts
    .filter((item) => !shouldIgnoreMissingExpiration(item, ignoredCategories));
  const ignoredMissingExpirationCount = rawMissingExpirationProducts.length - missingExpirationProducts.length;
  const pendingPayments = analytics.pending_payments || [];
  const pendingPaymentTotal = analytics.kpis?.pending_payment_total || 0;
  const hasAlerts = lowStockProducts.length
    || expirationAlerts.length
    || missingExpirationProducts.length
    || pendingPayments.length;

  if (!hasAlerts && !force) return [];

  const messages = [
    buildSummaryLines({
      lowStockProducts,
      expirationAlerts,
      missingExpirationProducts,
      ignoredMissingExpirationCount,
      pendingPayments,
      pendingPaymentTotal,
      force
    }).join('\n')
  ];

  messages.push(...buildSectionMessages('Estoque baixo', lowStockProducts, maxItems, (item) => (
    `<b>${escapeHtml(item.name)}</b>\n   Atual: ${escapeHtml(formatQuantity(item.stock_quantity, item.unit))} | Mínimo: ${escapeHtml(formatQuantity(item.min_stock, item.unit))}`
  )));

  messages.push(...buildSectionMessages('Validades próximas ou vencidas', expirationAlerts, maxItems, (item) => {
    const status = item.expiration_status === 'expired'
      ? `vencido há ${decimalFormatter.format(Math.abs(Number(item.days_to_expire || 0)))} dias`
      : `vence em ${decimalFormatter.format(Number(item.days_to_expire || 0))} dias`;
    return `<b>${escapeHtml(item.name)}</b> lote <code>#${escapeHtml(item.batch_id)}</code>\n   ${escapeHtml(status)} | Qtd: ${escapeHtml(formatQuantity(item.stock_quantity, item.unit))}`;
  }));

  messages.push(...buildSectionMessages('Lotes sem validade relevante', missingExpirationProducts, maxItems, (item) => (
    `<b>${escapeHtml(item.name)}</b>\n   Qtd: ${escapeHtml(formatQuantity(item.stock_quantity, item.unit))} | Categoria: ${escapeHtml(item.category || '-')}`
  )));

  messages.push(...buildSectionMessages('Pagamentos pendentes', pendingPayments, maxItems, (item) => (
    `Venda <code>#${escapeHtml(item.id)}</code> - <b>${escapeHtml(item.customer_name || 'cliente nao informado')}</b>\n   Total: ${escapeHtml(formatMoney(item.total))}${item.event_name ? ` | Evento: ${escapeHtml(item.event_name)}` : ''}`
  )));

  return messages;
}

function buildTelegramAlertMessage(analytics, options = {}) {
  return buildTelegramAlertMessages(analytics, options).join('\n\n');
}

function parseResponseBody(responseBody) {
  try {
    return responseBody ? JSON.parse(responseBody) : {};
  } catch (error) {
    return { description: responseBody };
  }
}

function createTelegramError(data) {
  const migrationChatId = data.parameters?.migrate_to_chat_id;
  const message = migrationChatId
    ? `O grupo do Telegram virou supergrupo. Atualize TELEGRAM_CHAT_ID para ${migrationChatId} e reinicie o backend.`
    : data.description || 'Falha ao enviar alerta para o Telegram.';
  const error = new Error(message);
  error.status = 502;
  error.payload = data;
  return error;
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
        const data = parseResponseBody(responseBody);
        if (response.statusCode >= 200 && response.statusCode < 300 && data.ok !== false) {
          resolve(data);
          return;
        }
        reject(createTelegramError(data));
      });
    });

    request.on('error', reject);
    request.write(body);
    request.end();
  });
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    const request = https.request(url, { method: 'GET' }, (response) => {
      let responseBody = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        responseBody += chunk;
      });
      response.on('end', () => {
        const data = parseResponseBody(responseBody);
        if (response.statusCode >= 200 && response.statusCode < 300 && data.ok !== false) {
          resolve(data);
          return;
        }
        reject(createTelegramError(data));
      });
    });

    request.on('error', reject);
    request.end();
  });
}

function getChatFromUpdate(update) {
  return update.message?.chat
    || update.edited_message?.chat
    || update.channel_post?.chat
    || update.my_chat_member?.chat
    || update.chat_member?.chat
    || null;
}

async function getVisibleTelegramChats(config) {
  const url = new URL(`https://api.telegram.org/bot${config.token}/getUpdates`);
  url.searchParams.set('limit', '30');
  url.searchParams.set('allowed_updates', JSON.stringify(['message', 'edited_message', 'channel_post', 'my_chat_member', 'chat_member']));
  const data = await getJson(url);
  const chats = new Map();

  (data.result || []).forEach((update) => {
    const chat = getChatFromUpdate(update);
    if (!chat?.id) return;
    chats.set(String(chat.id), {
      id: chat.id,
      type: chat.type,
      title: chat.title || chat.username || [chat.first_name, chat.last_name].filter(Boolean).join(' ') || ''
    });
  });

  return [...chats.values()];
}

function formatChatSuggestion(chat) {
  return `${chat.id}${chat.title ? ` (${chat.title})` : ''}${chat.type ? ` [${chat.type}]` : ''}`;
}

async function sendTelegramMessage(text, config = getTelegramConfig()) {
  if (!config.configured) {
    const error = new Error('Configure TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID no backend.');
    error.status = 400;
    throw error;
  }

  const url = new URL(`https://api.telegram.org/bot${config.token}/sendMessage`);
  try {
    return await postJson(url, {
      chat_id: config.chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true
    });
  } catch (error) {
    if (!/chat not found/i.test(error.message)) throw error;

    try {
      const chats = await getVisibleTelegramChats(config);
      if (chats.length) {
        error.message = `Telegram nao encontrou o TELEGRAM_CHAT_ID configurado (${maskChatId(config.chatId)}). Chats que o bot enxerga nos updates recentes: ${chats.map(formatChatSuggestion).join('; ')}. Use o id correto em TELEGRAM_CHAT_ID e reinicie com pm2 restart lanchonete-backend --update-env.`;
      } else {
        error.message = `Telegram nao encontrou o TELEGRAM_CHAT_ID configurado (${maskChatId(config.chatId)}). O bot nao tem updates recentes: adicione o bot ao grupo, envie uma mensagem ou comando mencionando o bot no grupo e tente novamente.`;
      }
    } catch (diagnosticError) {
      error.message = `Telegram nao encontrou o TELEGRAM_CHAT_ID configurado (${maskChatId(config.chatId)}). Tambem nao foi possivel consultar getUpdates: ${diagnosticError.message}`;
    }

    throw error;
  }
}

async function sendTelegramAlertDigest({ force = false } = {}) {
  const config = getTelegramConfig();
  if (!config.enabled && !force) {
    return { sent: false, reason: config.configured ? 'disabled' : 'not_configured' };
  }

  const analytics = getDashboardAnalytics();
  const messages = buildTelegramAlertMessages(analytics, {
    force,
    maxItems: config.maxItems,
    ignoredMissingExpirationCategories: config.ignoredMissingExpirationCategories
  });
  if (!messages.length) return { sent: false, reason: 'empty' };

  for (const message of messages) {
    await sendTelegramMessage(message, config);
  }

  const sentAt = new Date().toISOString();
  setLastSentAt(sentAt);
  return { sent: true, sent_at: sentAt, messages_sent: messages.length };
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
    chat_id_preview: maskChatId(config.chatId),
    interval_minutes: config.intervalMinutes,
    max_items: config.maxItems,
    ignored_missing_expiration_categories: config.ignoredMissingExpirationCategories,
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
  buildTelegramAlertMessages,
  getTelegramAlertStatus,
  sendTelegramAlertDigest,
  startTelegramAlertScheduler
};
