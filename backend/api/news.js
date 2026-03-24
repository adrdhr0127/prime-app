// api/news.js
// GET /api/news?symbol=AAPL&days=7
// Returns recent company news from Finnhub (Benzinga feed)
// Cached 5 minutes

import { fhGet, setCacheHeaders, errorResponse } from './_finnhub.js';

function timeAgo(unixSeconds) {
  const ms = Date.now() - unixSeconds * 1000;
  if (ms < 60000)     return 'Just now';
  if (ms < 3600000)   return Math.floor(ms / 60000) + ' min ago';
  if (ms < 86400000)  return Math.floor(ms / 3600000) + ' hr ago';
  return Math.floor(ms / 86400000) + ' days ago';
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { symbol, days = '7' } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol required' });

  const to   = new Date();
  const from = new Date(Date.now() - parseInt(days) * 86400000);
  const fmt  = d => d.toISOString().split('T')[0];

  try {
    const data = await fhGet('/company-news', {
      symbol: symbol.toUpperCase(),
      from: fmt(from),
      to:   fmt(to),
    });

    if (!Array.isArray(data)) {
      return res.status(200).json({ symbol, articles: [] });
    }

    const articles = data.slice(0, 20).map(item => ({
      id:        item.id,
      title:     item.headline || '',
      summary:   item.summary  || '',
      source:    item.source   || 'Finnhub',
      url:       item.url      || '',
      image:     item.image    || '',
      time:      item.datetime ? timeAgo(item.datetime) : 'Recently',
      timestamp: item.datetime || 0,
      category:  item.category || '',
      sentiment: item.sentiment === 1 ? 'positive' : item.sentiment === -1 ? 'negative' : 'neutral',
      related:   item.related  || symbol.toUpperCase(),
    }));

    setCacheHeaders(res, 300); // 5 min cache
    return res.json({ symbol, articles, count: articles.length });
  } catch (err) {
    return errorResponse(res, err);
  }
}
