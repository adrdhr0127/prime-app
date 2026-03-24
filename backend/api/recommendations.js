// api/recommendations.js
// GET /api/recommendations?symbol=AAPL
// Returns latest analyst buy/hold/sell counts
// Cached 6 hours

import { fhGet, setCacheHeaders, errorResponse } from './_finnhub.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { symbol } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol required' });

  try {
    const data = await fhGet('/stock/recommendation', { symbol: symbol.toUpperCase() });

    const latest = Array.isArray(data) ? data[0] : null;
    if (!latest) return res.status(404).json({ error: 'No recommendation data found' });

    const total = (latest.buy||0) + (latest.hold||0) + (latest.sell||0) + (latest.strongBuy||0) + (latest.strongSell||0);

    setCacheHeaders(res, 21600); // 6 hours
    return res.json({
      symbol:      symbol.toUpperCase(),
      period:      latest.period,
      strongBuy:   latest.strongBuy   || 0,
      buy:         latest.buy         || 0,
      hold:        latest.hold        || 0,
      sell:        latest.sell        || 0,
      strongSell:  latest.strongSell  || 0,
      total,
      consensus:   total === 0 ? 'N/A' :
                   (latest.strongBuy + latest.buy) / total > 0.6 ? 'Buy' :
                   (latest.strongSell + latest.sell) / total > 0.4 ? 'Sell' : 'Hold',
    });
  } catch (err) {
    return errorResponse(res, err);
  }
}
