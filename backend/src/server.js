const path = require('path');

require('dotenv').config({
  path: path.resolve(__dirname, '../.env')
});

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { initDatabase, dbPath } = require('./db');
const { isCorsOriginAllowed, parseCorsOrigins, parseTrustProxy } = require('./config/security');
const errorHandler = require('./middleware/errorHandler');
const { assignRequestId, httpLogger } = require('./middleware/requestLogger');
const { startAutomaticBackupScheduler } = require('./services/backupService');
const { startTelegramAlertScheduler } = require('./services/telegramAlertService');
const { brazilTimestamp } = require('./utils/time');

const authRoutes = require('./routes/auth');
const analyticsRoutes = require('./routes/analytics');
const backupRoutes = require('./routes/backup');
const comboRoutes = require('./routes/combos');
const inventoryRoutes = require('./routes/inventory');
const productRoutes = require('./routes/products');
const reportRoutes = require('./routes/reports');
const salesRoutes = require('./routes/sales');
const spreadsheetRoutes = require('./routes/spreadsheet');
const systemRoutes = require('./routes/system');
const userRoutes = require('./routes/users');

const app = express();
const port = Number(process.env.PORT || 4000);

initDatabase();

app.set('trust proxy', parseTrustProxy(process.env.TRUST_PROXY));

const configuredOrigins = parseCorsOrigins(process.env.CORS_ORIGINS || process.env.CORS_ORIGIN || '');
const allowPrivateNetworkOrigins = !['0', 'false', 'no', 'off'].includes(
  String(process.env.CORS_ALLOW_PRIVATE_NETWORK_ORIGINS || 'true').trim().toLowerCase()
);

function isAllowedOrigin(origin) {
  return isCorsOriginAllowed(origin, {
    configuredOrigins,
    nodeEnv: process.env.NODE_ENV,
    allowPrivateNetworkOrigins
  });
}

app.use(assignRequestId);
app.use(httpLogger);
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) return callback(null, true);
    const error = new Error(`Origem nao permitida pelo CORS: ${origin}`);
    error.status = 403;
    return callback(error);
  },
  credentials: true
}));
app.use(express.json({ limit: '2mb' }));

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    db: dbPath,
    time: brazilTimestamp()
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/backup', backupRoutes);
app.use('/api/combos', comboRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/products', productRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/spreadsheet', spreadsheetRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/users', userRoutes);

app.use(errorHandler);

app.listen(port, '0.0.0.0', () => {
  console.log(`API pronta em http://localhost:${port}`);
  startAutomaticBackupScheduler();
  startTelegramAlertScheduler();
});
//192.168.15.10/24
