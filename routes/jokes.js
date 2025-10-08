const express = require('express');
const auth = require('../middleware/auth');
const { pool } = require('../config/db');
const router = express.Router();

const log4js = require('log4js');
const logger = log4js.getLogger();
logger.level = 'debug';

const validateJokeCreation = (req, res, next) => {
  const { body, title, language = 'ru' } = req.body;
  
  if (!body || body.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Missing required field',
      details: 'Joke body is required'
    });
  }

  if (body.length > 5000) {
    return res.status(400).json({
      success: false,
      error: 'Joke too long',
      details: 'Joke body must be less than 5000 characters'
    });
  }

  if (title && title.length > 200) {
    return res.status(400).json({
      success: false,
      error: 'Title too long',
      details: 'Title must be less than 200 characters'
    });
  }

  next();
};

const validateJokeUpdate = (req, res, next) => {
  const { body, title } = req.body;
  
  if (!body && !title) {
    return res.status(400).json({
      success: false,
      error: 'No fields to update',
      details: 'Provide at least one field to update (body or title)'
    });
  }

  if (body && body.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Invalid body',
      details: 'Joke body cannot be empty'
    });
  }

  next();
};

const validatePagination = (req, _res, next) => {
  let { page = 1, limit = 10 } = req.query;
  
  page = Math.max(1, parseInt(page, 10) || 1);
  limit = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));
  
  req.pagination = { page, limit, offset: (page - 1) * limit };
  next();
};

const handleDatabaseError = (error, res) => {
  logger.error('Database error:', error);

  if (error.code === '23503') {
    return res.status(400).json({
      success: false,
      error: 'Reference error',
      details: 'Author not found'
    });
  }

  if (error.code === '23505') {
    return res.status(400).json({
      success: false,
      error: 'Duplicate joke',
      details: 'Similar joke already exists'
    });
  }

  return res.status(500).json({
    success: false,
    error: 'Database error',
    details: 'Please try again later'
  });
};

router.get('/', validatePagination, async (req, res) => {
  try {
    const { page, limit, offset } = req.pagination;
    const { author, sort = 'newest', language } = req.query;

    logger.debug(`Fetching jokes - page: ${page}, limit: ${limit}, author: ${author}`);

    let whereConditions = [];
    let queryParams = [];
    let paramCount = 0;
    
    if (author) {
      paramCount++;
      whereConditions.push(`u.username = $${paramCount}`);
      queryParams.push(author);
    }

    if (language) {
      paramCount++;
      whereConditions.push(`j.language = $${paramCount}`);
      queryParams.push(language);
    }

    let orderBy;
    switch (sort) {
      case 'popular':
        orderBy = 'j.score DESC, j.views DESC';
        break;
      case 'oldest':
        orderBy = 'j.created_at ASC';
        break;
      case 'random':
        orderBy = 'RANDOM()';
        break;
      default:
        orderBy = 'j.created_at DESC';
    }

    paramCount++;
    queryParams.push(limit);
    paramCount++;
    queryParams.push(offset);

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}` 
      : '';

    const result = await pool.query(
      `SELECT j.*, u.username as author_name,
              (SELECT COUNT(*) FROM favorites WHERE joke_id = j.id) as favorites_count
       FROM jokes j 
       LEFT JOIN users u ON j.author_id = u.id 
       ${whereClause}
       ORDER BY ${orderBy} 
       LIMIT $${paramCount - 1} OFFSET $${paramCount}`,
      queryParams
    );

    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM jokes j 
       LEFT JOIN users u ON j.author_id = u.id 
       ${whereClause}`,
      queryParams.slice(0, -2)
    );

    const total = parseInt(countResult.rows[0].total, 10);
    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      data: {
        items: result.rows,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      }
    });

  } catch (error) {
    handleDatabaseError(error, res);
  }
});

