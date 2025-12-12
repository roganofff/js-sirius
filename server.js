require('dotenv').config();
const express = require('express');
const log4js = require('log4js');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');

const app = express();
const logger = log4js.getLogger();
logger.level = 'debug';

app.use(express.json());

const authRoutes = require('./routes/auth');
const jokesRoutes = require('./routes/jokes');
const favoritesRoutes = require('./routes/favorites');

app.use('/api/auth', authRoutes);
app.use('/api/jokes', jokesRoutes);
app.use('/api/favorites', favoritesRoutes);

// Swagger UI (OpenAPI)
try {
  const swaggerDocument = YAML.load('./docs/openapi.yaml');
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
} catch (err) {
  logger.warn('Could not load Swagger docs:', err.message);
}

app.get('/health', async (_, res) => {
  const { pool } = require('./config/db');
  
  try {
    const client = await pool.connect();
    client.release();
    res.json({ 
      status: 'OK', 
      database: 'connected',
      timestamp: new Date().toISOString() 
    });
  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(500).json({ 
      status: 'ERROR', 
      database: 'disconnected',
      error: error.message 
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});

module.exports = app;