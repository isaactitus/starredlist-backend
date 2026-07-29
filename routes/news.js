const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();

const GNEWS_API_KEY = process.env.GNEWS_API_KEY;
const GNEWS_BASE_URL = 'https://gnews.io/api/v4/search';

const newsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // limit each IP to 20 requests per window
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.get('/compare', newsLimiter, async (req, res) => {
  const { topic } = req.query;

  if (!topic || typeof topic !== 'string' || topic.trim().length === 0) {
    return res.status(400).json({ error: 'Missing topic query param' });
  }

  if (topic.length > 100) {
    return res.status(400).json({ error: 'Topic query too long' });
  }

  try {
    const url = `${GNEWS_BASE_URL}?q=${encodeURIComponent(topic)}&lang=en&max=10&token=${GNEWS_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.errors) {
      return res.status(502).json({ error: 'GNews API error', details: data.errors });
    }

    const articles = (data.articles || []).map(a => ({
      title: a.title,
      description: a.description,
      url: a.url,
      image: a.image,
      publishedAt: a.publishedAt,
      source: a.source.name,
      sourceCountry: a.source.country
    }));

    res.json({ topic, count: articles.length, articles });
  } catch (err) {
    console.error('News fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch news' });
  }
});

module.exports = router;
