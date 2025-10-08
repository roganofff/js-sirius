const express = require('express');
const auth = require('../middleware/auth');
const { pool } = require('../server');
const router = express.Router();

router.post('/jokes/:id/favorite', auth, async (req, res) => {
  try {
    await pool.query(
      'INSERT INTO favorites (user_id, joke_id) VALUES ($1, $2)',
      [req.user.id, req.params.id]
    );
    res.status(201).send();
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/jokes/:id/favorite', auth, async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM favorites WHERE user_id = $1 AND joke_id = $2',
      [req.user.id, req.params.id]
    );
    res.status(204).send();
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/users/:id/favorites', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT j.*, u.username as author_name 
       FROM favorites f 
       JOIN jokes j ON f.joke_id = j.id 
       LEFT JOIN users u ON j.author_id = u.id 
       WHERE f.user_id = $1 
       ORDER BY f.created_at DESC`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;