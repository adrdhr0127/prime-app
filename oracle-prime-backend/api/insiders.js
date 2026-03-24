// api/insiders.js
// GET /api/insiders?symbol=AAPL
// Returns insider transactions from Form 4 filings
// Cached 1 hour

import { fhGet, setCacheHeaders, errorResponse } from './_finnhub.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { symbol, limit = '20' } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol required' });

  try {
    const data = await fhGet('/stock/insider-transactions', { symbol: symbol.toUpperCase() });

    const transactions = (data.data || []).slice(0, parseInt(limit) || 20).map(tx => ({
      name:            tx.name            || 'Insider',
      title:           tx.reportedTitle   || '',
      transactionType: tx.transactionType || '',
      change:          tx.change          || 0,
      shares:          Math.abs(tx.share  || tx.change || 0),
      value:           tx.value           || 0,
      price:           tx.value && tx.share ? tx.value / tx.share : null,
      filingDate:      tx.filingDate      || '',
      transactionDate: tx.transactionDate || '',
      isBuy:           (tx.transactionType || '').toLowerCase().includes('purchase') || (tx.change || 0) > 0,
    }));

    setCacheHeaders(res, 3600);
    return res.json({ symbol: symbol.toUpperCase(), transactions, count: transactions.length });
  } catch (err) {
    return errorResponse(res, err);
  }
}
