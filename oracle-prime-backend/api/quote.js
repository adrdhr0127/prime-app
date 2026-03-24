// api/quote.js
// GET /api/quote?symbol=AAPL
// Returns real-time quote: {c, d, dp, h, l, o, pc, t}
// Cached 15 seconds at Vercel edge

import { fhGet, setCacheHeaders, errorResponse } from './_finnhub.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { symbol } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol parameter required' });

  try {
    const data = await fhGet('/quote', { symbol: symbol.toUpperCase() });

    // Validate response has actual data
    if (!data.c && data.c !== 0) {
      return res.status(404).json({ error: `No quote data found for ${symbol}. Ensure symbol is a valid US stock ticker.` });
    }

    setCacheHeaders(res, 15); // Cache 15 seconds
    return res.json({
      symbol: symbol.toUpperCase(),
      price:     data.c,
      change:    data.d,
      changePct: data.dp,
      high:      data.h,
      low:       data.l,
      open:      data.o,
      prevClose: data.pc,
      timestamp: data.t,
    });
  } catch (err) {
    return errorResponse(res, err);
  }
}
