const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const favoritesRouter = require('../routes/favorites');

jest.mock('../config/db', () => ({
  pool: {
    query: jest.fn(),
  },
}));

jest.mock('../middleware/auth', () => (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.slice(7);
      req.user = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      return res.status(401).json({ error: 'Invalid token' });
    }
  } else {
    return res.status(401).json({ error: 'No token provided' });
  }
  next();
});

const { pool } = require('../config/db');

process.env.JWT_SECRET = 'test-secret-key';

describe('Favorites Routes', () => {
  let app;
  let authToken;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/favorites', favoritesRouter);
    jest.clearAllMocks();
    authToken = jwt.sign({ id: 1 }, process.env.JWT_SECRET);
  });

  describe('POST /api/favorites/jokes/:id/favorite', () => {
    it('should add a joke to favorites', async () => {
      pool.query.mockResolvedValueOnce({ rows: [{ user_id: 1, joke_id: 5 }] });

      const response = await request(app)
        .post('/api/favorites/jokes/5/favorite')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(201);

      expect(response.status).toBe(201);
      expect(pool.query).toHaveBeenCalledWith(
        'INSERT INTO favorites (user_id, joke_id) VALUES ($1, $2)',
        [1, '5']
      );
    });

    it('should reject adding to favorites without auth', async () => {
      const response = await request(app)
        .post('/api/favorites/jokes/5/favorite')
        .expect(401);

      expect(response.body.error).toBe('No token provided');
    });

    it('should handle database error when adding to favorites', async () => {
      const error = new Error('Duplicate key');
      error.code = '23505';
      pool.query.mockRejectedValueOnce(error);

      const response = await request(app)
        .post('/api/favorites/jokes/5/favorite')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.error).toBeDefined();
    });
  });

  describe('DELETE /api/favorites/jokes/:id/favorite', () => {
    it('should remove a joke from favorites', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .delete('/api/favorites/jokes/5/favorite')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(204);

      expect(response.status).toBe(204);
      expect(pool.query).toHaveBeenCalledWith(
        'DELETE FROM favorites WHERE user_id = $1 AND joke_id = $2',
        [1, '5']
      );
    });

    it('should reject removing from favorites without auth', async () => {
      const response = await request(app)
        .delete('/api/favorites/jokes/5/favorite')
        .expect(401);

      expect(response.body.error).toBe('No token provided');
    });

    it('should handle database error when removing from favorites', async () => {
      const error = new Error('Database error');
      pool.query.mockRejectedValueOnce(error);

      const response = await request(app)
        .delete('/api/favorites/jokes/5/favorite')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.error).toBeDefined();
    });
  });

  describe('GET /api/favorites/users/:id/favorites', () => {
    it('should get user favorites', async () => {
      const favorites = [
        {
          id: 1,
          title: 'Favorite Joke 1',
          body: 'This is a funny joke',
          language: 'en',
          author_name: 'user1',
          created_at: '2025-01-01',
        },
        {
          id: 2,
          title: 'Favorite Joke 2',
          body: 'Another funny joke',
          language: 'en',
          author_name: 'user2',
          created_at: '2025-01-02',
        },
      ];

      pool.query.mockResolvedValueOnce({ rows: favorites });

      const response = await request(app)
        .get('/api/favorites/users/1/favorites')
        .expect(200);

      expect(response.body).toEqual(favorites);
      expect(response.body.length).toBe(2);
      expect(response.body[0].title).toBe('Favorite Joke 1');
    });

    it('should return empty array when user has no favorites', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .get('/api/favorites/users/999/favorites')
        .expect(200);

      expect(response.body).toEqual([]);
    });

    it('should order favorites by creation date (newest first)', async () => {
      const favorites = [
        {
          id: 2,
          title: 'Newer Joke',
          created_at: '2025-01-02',
          author_name: 'user1',
        },
        {
          id: 1,
          title: 'Older Joke',
          created_at: '2025-01-01',
          author_name: 'user1',
        },
      ];

      pool.query.mockResolvedValueOnce({ rows: favorites });

      const response = await request(app)
        .get('/api/favorites/users/1/favorites')
        .expect(200);

      expect(response.body[0].created_at).toBe('2025-01-02');
      expect(response.body[1].created_at).toBe('2025-01-01');
    });

    it('should include author information for jokes', async () => {
      const favorites = [
        {
          id: 1,
          title: 'Joke',
          body: 'Body',
          author_name: 'original_author',
          language: 'en',
        },
      ];

      pool.query.mockResolvedValueOnce({ rows: favorites });

      const response = await request(app)
        .get('/api/favorites/users/1/favorites')
        .expect(200);

      expect(response.body[0].author_name).toBe('original_author');
    });

    it('should handle database error', async () => {
      const error = new Error('Database error');
      pool.query.mockRejectedValueOnce(error);

      const response = await request(app)
        .get('/api/favorites/users/1/favorites')
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should return different favorites for different users', async () => {
      const user1Favorites = [
        {
          id: 1,
          title: 'User 1 Favorite',
          author_name: 'user1',
        },
      ];

      const user2Favorites = [
        {
          id: 2,
          title: 'User 2 Favorite',
          author_name: 'user2',
        },
      ];

      pool.query.mockResolvedValueOnce({ rows: user1Favorites });

      const response1 = await request(app)
        .get('/api/favorites/users/1/favorites')
        .expect(200);

      expect(response1.body[0].title).toBe('User 1 Favorite');

      jest.clearAllMocks();
      pool.query.mockResolvedValueOnce({ rows: user2Favorites });

      const response2 = await request(app)
        .get('/api/favorites/users/2/favorites')
        .expect(200);

      expect(response2.body[0].title).toBe('User 2 Favorite');
    });
  });
});