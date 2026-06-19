const path = require('path');

process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '../../database/lanchonete.dev.sqlite');

require('../src/server');
