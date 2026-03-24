// api/market-news.js
// GET /api/market-news?category=general
// Returns general market news (not company-specific)
// Cached 5 minutes

import { fhGet, setCacheHeaders, errorResponse } from './_finnhub.js';

function timeAgo(unixSeconds) {
  const ms = Date.now() - unixSeconds * 1000;
  if (ms < 60000)    return 'Just now';
  if (ms < 3600000)  return Math.floor(ms / 60000) + ' min ago';
  if (ms < 86400000) return Math.floor(ms / 3600000) + ' hr ago';
  return Math.floor(ms / 86400000) + 'd ago';
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { category = 'general', limit = '15' } = req.query;
  const validCategories = ['general', 'forex', 'crypto', 'merger'];
  const cat = validCategories.includes(category) ? category : 'general';

  try {
    const data = await fhGet('/news', { category: cat });

    if (!Array.isArray(data)) {
      return res.status(200).json({ category: cat, articles: [] });
    }

    const articles = data.slice(0, parseInt(limit) || 15).map(item => ({
      id:        item.id,
      headline:  item.headline  || '',
      summary:   item.summary   || '',
      source:    item.source    || 'Finnhub',
      url:       item.url       || '',
      image:     item.image     || '',
      time:      item.datetime  ? timeAgo(item.datetime) : 'Recently',
      timestamp: item.datetime  || 0,
      category:  item.category  || cat,
      sentiment: 'neutral',
    }));

    setCacheHeaders(res, 300); // 5 min cache
    return res.json({ category: cat, articles, count: articles.length });
  } catch (err) {
    return errorResponse(res, err);
  }
}