router.get('/random', async (req, res) => {
  try {
    const { language } = req.query;
    
    let query = `
      SELECT j.*, u.username as author_name,
             (SELECT COUNT(*) FROM favorites WHERE joke_id = j.id) as favorites_count
      FROM jokes j 
      LEFT JOIN users u ON j.author_id = u.id 
    `;
    let queryParams = [];

    if (language) {
      query += ' WHERE j.language = $1';
      queryParams.push(language);
    }

    query += ' ORDER BY RANDOM() LIMIT 1';

    const result = await pool.query(query, queryParams);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No jokes found'
      });
    }

    await pool.query(
      'UPDATE jokes SET views = views + 1 WHERE id = $1',
      [result.rows[0].id]
    );

    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    handleDatabaseError(error, res);
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id || isNaN(parseInt(id, 10))) {
      return res.status(400).json({
        success: false,
        error: 'Invalid ID',
        details: 'Please provide a valid joke ID'
      });
    }

    logger.debug(`Fetching joke with ID: ${id}`);

    const result = await pool.query(
      `SELECT j.*, u.username as author_name,
              (SELECT COUNT(*) FROM favorites WHERE joke_id = j.id) as favorites_count,
              (SELECT COUNT(*) FROM comments WHERE joke_id = j.id) as comments_count
       FROM jokes j 
       LEFT JOIN users u ON j.author_id = u.id 
       WHERE j.id = $1`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Joke not found',
        details: 'The requested joke does not exist'
      });
    }

    await pool.query(
      'UPDATE jokes SET views = views + 1 WHERE id = $1',
      [id]
    );

    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    handleDatabaseError(error, res);
  }
});

router.post('/', auth, validateJokeCreation, async (req, res) => {
  try {
    const { body, title, language = 'ru' } = req.body;
    const authorId = req.user.id;

    logger.debug(`Creating joke for user: ${authorId}`);

    const result = await pool.query(
      `INSERT INTO jokes (author_id, title, body, language) 
       VALUES ($1, $2, $3, $4) 
       RETURNING id, title, body, language, created_at`,
      [authorId, title, body, language]
    );

    logger.debug(`Joke created successfully with ID: ${result.rows[0].id}`);

    res.status(201).json({
      success: true,
      message: 'Joke created successfully',
      data: result.rows[0]
    });

  } catch (error) {
    handleDatabaseError(error, res);
  }
});

router.patch('/:id', auth, validateJokeUpdate, async (req, res) => {
  try {
    const { id } = req.params;
    const { body, title } = req.body;
    const authorId = req.user.id;

    if (!id || isNaN(parseInt(id, 10))) {
      return res.status(400).json({
        success: false,
        error: 'Invalid ID',
        details: 'Please provide a valid joke ID'
      });
    }

    logger.debug(`Updating joke ID: ${id} by user: ${authorId}`);

    const existingJoke = await pool.query(
      'SELECT author_id FROM jokes WHERE id = $1',
      [id]
    );

    if (existingJoke.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Joke not found'
      });
    }

    if (existingJoke.rows[0].author_id !== authorId) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        details: 'You can only update your own jokes'
      });
    }

    const updateFields = [];
    const queryParams = [];
    let paramCount = 0;

    if (body !== undefined) {
      paramCount++;
      updateFields.push(`body = $${paramCount}`);
      queryParams.push(body);
    }

    if (title !== undefined) {
      paramCount++;
      updateFields.push(`title = $${paramCount}`);
      queryParams.push(title);
    }

    paramCount++;
    updateFields.push(`updated_at = NOW()`);
    paramCount++;
    queryParams.push(id);

    const result = await pool.query(
      `UPDATE jokes 
       SET ${updateFields.join(', ')} 
       WHERE id = $${paramCount} 
       RETURNING id, title, body, language, updated_at`,
      queryParams
    );

    logger.debug(`Joke updated successfully: ${id}`);

    res.json({
      success: true,
      message: 'Joke updated successfully',
      data: result.rows[0]
    });

  } catch (error) {
    handleDatabaseError(error, res);
  }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const authorId = req.user.id;

    if (!id || isNaN(parseInt(id, 10))) {
      return res.status(400).json({
        success: false,
        error: 'Invalid ID',
        details: 'Please provide a valid joke ID'
      });
    }

    logger.debug(`Deleting joke ID: ${id} by user: ${authorId}`);

    const existingJoke = await pool.query(
      'SELECT author_id FROM jokes WHERE id = $1',
      [id]
    );

    if (existingJoke.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Joke not found'
      });
    }

    if (existingJoke.rows[0].author_id !== authorId) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        details: 'You can only delete your own jokes'
      });
    }

    await pool.query(
      'DELETE FROM jokes WHERE id = $1',
      [id]
    );

    logger.debug(`Joke deleted successfully: ${id}`);

    res.status(204).send();

  } catch (error) {
    handleDatabaseError(error, res);
  }
});

module.exports = router;