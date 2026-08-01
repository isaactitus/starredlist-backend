const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();

const GNEWS_API_KEY = process.env.GNEWS_API_KEY;
const SEARCH_URL = 'https://gnews.io/api/v4/search';
const HEADLINES_URL = 'https://gnews.io/api/v4/top-headlines';

const newsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Common topics used for typo correction (basic, not a full spellchecker)
const KNOWN_TOPICS = [
  "technology", "elections", "cricket", "football", "bollywood", "politics",
  "economy", "stock market", "weather", "climate", "science", "health",
  "business", "entertainment", "sports", "world news", "ai", "artificial intelligence",
  "space", "crypto", "cryptocurrency", "startups", "education", "covid",
  "war", "ukraine", "israel", "china", "india", "usa", "elections 2026",
  "olympics", "world cup", "nba", "nfl", "movies", "music", "gaming",
  "climate change", "inflation", "recession", "budget", "taxes"
];

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function findClosestTopic(input) {
  const lower = input.toLowerCase().trim();
  let best = null;
  let bestDist = Infinity;
  for (const topic of KNOWN_TOPICS) {
    const dist = levenshtein(lower, topic);
    // only accept close matches — proportional to word length
    const threshold = Math.max(2, Math.floor(topic.length * 0.3));
    if (dist < bestDist && dist <= threshold) {
      bestDist = dist;
      best = topic;
    }
  }
  return best;
}

function dateRangeFor(dateParam) {
  if (!dateParam || dateParam === "today") return null;
  let target;
  if (dateParam === "yesterday") {
    target = new Date();
    target.setUTCDate(target.getUTCDate() - 1);
  } else {
    target = new Date(dateParam + "T00:00:00Z");
    if (isNaN(target.getTime())) return null;
  }
  const from = new Date(target);
  from.setUTCHours(0, 0, 0, 0);
  const to = new Date(target);
  to.setUTCHours(23, 59, 59, 999);
  return { from: from.toISOString(), to: to.toISOString() };
}

function mapArticles(data) {
  return (data.articles || []).map(a => ({
    title: a.title,
    description: a.description,
    url: a.url,
    image: a.image,
    publishedAt: a.publishedAt,
    source: a.source.name,
    sourceCountry: a.source.country,
  }));
}

// GET /api/news/compare?topic=xyz&date=today|yesterday|YYYY-MM-DD
router.get('/compare', newsLimiter, async (req, res) => {
  const { topic, date } = req.query;

  if (!topic || typeof topic !== 'string' || topic.trim().length === 0) {
    return res.status(400).json({ error: 'Missing topic query param' });
  }
  if (topic.length > 100) {
    return res.status(400).json({ error: 'Topic query too long' });
  }

  const range = dateRangeFor(date);

  async function search(term) {
    let url = `${SEARCH_URL}?q=${encodeURIComponent(term)}&lang=en&max=10&token=${GNEWS_API_KEY}`;
    if (range) url += `&from=${range.from}&to=${range.to}`;
    const response = await fetch(url);
    return response.json();
  }

  try {
    let data = await search(topic);
    if (data.errors) {
      return res.status(502).json({ error: 'GNews API error', details: data.errors });
    }

    let correctedFrom = null;
    if (!data.articles || data.articles.length === 0) {
      const suggestion = findClosestTopic(topic);
      if (suggestion && suggestion.toLowerCase() !== topic.toLowerCase()) {
        data = await search(suggestion);
        if (data.articles && data.articles.length > 0) {
          correctedFrom = topic;
          res.json({
            topic: suggestion,
            correctedFrom,
            count: data.articles.length,
            articles: mapArticles(data),
          });
          return;
        }
      }
    }

    res.json({ topic, count: (data.articles || []).length, articles: mapArticles(data) });
  } catch (err) {
    console.error('News fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch news' });
  }
});

// GET /api/news/frontpage?category=general&date=today|yesterday|YYYY-MM-DD
router.get('/frontpage', newsLimiter, async (req, res) => {
  const category = (req.query.category || "general").toLowerCase();
  const { date } = req.query;
  const VALID_CATEGORIES = ["general", "world", "nation", "business", "technology", "entertainment", "sports", "science", "health"];
  const cat = VALID_CATEGORIES.includes(category) ? category : "general";

  const range = dateRangeFor(date);

  try {
    let data;
    if (!range) {
      // "Today" — use real top-headlines ranking
      const url = `${HEADLINES_URL}?category=${cat}&lang=en&max=12&token=${GNEWS_API_KEY}`;
      const response = await fetch(url);
      data = await response.json();
    } else {
      // Past date — top-headlines has no history, fall back to search within that date range
      const query = cat === "general" ? "news" : cat;
      const url = `${SEARCH_URL}?q=${encodeURIComponent(query)}&lang=en&max=12&from=${range.from}&to=${range.to}&token=${GNEWS_API_KEY}`;
      const response = await fetch(url);
      data = await response.json();
    }

    if (data.errors) {
      return res.status(502).json({ error: 'GNews API error', details: data.errors });
    }

    res.json({ category: cat, count: (data.articles || []).length, articles: mapArticles(data) });
  } catch (err) {
    console.error('Frontpage fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch front page' });
  }
});

module.exports = router;
