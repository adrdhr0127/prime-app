// api/index.js — Oracle Prime unified API handler
// Handles all /api/* routes in one serverless function
// Deploy this single file + vercel.json + package.json alongside index.html

const FINNHUB = 'https://finnhub.io/api/v1';

function key() {
  const k = process.env.FINNHUB_API_KEY;
  if (!k) throw Object.assign(new Error('FINNHUB_API_KEY not set in Vercel environment variables'), { status: 500 });
  return k;
}

async function fh(path, params = {}) {
  const url = new URL(FINNHUB + path);
  url.searchParams.set('token', key());
  for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, String(v));
  const r = await fetch(url.toString(), { signal: AbortSignal.timeout(8000) });
  if (!r.ok) {
    const msg = await r.text().catch(() => '');
    if (r.status === 429) throw Object.assign(new Error('Finnhub rate limit hit — wait 60s or upgrade plan at finnhub.io'), { status: 429 });
    if (r.status === 403) throw Object.assign(new Error('Invalid Finnhub API key — check FINNHUB_API_KEY in Vercel env vars'), { status: 401 });
    throw Object.assign(new Error(`Finnhub ${r.status}: ${msg.slice(0, 120)}`), { status: 502 });
  }
  return r.json();
}

function timeAgo(unix) {
  const ms = Date.now() - unix * 1000;
  if (ms < 60000) return 'Just now';
  if (ms < 3600000) return Math.floor(ms / 60000) + 'm ago';
  if (ms < 86400000) return Math.floor(ms / 3600000) + 'h ago';
  return Math.floor(ms / 86400000) + 'd ago';
}

// ── Route handlers ────────────────────────────────────────────────────────────

async function handleQuote(qs) {
  const sym = (qs.symbol || '').toUpperCase();
  if (!sym) throw Object.assign(new Error('symbol required'), { status: 400 });
  const d = await fh('/quote', { symbol: sym });
  if (!d.c && d.c !== 0) throw Object.assign(new Error(`No data for ${sym}`), { status: 404 });
  return { symbol: sym, price: d.c, change: d.d, changePct: d.dp, high: d.h, low: d.l, open: d.o, prevClose: d.pc, timestamp: d.t };
}

async function handleBatchQuotes(qs) {
  const syms = (qs.symbols || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean).slice(0, 30);
  if (!syms.length) throw Object.assign(new Error('symbols required'), { status: 400 });
  const results = await Promise.allSettled(syms.map(s => fh('/quote', { symbol: s }).then(d => ({ s, d }))));
  const quotes = {};
  results.forEach(r => {
    if (r.status === 'fulfilled' && r.value.d.c) {
      const { s, d } = r.value;
      quotes[s] = { symbol: s, price: d.c, change: d.d, changePct: d.dp, high: d.h, low: d.l, open: d.o, prevClose: d.pc, timestamp: d.t };
    }
  });
  return quotes;
}

async function handleCandles(qs) {
  const sym = (qs.symbol || '').toUpperCase();
  const resMap = { '1m':'1','5m':'5','15m':'15','30m':'30','1h':'60','D':'D','W':'W','M':'M' };
  const res = resMap[qs.interval] || qs.resolution || 'D';
  const now = Math.floor(Date.now() / 1000);
  const lookback = { '1': 86400, '5': 432000, '15': 864000, '30': 1728000, '60': 2592000, 'D': 31536000, 'W': 63072000, 'M': 157680000 };
  const from = qs.from || String(now - (lookback[res] || 31536000));
  const to = qs.to || String(now);
  const d = await fh('/stock/candle', { symbol: sym, resolution: res, from, to });
  if (d.s !== 'ok' || !d.c?.length) throw Object.assign(new Error(`No candle data for ${sym} at ${res}. Intraday bars require Finnhub paid plan.`), { status: 404 });
  const candles = d.t.map((t, i) => ({ t: t * 1000, o: d.o[i], h: d.h[i], l: d.l[i], c: d.c[i], v: d.v[i] }));
  return { symbol: sym, resolution: res, candles, count: candles.length };
}

