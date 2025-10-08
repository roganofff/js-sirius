require('dotenv').config();
const { Pool } = require('pg');

const log4js = require('log4js');
const logger = log4js.getLogger();
logger.level = 'debug';

const poolConfig = {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5777,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
};

const pool = new Pool(poolConfig);

pool.on('connect', () => {
  logger.debug('Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  logger.error('Unexpected error on idle client', err);
  process.exit(-1);
});


module.exports = {
  query: (text, params) => pool.query(text, params),
  getClient: () => pool.connect(),
  pool
};