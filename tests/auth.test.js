const request = require('supertest');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const authRouter = require('../routes/auth');

jest.mock('../config/db', () => ({
  pool: {
    query: jest.fn(),
  },
}));

const { pool } = require('../config/db');

process.env.JWT_SECRET = 'test-secret-key';

describe('Auth Routes', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/auth', authRouter);
    jest.clearAllMocks();
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user successfully', async () => {
      const newUser = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123',
        display_name: 'Test User',
      };

      pool.query.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            username: 'testuser',
            email: 'test@example.com',
            display_name: 'Test User',
          },
        ],
      });

      const response = await request(app)
        .post('/api/auth/register')
        .send(newUser)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.username).toBe('testuser');
      expect(response.body.data.email).toBe('test@example.com');
      expect(response.body.data.token).toBeDefined();
    });

    it('should reject registration with missing fields', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({ username: 'testuser' })
        .expect(400);

      expect(response.body.error).toBe('Missing required fields');
    });

    it('should reject registration with short password', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'testuser',
          email: 'test@example.com',
          password: 'short',
        })
        .expect(400);

      expect(response.body.error).toBe('Password too short');
    });

    it('should reject registration with invalid email', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'testuser',
          email: 'invalid-email',
          password: 'password123',
        })
        .expect(400);

      expect(response.body.error).toBe('Invalid email format');
    });

    it('should handle duplicate username error', async () => {
      const newUser = {
        username: 'existinguser',
        email: 'test@example.com',
        password: 'password123',
      };

      const error = new Error('Duplicate key');
      error.code = '23505';
      error.constraint = 'users_username_key';
      pool.query.mockRejectedValueOnce(error);

      const response = await request(app)
        .post('/api/auth/register')
        .send(newUser)
        .expect(400);

      expect(response.body.error).toBe('Username already exists');
    });

    it('should handle duplicate email error', async () => {
      const newUser = {
        username: 'newuser',
        email: 'existing@example.com',
        password: 'password123',
      };

      const error = new Error('Duplicate key');
      error.code = '23505';
      error.constraint = 'users_email_key';
      pool.query.mockRejectedValueOnce(error);

      const response = await request(app)
        .post('/api/auth/register')
        .send(newUser)
        .expect(400);

      expect(response.body.error).toBe('Email already exists');
    });
  });

  describe('POST /api/auth/login', () => {
    it('should login user successfully', async () => {
      const password = 'password123';
      const hashedPassword = await bcrypt.hash(password, 10);

      const user = {
        id: 1,
        username: 'testuser',
        email: 'test@example.com',
        display_name: 'Test User',
        password_hash: hashedPassword,
      };

      pool.query.mockResolvedValueOnce({ rows: [user] });

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'testuser',
          password: password,
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.token).toBeDefined();
      expect(response.body.data.user.username).toBe('testuser');
    });

    it('should reject login with missing fields', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser' })
        .expect(400);

      expect(response.body.error).toBe('Missing required fields');
    });

    it('should reject login with non-existent user', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'nonexistent',
          password: 'password123',
        })
        .expect(401);

      expect(response.body.error).toBe('Authentication failed');
      expect(response.body.details).toBe('Invalid username or password');
    });

    it('should reject login with incorrect password', async () => {
      const user = {
        id: 1,
        username: 'testuser',
        email: 'test@example.com',
        password_hash: await bcrypt.hash('correct_password', 10),
      };

      pool.query.mockResolvedValueOnce({ rows: [user] });

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'testuser',
          password: 'wrong_password',
        })
        .expect(401);

      expect(response.body.error).toBe('Authentication failed');
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return user profile when authenticated', async () => {
      const user = {
        id: 1,
        username: 'testuser',
        email: 'test@example.com',
        display_name: 'Test User',
        created_at: '2025-01-01T00:00:00Z',
      };

      pool.query.mockResolvedValueOnce({ rows: [user] });

      const token = jwt.sign({ id: 1 }, process.env.JWT_SECRET);

      const mockAuth = (req, res, next) => {
        req.user = { id: 1 };
        next();
      };

      app = express();
      app.use(express.json());
      app.use((req, res, next) => {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
          try {
            const token = authHeader.slice(7);
            req.user = jwt.verify(token, process.env.JWT_SECRET);
          } catch (error) {
            return res.status(401).json({ error: 'Invalid token' });
          }
        }
        next();
      });
      app.use('/api/auth', authRouter);

      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.username).toBe('testuser');
    });

    it('should return 404 when user not found', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const token = jwt.sign({ id: 999 }, process.env.JWT_SECRET);

      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);

      expect(response.body.error).toBe('User not found');
    });
  });
});