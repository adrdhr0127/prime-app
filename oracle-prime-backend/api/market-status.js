// api/market-status.js
// GET /api/market-status
// Returns whether US markets are currently open
// Cached 60 seconds

import { fhGet, setCacheHeaders, errorResponse } from './_finnhub.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const data = await fhGet('/stock/market-status', { exchange: 'US' });
    setCacheHeaders(res, 60);
    return res.json({
      isOpen:    data.isOpen,
      holiday:   data.holiday || null,
      session:   data.session || null,
      timezone:  data.timezone || 'America/New_York',
      t:         Date.now(),
    });
  } catch (err) {
    return errorResponse(res, err);
  }
}
