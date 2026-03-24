// api/_finnhub.js - Shared Finnhub API helper
// All endpoints share this module for consistent error handling

const BASE = 'https://finnhub.io/api/v1';

export function getKey() {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) throw new Error('FINNHUB_API_KEY environment variable not set. Add it in Vercel dashboard → Project Settings → Environment Variables.');
  return key;
}

export async function fhGet(path, params = {}) {
  const key = getKey();
  const url = new URL(BASE + path);
  url.searchParams.set('token', key);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': 'OraclePrime/1.0' },
    signal: AbortSignal.timeout(8000)
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (res.status === 429) throw new Error('Finnhub rate limit reached. Upgrade your plan at finnhub.io for higher limits.');
    if (res.status === 403) throw new Error('Invalid or expired Finnhub API key. Check your FINNHUB_API_KEY environment variable.');
    throw new Error(`Finnhub API error ${res.status}: ${text.slice(0, 200)}`);
  }

  return res.json();
}

export function setCacheHeaders(res, seconds = 15) {
  res.setHeader('Cache-Control', `s-maxage=${seconds}, stale-while-revalidate=${seconds * 2}`);
}

export function errorResponse(res, err) {
  const status = err.message.includes('rate limit') ? 429 : err.message.includes('API key') ? 401 : 500;
  res.status(status).json({ error: err.message });
}
