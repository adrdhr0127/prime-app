// api/earnings.js
// GET /api/earnings?symbol=AAPL
// Returns upcoming and historical earnings data
// Cached 6 hours

import { fhGet, setCacheHeaders, errorResponse } from './_finnhub.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { symbol } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol required' });

  try {
    const [history, calendar] = await Promise.allSettled([
      fhGet('/stock/earnings', { symbol: symbol.toUpperCase(), limit: '4' }),
      fhGet('/calendar/earnings', {
        from: new Date().toISOString().split('T')[0],
        to:   new Date(Date.now() + 90*86400000).toISOString().split('T')[0],
        symbol: symbol.toUpperCase(),
      }),
    ]);

    const historicalEarnings = history.status === 'fulfilled' ? (history.value || []).slice(0, 4).map(e => ({
      period:           e.period,
      date:             e.date,
      epsActual:        e.actual,
      epsEstimate:      e.estimate,
      epsSurprise:      e.surprise,
      epsSurprisePct:   e.surprisePercent,
      revenueActual:    e.revenueActual   || null,
      revenueEstimate:  e.revenueEstimate || null,
    })) : [];

    const nextEarnings = calendar.status === 'fulfilled'
      ? (calendar.value?.earningsCalendar || []).find(e => e.symbol === symbol.toUpperCase())
      : null;

    setCacheHeaders(res, 21600);
    return res.json({
      symbol: symbol.toUpperCase(),
      next: nextEarnings ? {
        date:            nextEarnings.date,
        epsEstimate:     nextEarnings.epsEstimate,
        revenueEstimate: nextEarnings.revenueEstimate,
        hour:            nextEarnings.hour, // 'bmo' = before open, 'amc' = after close
      } : null,
      history: historicalEarnings,
    });
  } catch (err) {
    return errorResponse(res, err);
  }
}
