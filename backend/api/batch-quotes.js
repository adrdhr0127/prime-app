// api/batch-quotes.js
// GET /api/batch-quotes?symbols=AAPL,TSLA,NVDA,SPY
// Returns array of quotes for multiple symbols in parallel
// Cached 15 seconds at Vercel edge

import { fhGet, setCacheHeaders, errorResponse, getKey } from './_finnhub.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { symbols } = req.query;
  if (!symbols) return res.status(400).json({ error: 'symbols parameter required (comma-separated)' });

  const tickers = symbols.split(',').map(s => s.trim().toUpperCase()).filter(Boolean).slice(0, 30);
  if (!tickers.length) return res.status(400).json({ error: 'No valid symbols provided' });

  // Validate key exists early
  try { getKey(); } catch (e) { return errorResponse(res, e); }

  // Fetch all quotes in parallel with individual error handling
  const results = await Promise.allSettled(
    tickers.map(symbol =>
      fhGet('/quote', { symbol }).then(data => ({
        symbol,
        price:     data.c,
        change:    data.d,
        changePct: data.dp,
        high:      data.h,
        low:       data.l,
        open:      data.o,
        prevClose: data.pc,
        timestamp: data.t,
      }))
    )
  );

  const quotes = {};
  results.forEach((result, i) => {
    if (result.status === 'fulfilled' && result.value.price) {
      quotes[tickers[i]] = result.value;
    }
  });

  setCacheHeaders(res, 15);
  return res.json(quotes);
}
