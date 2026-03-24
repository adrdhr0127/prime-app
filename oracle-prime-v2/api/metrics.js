// api/metrics.js
// GET /api/metrics?symbol=AAPL
// Returns comprehensive fundamental data: P/E, EPS, BV, ROE, 52-week range, etc.
// Cached 1 hour (fundamental data doesn't change often)

import { fhGet, setCacheHeaders, errorResponse } from './_finnhub.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { symbol } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol required' });

  const s = symbol.toUpperCase();

  try {
    const [metricsData, profileData] = await Promise.allSettled([
      fhGet('/stock/metric', { symbol: s, metric: 'all' }),
      fhGet('/stock/profile2', { symbol: s }),
    ]);

    const m = metricsData.status === 'fulfilled' ? (metricsData.value.metric || {}) : {};
    const p = profileData.status === 'fulfilled' ? metricsData.value : {};
    const prof = profileData.status === 'fulfilled' ? profileData.value : {};

    return res.json({
      symbol: s,
      // Valuation
      pe:           m.peAnnual        || m.peNTM        || null,
      pb:           m.pbAnnual                           || null,
      ps:           m.psAnnual                           || null,
      ev_ebitda:    m.evEbitdaAnnual                    || null,
      // Per-share metrics
      eps:          m.epsNormalizedAnnual || m.epsAnnual || m.epsNTM || null,
      bvps:         m.bookValuePerShareAnnual            || null,
      fcfps:        m.freeCashFlowPerShareAnnual         || null,
      revenue_ps:   m.revenuePerShareAnnual              || null,
      dividend:     m.dividendPerShareAnnual             || null,
      // Growth
      revenueGrowth:    m.revenueGrowthTTMYoy           || m.revenueGrowth3Y || null,
      epsGrowth:        m.epsGrowth3Y                   || null,
      // Profitability
      roe:          m.roeAnnual                         || null,
      roa:          m.roaAnnual                         || null,
      netMargin:    m.netMarginAnnual                   || null,
      grossMargin:  m.grossMarginAnnual                 || null,
      // Health
      debtEquity:   m.totalDebt_totalEquityAnnual       || null,
      currentRatio: m.currentRatioAnnual                || null,
      // Price stats
      high52:       m['52WeekHigh']                     || null,
      low52:        m['52WeekLow']                      || null,
      beta:         m.beta                              || null,
      // Market
      marketCap:    prof.marketCapitalization           || null,
      shares:       prof.shareOutstanding               || null,
      exchange:     prof.exchange                       || null,
      industry:     prof.finnhubIndustry               || null,
      sector:       prof.gsubInd                        || null,
      name:         prof.name                           || s,
      logo:         prof.logo                           || null,
      weburl:       prof.weburl                         || null,
      ipo:          prof.ipo                            || null,
    });
  } catch (err) {
    return errorResponse(res, err);
  }
}
