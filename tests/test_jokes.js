const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const jokesRouter = require('../routes/jokes');

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

describe('Jokes Routes', () => {
  let app;
  let authToken;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/jokes', jokesRouter);
    jest.clearAllMocks();
    authToken = jwt.sign({ id: 1 }, process.env.JWT_SECRET);
  });

  describe('GET /api/jokes/', () => {
    it('should fetch jokes with default pagination', async () => {
      const mockJokes = [
        {
          id: 1,
          title: 'Joke 1',
          body: 'Why did the chicken cross the road?',
          language: 'en',
          author_name: 'user1',
          favorites_count: 5,
          created_at: '2025-01-01',
        },
      ];

      pool.query
        .mockResolvedValueOnce({ rows: mockJokes })
        .mockResolvedValueOnce({ rows: [{ total: '10' }] });

      const response = await request(app)
        .get('/api/jokes/')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.items.length).toBe(1);
      expect(response.body.data.pagination.page).toBe(1);
      expect(response.body.data.pagination.limit).toBe(10);
      expect(response.body.data.pagination.total).toBe(10);
    });

    it('should filter jokes by author', async () => {
      const mockJokes = [
        {
          id: 1,
          title: 'Joke 1',
          body: 'Joke body',
          author_name: 'testuser',
          favorites_count: 3,
        },
      ];

      pool.query
        .mockResolvedValueOnce({ rows: mockJokes })
        .mockResolvedValueOnce({ rows: [{ total: '1' }] });

      const response = await request(app)
        .get('/api/jokes/?author=testuser')
        .expect(200);

      expect(response.body.data.items[0].author_name).toBe('testuser');
    });

    it('should filter jokes by language', async () => {
      const mockJokes = [
        {
          id: 1,
          title: 'Анекдот',
          body: 'Шутка',
          language: 'ru',
          author_name: 'user1',
          favorites_count: 2,
        },
      ];

      pool.query
        .mockResolvedValueOnce({ rows: mockJokes })
        .mockResolvedValueOnce({ rows: [{ total: '5' }] });

      const response = await request(app)
        .get('/api/jokes/?language=ru')
        .expect(200);

      expect(response.body.data.items[0].language).toBe('ru');
    });

    it('should sort jokes by popular', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [{ id: 1, score: 100, views: 500 }] })
        .mockResolvedValueOnce({ rows: [{ total: '1' }] });

      const response = await request(app)
        .get('/api/jokes/?sort=popular')
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should sort jokes by oldest', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [{ id: 1, created_at: '2020-01-01' }] })
        .mockResolvedValueOnce({ rows: [{ total: '1' }] });

      const response = await request(app)
        .get('/api/jokes/?sort=oldest')
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should handle custom pagination', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: '100' }] });

      const response = await request(app)
        .get('/api/jokes/?page=2&limit=20')
        .expect(200);

      expect(response.body.data.pagination.page).toBe(2);
      expect(response.body.data.pagination.limit).toBe(20);
    });
  });

  describe('GET /api/jokes/random', () => {
    it('should get a random joke', async () => {
      const randomJoke = {
        id: 5,
        title: 'Random Joke',
        body: 'This is a random joke',
        language: 'en',
        author_name: 'user1',
        favorites_count: 10,
      };

      pool.query
        .mockResolvedValueOnce({ rows: [randomJoke] })
        .mockResolvedValueOnce({ rows: [{ affected: 1 }] });

      const response = await request(app)
        .get('/api/jokes/random')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(5);
    });

    it('should get random joke in specific language', async () => {
      const randomJoke = {
        id: 3,
        title: 'Случайный анекдот',
        language: 'ru',
        author_name: 'user2',
      };

      pool.query
        .mockResolvedValueOnce({ rows: [randomJoke] })
        .mockResolvedValueOnce({ rows: [{ affected: 1 }] });

      const response = await request(app)
        .get('/api/jokes/random?language=ru')
        .expect(200);

      expect(response.body.data.language).toBe('ru');
    });

    it('should return 404 when no jokes found', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .get('/api/jokes/random')
        .expect(404);

      expect(response.body.error).toBe('No jokes found');
    });
  });

  describe('GET /api/jokes/:id', () => {
    it('should fetch a specific joke by ID', async () => {
      const joke = {
        id: 1,
        title: 'Joke Title',
        body: 'Joke body text',
        language: 'en',
        author_name: 'user1',
        favorites_count: 5,
        created_at: '2025-01-01',
      };

      pool.query
        .mockResolvedValueOnce({ rows: [joke] })
        .mockResolvedValueOnce({ rows: [{ affected: 1 }] });

      const response = await request(app)
        .get('/api/jokes/1')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(1);
      expect(response.body.data.title).toBe('Joke Title');
    });

    it('should return 404 for non-existent joke', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .get('/api/jokes/999')
        .expect(404);

      expect(response.body.error).toBe('Joke not found');
    });

    it('should return 400 for invalid ID', async () => {
      const response = await request(app)
        .get('/api/jokes/invalid')
        .expect(400);

      expect(response.body.error).toBe('Invalid ID');
    });
  });

  describe('POST /api/jokes/', () => {
    it('should create a new joke', async () => {
      const newJoke = {
        title: 'New Joke',
        body: 'This is a new joke',
        language: 'en',
      };

      pool.query.mockResolvedValueOnce({
        rows: [
          {
            id: 10,
            title: 'New Joke',
            body: 'This is a new joke',
            language: 'en',
            created_at: '2025-01-15',
          },
        ],
      });

      const response = await request(app)
        .post('/api/jokes/')
        .set('Authorization', `Bearer ${authToken}`)
        .send(newJoke)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.title).toBe('New Joke');
    });

    it('should reject joke creation without auth', async () => {
      const response = await request(app)
        .post('/api/jokes/')
        .send({ title: 'Joke', body: 'Body' })
        .expect(401);

      expect(response.body.error).toBe('No token provided');
    });

    it('should reject joke creation with empty body', async () => {
      const response = await request(app)
        .post('/api/jokes/')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'Title', body: '' })
        .expect(400);

      expect(response.body.error).toBe('Missing required field');
    });

    it('should reject joke body longer than 5000 characters', async () => {
      const longBody = 'a'.repeat(5001);
      const response = await request(app)
        .post('/api/jokes/')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'Title', body: longBody })
        .expect(400);

      expect(response.body.error).toBe('Joke too long');
    });

    it('should reject title longer than 200 characters', async () => {
      const longTitle = 'a'.repeat(201);
      const response = await request(app)
        .post('/api/jokes/')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: longTitle, body: 'Body' })
        .expect(400);

      expect(response.body.error).toBe('Title too long');
    });
  });

  describe('PATCH /api/jokes/:id', () => {
    it('should update a joke', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [{ id: 1, author_id: 1 }] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              title: 'Updated Title',
              body: 'Updated body',
              language: 'en',
              updated_at: '2025-01-15',
            },
          ],
        });

      const response = await request(app)
        .patch('/api/jokes/1')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'Updated Title', body: 'Updated body' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.title).toBe('Updated Title');
    });

    it('should reject update by non-author', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [{ id: 1, author_id: 999 }],
      });

      const response = await request(app)
        .patch('/api/jokes/1')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'Updated Title' })
        .expect(403);

      expect(response.body.error).toBe('Forbidden');
    });

    it('should return 404 for non-existent joke', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .patch('/api/jokes/999')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'Updated' })
        .expect(404);

      expect(response.body.error).toBe('Joke not found');
    });

    it('should reject update with no fields', async () => {
      const response = await request(app)
        .patch('/api/jokes/1')
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .expect(400);

      expect(response.body.error).toBe('No fields to update');
    });

    it('should reject update with empty body', async () => {
      const response = await request(app)
        .patch('/api/jokes/1')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ body: '   ' })
        .expect(400);

      expect(response.body.error).toBe('Invalid body');
    });

    it('should return 400 for invalid ID', async () => {
      const response = await request(app)
        .patch('/api/jokes/invalid')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'Updated' })
        .expect(400);

      expect(response.body.error).toBe('Invalid ID');
    });
  });

  describe('DELETE /api/jokes/:id', () => {
    it('should delete a joke by author', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [{ id: 1, author_id: 1 }] })
        .mockResolvedValueOnce({ rows: [{ affected: 1 }] });

      const response = await request(app)
        .delete('/api/jokes/1')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(204);

      expect(response.status).toBe(204);
    });

    it('should reject deletion by non-author', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [{ id: 1, author_id: 999 }],
      });

      const response = await request(app)
        .delete('/api/jokes/1')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(403);

      expect(response.body.error).toBe('Forbidden');
    });

    it('should return 404 for non-existent joke', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .delete('/api/jokes/999')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.error).toBe('Joke not found');
    });

    it('should return 400 for invalid ID', async () => {
      const response = await request(app)
        .delete('/api/jokes/invalid')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.error).toBe('Invalid ID');
    });
  });
});