require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { initDatabase, dbPath } = require('./db');
const errorHandler = require('./middleware/errorHandler');
const { assignRequestId, httpLogger } = require('./middleware/requestLogger');

const authRoutes = require('./routes/auth');
const analyticsRoutes = require('./routes/analytics');
const backupRoutes = require('./routes/backup');
const comboRoutes = require('./routes/combos');
const inventoryRoutes = require('./routes/inventory');
const powerBiRoutes = require('./routes/powerbi');
const productRoutes = require('./routes/products');
const reportRoutes = require('./routes/reports');
const salesRoutes = require('./routes/sales');
const spreadsheetRoutes = require('./routes/spreadsheet');

const app = express();
const port = Number(process.env.PORT || 4000);

initDatabase();

const configuredOrigins = (process.env.CORS_ORIGINS || process.env.CORS_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const defaultDevOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:4173',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://127.0.0.1:4173',
  'http://192.168.15.9:4173',
  'http://100.82.234.51:4173',
  'http://intranet.lanchoneteshalom.local'
];

function isPrivateNetworkHost(hostname) {
  return (
    hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname.startsWith('192.168.')
    || hostname.startsWith('10.')
    || /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
  );
}

function isAllowedOrigin(origin) {
  if (!origin) return true;

  const allowedOrigins = configuredOrigins.length ? configuredOrigins : defaultDevOrigins;
  if (allowedOrigins.includes(origin)) return true;

  if (process.env.NODE_ENV === 'production') return false;

  try {
    const url = new URL(origin);
    return url.protocol === 'http:' && isPrivateNetworkHost(url.hostname) && ['5173', '5174'].includes(url.port);
  } catch (error) {
    return false;
  }
}

app.use(assignRequestId);
app.use(httpLogger);
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) return callback(null, true);
    return callback(new Error(`Origem nao permitida pelo CORS: ${origin}`));
  },
  credentials: true
}));
app.use(express.json({ limit: '2mb' }));

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    db: dbPath,
    time: new Date().toISOString()
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/backup', backupRoutes);
app.use('/api/combos', comboRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/powerbi', powerBiRoutes);
app.use('/api/products', productRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/spreadsheet', spreadsheetRoutes);

app.use(errorHandler);

app.listen(port, '0.0.0.0', () => {
  console.log(`API pronta em http://localhost:${port}`);
});
//192.168.15.10/24
