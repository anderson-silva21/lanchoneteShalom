const weakProductionJwtSecrets = new Set([
  'dev-secret-change-me',
  'troque-este-segredo'
]);

const defaultDevelopmentCorsOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:4173',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://127.0.0.1:4173',
  'http://192.168.15.9:4173',
  'http://100.82.234.51:4173',
  'http://intranet.lanchoneteshalom',
  'http://intranet.lanchoneteshalom.local',
  'https://intranet.lanchoneteshalom.local'
];

function parseCorsOrigins(value = '') {
  return String(value || '')
    .split(',')
    .map(normalizeCorsOrigin)
    .filter(Boolean);
}

function normalizeCorsOrigin(origin = '') {
  const trimmedOrigin = String(origin || '').trim();
  if (!trimmedOrigin) return '';

  try {
    const url = new URL(trimmedOrigin);
    return `${url.protocol}//${url.host}`;
  } catch (error) {
    return trimmedOrigin.replace(/\/+$/, '');
  }
}

function isPrivateNetworkHost(hostname = '') {
  return (
    hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname.startsWith('192.168.')
    || hostname.startsWith('10.')
    || /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
    || /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(hostname)
  );
}

function isCorsOriginAllowed(origin, { configuredOrigins = [], nodeEnv = process.env.NODE_ENV } = {}) {
  const normalizedOrigin = normalizeCorsOrigin(origin);
  if (!normalizedOrigin) return true;

  const allowedOrigins = configuredOrigins.length || nodeEnv === 'production'
    ? configuredOrigins
    : defaultDevelopmentCorsOrigins;

  if (allowedOrigins.includes(normalizedOrigin)) return true;
  if (nodeEnv === 'production') return false;

  try {
    const url = new URL(normalizedOrigin);
    return url.protocol === 'http:' && isPrivateNetworkHost(url.hostname) && ['4173', '5173', '5174'].includes(url.port);
  } catch (error) {
    return false;
  }
}

function getJwtSecret({ env = process.env, nodeEnv = env.NODE_ENV } = {}) {
  const secret = String(env.JWT_SECRET || '').trim();

  if (!secret) {
    if (nodeEnv === 'production') {
      throw new Error('JWT_SECRET e obrigatorio em producao.');
    }
    return 'dev-secret-change-me';
  }

  if (nodeEnv === 'production' && (weakProductionJwtSecrets.has(secret) || secret.length < 32)) {
    throw new Error('JWT_SECRET de producao deve ser forte, unico e ter pelo menos 32 caracteres.');
  }

  return secret;
}

function parseTrustProxy(value = '') {
  const normalized = String(value || '').trim();
  if (!normalized) return false;
  if (['0', 'false', 'no', 'off'].includes(normalized.toLowerCase())) return false;
  if (['1', 'true', 'yes', 'on'].includes(normalized.toLowerCase())) return true;

  const asNumber = Number(normalized);
  if (Number.isInteger(asNumber) && asNumber >= 0) return asNumber;

  return normalized.includes(',')
    ? normalized.split(',').map((item) => item.trim()).filter(Boolean)
    : normalized;
}

module.exports = {
  defaultDevelopmentCorsOrigins,
  getJwtSecret,
  isCorsOriginAllowed,
  normalizeCorsOrigin,
  parseCorsOrigins,
  parseTrustProxy
};
