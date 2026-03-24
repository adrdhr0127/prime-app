# Oracle Prime — Full-Stack Deployment Guide

## Architecture

```
Browser (index.html)
      ↓  /api/*
Vercel Edge (cache layer)
      ↓  node.js
Serverless Functions (api/*.js)
      ↓  HTTPS
Finnhub.io REST API / WebSocket
```

**Your Finnhub API key never touches the browser.** It lives only in Vercel environment variables, accessed server-side by the functions.

---

## Step 1 — Get a Finnhub API Key

1. Go to [finnhub.io](https://finnhub.io) → Sign Up (free)
2. Dashboard → API Keys → copy your key
3. Free tier: 60 requests/minute, real-time US quotes, WebSocket streaming

---

## Step 2 — Set Up Your GitHub Repo

Your repo needs this exact structure:

```
oracle-prime/          ← your repo root
  index.html           ← the frontend (from this package)
  vercel.json          ← routing config
  package.json         ← declares ES module type
  api/
    _finnhub.js        ← shared Finnhub helper
    quote.js           ← GET /api/quote?symbol=AAPL
    batch-quotes.js    ← GET /api/batch-quotes?symbols=AAPL,TSLA
    candles.js         ← GET /api/candles?symbol=AAPL&interval=D
    news.js            ← GET /api/news?symbol=AAPL
    market-news.js     ← GET /api/market-news
    metrics.js         ← GET /api/metrics?symbol=AAPL
    search.js          ← GET /api/search?q=apple
    insiders.js        ← GET /api/insiders?symbol=AAPL
    recommendations.js ← GET /api/recommendations?symbol=AAPL
    earnings.js        ← GET /api/earnings?symbol=AAPL
    market-status.js   ← GET /api/market-status
    ws-token.js        ← GET /api/ws-token (WebSocket auth)
```

**Option A — Replace existing repo files:**
1. Delete everything in your `oracle-prime` GitHub repo
2. Upload all files from this package (drag-and-drop works in GitHub UI)
3. Or use: `git clone`, replace files, `git push`

**Option B — GitHub CLI (fastest):**
```bash
git clone https://github.com/YOUR_USERNAME/oracle-prime
cd oracle-prime
# Copy all files from this package here
git add -A
git commit -m "feat: real backend with Vercel serverless functions"
git push
```

---

## Step 3 — Add Environment Variable in Vercel

1. Go to [vercel.com/dashboard](https://vercel.com/dashboard)
2. Click your **oracle-prime** project
3. **Settings** tab → **Environment Variables**
4. Click **Add New**:
   - **Key:** `FINNHUB_API_KEY`
   - **Value:** your Finnhub API key (starts with `c...`)
   - **Environments:** check Production, Preview, and Development
5. Click **Save**
6. Go to **Deployments** tab → click the latest deployment → **Redeploy**

That's it. Vercel will rebuild and your app will have live data.

---

## Step 4 — Verify It's Working

Once deployed, open your app URL and:

1. Open **Settings ⚙** → you'll see a green **"Backend Connected"** status with a live SPY price
2. Click **Test** to ping the backend right now
3. Load any stock — prices update every 12 seconds from real Finnhub data
4. Open the **News** tab — live Benzinga headlines load automatically
5. Turn on **RSI / MACD / indicators** — all calculated from real OHLCV candle data

---

## API Endpoints Reference

| Endpoint | Parameters | Cache | Description |
|---|---|---|---|
| `GET /api/quote` | `symbol` | 15s | Real-time price + OHLCV |
| `GET /api/batch-quotes` | `symbols` (csv) | 15s | Multiple quotes in one call |
| `GET /api/candles` | `symbol`, `interval`, `from`, `to` | 1min–1day | OHLCV bars |
| `GET /api/news` | `symbol`, `days` | 5min | Company news (Benzinga) |
| `GET /api/market-news` | `category`, `limit` | 5min | General market headlines |
| `GET /api/metrics` | `symbol` | 1hr | P/E, EPS, BV, ROE, 52wk range |
| `GET /api/search` | `q` | 1hr | Symbol/company search |
| `GET /api/insiders` | `symbol`, `limit` | 1hr | Form 4 insider transactions |
| `GET /api/recommendations` | `symbol` | 6hr | Analyst buy/hold/sell |
| `GET /api/earnings` | `symbol` | 6hr | Earnings calendar + history |
| `GET /api/market-status` | — | 1min | Is US market open? |
| `GET /api/ws-token` | — | no-cache | WebSocket auth token |

---

## Troubleshooting

**"FINNHUB_API_KEY environment variable not set"**
→ You haven't added the env var in Vercel yet. Follow Step 3 above.

**"Finnhub rate limit reached"**  
→ Free tier: 60 req/min. The app batches watchlist quotes into one call. If you hit limits, upgrade your Finnhub plan or reduce watchlist size.

**"No candle data for AAPL at 1 resolution"**  
→ Intraday (1m/5m) candles require a Finnhub paid plan. Daily (D), Weekly (W), and Monthly (M) candles work on free tier.

**Backend status shows red**  
→ Check Vercel → Functions logs for the specific error. Most common: missing env var or Finnhub key typo.

**WebSocket not connecting**  
→ WebSocket streaming works on Finnhub free tier. If it fails, the app falls back to REST polling every 12 seconds automatically.

---

## Upgrading to Finnhub Paid ($50/mo Starter)

Unlocks:
- Intraday candles (1min, 5min, 15min, 30min, 1hr)  
- Higher rate limits (300 req/min)
- WebSocket for unlimited symbols simultaneously
- More historical data depth

No code changes needed — just upgrade your Finnhub account and everything starts working.
