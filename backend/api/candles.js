// api/candles.js
// GET /api/candles?symbol=AAPL&resolution=D&from=1700000000&to=1730000000
// Returns OHLCV candle array: [{o,h,l,c,v,t}, ...]
// Cache duration varies by resolution

import { fhGet, setCacheHeaders, errorResponse } from './_finnhub.js';

const CACHE_BY_RES = {
  '1':  60,       // 1-minute bars: 1 min cache
  '5':  300,      // 5-minute bars: 5 min cache
  '15': 900,      // 15-minute bars: 15 min cache
  '30': 900,      // 30-minute bars: 15 min cache
  '60': 1800,     // 1-hour bars: 30 min cache
  'D':  3600,     // daily bars: 1 hour cache
  'W':  86400,    // weekly bars: 1 day cache
  'M':  86400,    // monthly bars: 1 day cache
};

// Map frontend interval names to Finnhub resolution codes
const INTERVAL_MAP = {
  '1m':  '1',
  '5m':  '5',
  '15m': '15',
  '30m': '30',
  '1h':  '60',
  'D':   'D',
  'W':   'W',
  'M':   'M',
};

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  let { symbol, resolution, from, to, interval } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol required' });

  // Accept either ?resolution=D or ?interval=D
  if (interval && !resolution) resolution = INTERVAL_MAP[interval] || interval;
  resolution = resolution || 'D';
  symbol = symbol.toUpperCase();

  const now = Math.floor(Date.now() / 1000);

  // Default lookback if not specified
  if (!from) {
    const lookback = { '1':'86400', '5':'432000', '15':'864000', '30':'1728000',
                       '60':'2592000', 'D':'31536000', 'W':'63072000', 'M':'157680000' };
    from = String(now - parseInt(lookback[resolution] || '31536000'));
  }
  if (!to) to = String(now);

  try {
    const data = await fhGet('/stock/candle', { symbol, resolution, from, to });

    if (data.s !== 'ok' || !data.c || !data.c.length) {
      // Try with a wider range on empty
      return res.status(404).json({
        error: `No candle data for ${symbol} at ${resolution} resolution. Symbol may not support intraday data on the free tier.`
      });
    }

    // Transform to Oracle Prime format
    const candles = data.t.map((t, i) => ({
      t: t * 1000, // ms
      o: data.o[i],
      h: data.h[i],
      l: data.l[i],
      c: data.c[i],
      v: data.v[i],
    }));

    setCacheHeaders(res, CACHE_BY_RES[resolution] || 60);
    return res.json({ symbol, resolution, candles, count: candles.length });
  } catch (err) {
    return errorResponse(res, err);
  }
}
