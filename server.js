require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const log4js = require('log4js');

const app = express();
const logger = log4js.getLogger();
logger.level = 'debug';

app.use(express.json());

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/jokes', require('./routes/jokes'));
app.use('/api', require('./routes/favorites'));

app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});

module.exports = { pool };