async function handleNews(qs) {
  const sym = (qs.symbol || '').toUpperCase();
  const days = parseInt(qs.days) || 7;
  const to = new Date(), from = new Date(Date.now() - days * 86400000);
  const fmt = d => d.toISOString().split('T')[0];
  const d = await fh('/company-news', { symbol: sym, from: fmt(from), to: fmt(to) });
  const articles = (Array.isArray(d) ? d : []).slice(0, 20).map(a => ({
    id: a.id, title: a.headline || '', summary: a.summary || '', source: a.source || 'Finnhub',
    url: a.url || '', image: a.image || '', time: a.datetime ? timeAgo(a.datetime) : 'Recently',
    timestamp: a.datetime || 0, sentiment: a.sentiment === 1 ? 'positive' : a.sentiment === -1 ? 'negative' : 'neutral',
  }));
  return { symbol: sym, articles, count: articles.length };
}

async function handleMarketNews(qs) {
  const cat = ['general','forex','crypto','merger'].includes(qs.category) ? qs.category : 'general';
  const d = await fh('/news', { category: cat });
  const articles = (Array.isArray(d) ? d : []).slice(0, 15).map(a => ({
    headline: a.headline || '', source: a.source || 'Finnhub', url: a.url || '',
    image: a.image || '', time: a.datetime ? timeAgo(a.datetime) : 'Recently', timestamp: a.datetime || 0,
  }));
  return { category: cat, articles, count: articles.length };
}

async function handleMetrics(qs) {
  const sym = (qs.symbol || '').toUpperCase();
  const [mr, pr] = await Promise.allSettled([fh('/stock/metric', { symbol: sym, metric: 'all' }), fh('/stock/profile2', { symbol: sym })]);
  const m = mr.status === 'fulfilled' ? (mr.value.metric || {}) : {};
  const p = pr.status === 'fulfilled' ? pr.value : {};
  return {
    symbol: sym, name: p.name || sym, exchange: p.exchange, industry: p.finnhubIndustry,
    logo: p.logo, weburl: p.weburl, ipo: p.ipo,
    marketCap: p.marketCapitalization, shares: p.shareOutstanding,
    pe: m.peAnnual || m.peNTM, pb: m.pbAnnual, ps: m.psAnnual,
    eps: m.epsNormalizedAnnual || m.epsAnnual || m.epsNTM,
    bvps: m.bookValuePerShareAnnual, fcfps: m.freeCashFlowPerShareAnnual,
    dividend: m.dividendPerShareAnnual, roe: m.roeAnnual, roa: m.roaAnnual,
    netMargin: m.netMarginAnnual, grossMargin: m.grossMarginAnnual,
    debtEquity: m.totalDebt_totalEquityAnnual, currentRatio: m.currentRatioAnnual,
    revenueGrowth: m.revenueGrowthTTMYoy || m.revenueGrowth3Y,
    high52: m['52WeekHigh'], low52: m['52WeekLow'], beta: m.beta,
  };
}

async function handleSearch(qs) {
  const q = (qs.q || '').trim();
  if (!q) throw Object.assign(new Error('q required'), { status: 400 });
  const d = await fh('/search', { q });
  const results = (d.result || []).filter(r => r.type === 'Common Stock' || r.type === 'ETP').slice(0, 15)
    .map(r => ({ symbol: r.symbol, description: r.description, type: r.type, exchange: r.primaryExchange || '' }));
  return { query: q, results, count: results.length };
}

async function handleInsiders(qs) {
  const sym = (qs.symbol || '').toUpperCase();
  const d = await fh('/stock/insider-transactions', { symbol: sym });
  const transactions = (d.data || []).slice(0, 20).map(tx => ({
    name: tx.name || 'Insider', title: tx.reportedTitle || '',
    transactionType: tx.transactionType || '', change: tx.change || 0,
    shares: Math.abs(tx.share || tx.change || 0), value: tx.value || 0,
    filingDate: tx.filingDate || '', transactionDate: tx.transactionDate || '',
    isBuy: (tx.transactionType || '').toLowerCase().includes('purchase') || (tx.change || 0) > 0,
  }));
  return { symbol: sym, transactions, count: transactions.length };
}

