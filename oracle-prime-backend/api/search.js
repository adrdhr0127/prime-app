// api/search.js
// GET /api/search?q=apple
// Returns matching ticker symbols and company names
// Cached 1 hour

import { fhGet, setCacheHeaders, errorResponse } from './_finnhub.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { q } = req.query;
  if (!q || q.length < 1) return res.status(400).json({ error: 'q parameter required (search query)' });

  try {
    const data = await fhGet('/search', { q: q.trim() });

    const results = (data.result || [])
      .filter(r => r.type === 'Common Stock' || r.type === 'ETP') // Only stocks and ETFs
      .slice(0, 15)
      .map(r => ({
        symbol:      r.symbol,
        description: r.description,
        type:        r.type,
        exchange:    r.primaryExchange || '',
      }));

    setCacheHeaders(res, 3600); // 1 hour cache
    return res.json({ query: q, results, count: results.length });
  } catch (err) {
    return errorResponse(res, err);
  }
}
