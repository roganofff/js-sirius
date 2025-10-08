const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');
const router = express.Router();

const log4js = require('log4js');
const logger = log4js.getLogger();
logger.level = 'debug';

const validateRegistration = (req, res, next) => {
  const { username, email, password } = req.body;
  
  if (!username || !email || !password) {
    return res.status(400).json({ 
      error: 'Missing required fields',
      details: 'Username, email and password are required' 
    });
  }

  if (password.length < 6) {
    return res.status(400).json({ 
      error: 'Password too short',
      details: 'Password must be at least 6 characters long' 
    });
  }

  if (!/\S+@\S+\.\S+/.test(email)) {
    return res.status(400).json({ 
      error: 'Invalid email format',
      details: 'Please provide a valid email address' 
    });
  }

  next();
};

const validateLogin = (req, res, next) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ 
      error: 'Missing required fields',
      details: 'Username and password are required' 
    });
  }

  next();
};

const handleDatabaseError = (error, res) => {
  logger.error('Database error:', error);

  if (error.code === '23505') {
    const constraint = error.constraint;
    if (constraint.includes('username')) {
      return res.status(400).json({ 
        error: 'Username already exists',
        details: 'Please choose a different username' 
      });
    }
    if (constraint.includes('email')) {
      return res.status(400).json({ 
        error: 'Email already exists',
        details: 'This email is already registered' 
      });
    }
  }

  if (error.code === '23503') {
    return res.status(400).json({ 
      error: 'Reference error',
      details: 'Related record not found' 
    });
  }

  if (error.code === '23514') {
    return res.status(400).json({ 
      error: 'Validation error',
      details: 'Invalid data provided' 
    });
  }

  return res.status(500).json({ 
    error: 'Database error',
    details: 'Please try again later' 
  });
};

router.post('/register', validateRegistration, async (req, res) => {
  try {
    const { username, email, password, display_name } = req.body;
    
    logger.debug(`Registration attempt for username: ${username}, email: ${email}`);

    const passwordHash = await bcrypt.hash(password, 10);
    
    const result = await pool.query(
      'INSERT INTO users (username, email, password_hash, display_name) VALUES ($1, $2, $3, $4) RETURNING id, username, display_name, email',
      [username, email, passwordHash, display_name || username]
    );

    logger.debug('User registered successfully:', result.rows[0]);
    
    const token = jwt.sign(
      { id: result.rows[0].id }, 
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        id: result.rows[0].id,
        username: result.rows[0].username,
        display_name: result.rows[0].display_name,
        email: result.rows[0].email,
        token
      }
    });

  } catch (error) {
    handleDatabaseError(error, res);
  }
});

router.post('/login', validateLogin, async (req, res) => {
  try {
    const { username, password } = req.body;
    
    logger.debug(`Login attempt for username: ${username}`);

    const result = await pool.query(
      'SELECT * FROM users WHERE username = $1', 
      [username]
    );
    
    if (result.rows.length === 0) {
      logger.debug(`User not found: ${username}`);
      return res.status(401).json({ 
        success: false,
        error: 'Authentication failed',
        details: 'Invalid username or password' 
      });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);
    
    if (!validPassword) {
      logger.debug(`Invalid password for user: ${username}`);
      return res.status(401).json({ 
        success: false,
        error: 'Authentication failed', 
        details: 'Invalid username or password' 
      });
    }

    const token = jwt.sign(
      { id: user.id }, 
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    logger.debug(`User logged in successfully: ${username}`);

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          display_name: user.display_name,
          email: user.email
        }
      }
    });

  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Server error',
      details: 'Please try again later' 
    });
  }
});

router.get('/me', require('../middleware/auth'), async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, email, display_name, created_at FROM users WHERE id = $1', 
      [req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        error: 'User not found' 
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    logger.error('Get user profile error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Server error',
      details: 'Failed to retrieve user profile' 
    });
  }
});

router.post('/check-availability', async (req, res) => {
  try {
    const { username, email } = req.body;
    const results = {};

    if (username) {
      const userResult = await pool.query(
        'SELECT id FROM users WHERE username = $1',
        [username]
      );
      results.usernameAvailable = userResult.rows.length === 0;
    }

    if (email) {
      const emailResult = await pool.query(
        'SELECT id FROM users WHERE email = $1',
        [email]
      );
      results.emailAvailable = emailResult.rows.length === 0;
    }

    res.json({
      success: true,
      data: results
    });

  } catch (error) {
    logger.error('Check availability error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Server error' 
    });
  }
});

module.exports = router;