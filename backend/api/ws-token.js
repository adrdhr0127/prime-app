// api/ws-token.js
// GET /api/ws-token
// Issues a short-lived WebSocket token for Finnhub streaming
// The key is returned to the browser ONLY for WebSocket use - never stored in the HTML
// Rate limited to prevent abuse

import { getKey, errorResponse } from './_finnhub.js';

// Simple in-memory rate limiter (resets with each function cold start)
const requests = new Map();
const WINDOW_MS  = 60000; // 1 minute window
const MAX_REQ    = 30;    // max 30 requests per IP per minute

function isRateLimited(ip) {
  const now = Date.now();
  const entry = requests.get(ip) || { count: 0, start: now };
  if (now - entry.start > WINDOW_MS) {
    requests.set(ip, { count: 1, start: now });
    return false;
  }
  entry.count++;
  requests.set(ip, entry);
  return entry.count > MAX_REQ;
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket?.remoteAddress || 'unknown';
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Too many requests. Please wait before refreshing.' });
  }

  try {
    const token = getKey();
    // Return the token with short-lived expiry hint
    res.setHeader('Cache-Control', 'no-store, no-cache');
    return res.json({
      token,
      wsUrl: 'wss://ws.finnhub.io',
      expiresHint: Date.now() + 3600000, // hint for client to re-request after 1hr
    });
  } catch (err) {
    return errorResponse(res, err);
  }
}