async function handleRecommendations(qs) {
  const sym = (qs.symbol || '').toUpperCase();
  const d = await fh('/stock/recommendation', { symbol: sym });
  const latest = Array.isArray(d) ? d[0] : null;
  if (!latest) throw Object.assign(new Error('No recommendation data'), { status: 404 });
  const total = (latest.buy||0)+(latest.hold||0)+(latest.sell||0)+(latest.strongBuy||0)+(latest.strongSell||0);
  const consensus = total === 0 ? 'N/A' : (latest.strongBuy+latest.buy)/total > 0.6 ? 'Buy' : (latest.strongSell+latest.sell)/total > 0.4 ? 'Sell' : 'Hold';
  return { symbol: sym, period: latest.period, strongBuy: latest.strongBuy||0, buy: latest.buy||0, hold: latest.hold||0, sell: latest.sell||0, strongSell: latest.strongSell||0, total, consensus };
}

async function handleEarnings(qs) {
  const sym = (qs.symbol || '').toUpperCase();
  const now = new Date(), future = new Date(Date.now() + 90*86400000);
  const fmt = d => d.toISOString().split('T')[0];
  const [hist, cal] = await Promise.allSettled([
    fh('/stock/earnings', { symbol: sym, limit: '4' }),
    fh('/calendar/earnings', { from: fmt(now), to: fmt(future), symbol: sym }),
  ]);
  const history = hist.status === 'fulfilled' ? (hist.value||[]).slice(0,4).map(e => ({
    period: e.period, date: e.date, epsActual: e.actual, epsEstimate: e.estimate,
    epsSurprise: e.surprise, epsSurprisePct: e.surprisePercent,
  })) : [];
  const next = cal.status === 'fulfilled' ? (cal.value?.earningsCalendar||[]).find(e => e.symbol === sym) : null;
  return { symbol: sym, next: next ? { date: next.date, epsEstimate: next.epsEstimate, hour: next.hour } : null, history };
}

async function handleMarketStatus() {
  const d = await fh('/stock/market-status', { exchange: 'US' });
  return { isOpen: d.isOpen, holiday: d.holiday || null, session: d.session || null, t: Date.now() };
}

// Simple in-memory rate limiter for ws-token
const wsRequests = new Map();
function wsRateLimited(ip) {
  const now = Date.now(), e = wsRequests.get(ip) || { n: 0, t: now };
  if (now - e.t > 60000) { wsRequests.set(ip, { n: 1, t: now }); return false; }
  e.n++; wsRequests.set(ip, e); return e.n > 30;
}

async function handleWsToken(req) {
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0] || 'unknown';
  if (wsRateLimited(ip)) throw Object.assign(new Error('Too many requests'), { status: 429 });
  const token = key();
  return { token, wsUrl: 'wss://ws.finnhub.io', expiresHint: Date.now() + 3600000 };
}

// ── Cache seconds per route ───────────────────────────────────────────────────
const CACHE = {
  quote: 15, 'batch-quotes': 15, candles: 60, news: 300, 'market-news': 300,
  metrics: 3600, search: 3600, insiders: 3600, recommendations: 21600,
  earnings: 21600, 'market-status': 60, 'ws-token': 0,
};

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Extract route from URL: /api/quote → 'quote', /api/batch-quotes → 'batch-quotes'
  const route = (req.url || '').replace(/^\/api\//, '').split('?')[0].split('/')[0];
  const qs = req.query || {};

  const cacheSec = CACHE[route];
  if (cacheSec > 0) {
    res.setHeader('Cache-Control', `s-maxage=${cacheSec}, stale-while-revalidate=${cacheSec * 2}`);
  } else {
    res.setHeader('Cache-Control', 'no-store, no-cache');
  }

  try {
    let data;
    switch (route) {
      case 'quote':           data = await handleQuote(qs); break;
      case 'batch-quotes':    data = await handleBatchQuotes(qs); break;
      case 'candles':         data = await handleCandles(qs); break;
      case 'news':            data = await handleNews(qs); break;
      case 'market-news':     data = await handleMarketNews(qs); break;
      case 'metrics':         data = await handleMetrics(qs); break;
      case 'search':          data = await handleSearch(qs); break;
      case 'insiders':        data = await handleInsiders(qs); break;
      case 'recommendations': data = await handleRecommendations(qs); break;
      case 'earnings':        data = await handleEarnings(qs); break;
      case 'market-status':   data = await handleMarketStatus(); break;
      case 'ws-token':        data = await handleWsToken(req); break;
      default: return res.status(404).json({ error: `Unknown route: /api/${route}` });
    }
    return res.json(data);
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message });
  }
}
