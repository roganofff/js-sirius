const express = require('express');
const auth = require('../middleware/auth');
const { pool } = require('../server');
const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { page = 1 } = req.query;
    const limit = 10;
    const offset = (page - 1) * limit;

    const result = await pool.query(
      `SELECT j.*, u.username as author_name 
       FROM jokes j 
       LEFT JOIN users u ON j.author_id = u.id 
       ORDER BY j.created_at DESC 
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    res.json({ items: result.rows, page: parseInt(page) });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/random', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT j.*, u.username as author_name 
       FROM jokes j 
       LEFT JOIN users u ON j.author_id = u.id 
       ORDER BY RANDOM() 
       LIMIT 1`
    );
    res.json(result.rows[0] || {});
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT j.*, u.username as author_name,
       (SELECT COUNT(*) FROM favorites WHERE joke_id = j.id) as favorites_count
       FROM jokes j 
       LEFT JOIN users u ON j.author_id = u.id 
       WHERE j.id = $1`,
      [req.params.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Joke not found' });
    }

    await pool.query('UPDATE jokes SET views = views + 1 WHERE id = $1', [req.params.id]);
    res.json(result.rows[0]);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    const { body, title, language = 'ru' } = req.body;
    const result = await pool.query(
      'INSERT INTO jokes (author_id, title, body, language) VALUES ($1, $2, $3, $4) RETURNING id',
      [req.user.id, title, body, language]
    );
    res.json({ id: result.rows[0].id });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.patch('/:id', auth, async (req, res) => {
  try {
    const { body } = req.body;
    await pool.query(
      'UPDATE jokes SET body = $1, updated_at = NOW() WHERE id = $2 AND author_id = $3',
      [body, req.params.id, req.user.id]
    );
    res.json({ id: req.params.id, updated: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    await pool.query('DELETE FROM jokes WHERE id = $1 AND author_id = $2', [req.params.id, req.user.id]);
    res.status(204).send();
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;