require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const db = require('./db');

const FINNHUB_KEY = process.env.FINNHUB_API_KEY;
const FINNHUB_BASE = 'https://finnhub.io/api/v1';
const FINNHUB_WS = 'wss://ws.finnhub.io';

if (!FINNHUB_KEY) {
  console.error('❌ FINNHUB_API_KEY not set in .env');
  process.exit(1);
}

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // serves index.html from /public

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// ---------- WebSocket: forward Finnhub live trades ----------
let finnhubWs = null;
const clientSubscriptions = new Map(); // client -> Set(symbols)
const globalSubscriptions = new Map(); // symbol -> Set(clients)

function startFinnhubWs() {
  if (finnhubWs && finnhubWs.readyState === WebSocket.OPEN) return;

  finnhubWs = new WebSocket(`${FINNHUB_WS}?token=${FINNHUB_KEY}`);

  finnhubWs.on('open', () => {
    console.log('Connected to Finnhub WebSocket');
  });

  finnhubWs.on('message', (data) => {
    const msg = JSON.parse(data);
    if (msg.type === 'trade' && msg.data) {
      msg.data.forEach(trade => {
        const symbol = trade.s;
        const clients = globalSubscriptions.get(symbol);
        if (clients) {
          const payload = JSON.stringify({ type: 'trade', data: [trade] });
          clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(payload);
            }
          });
        }
      });
    }
    if (msg.type === 'ping') {
      finnhubWs.send(JSON.stringify({ type: 'pong' }));
    }
  });

  finnhubWs.on('close', () => {
    console.log('Finnhub WS disconnected, reconnecting in 5s...');
    finnhubWs = null;
    setTimeout(startFinnhubWs, 5000);
  });

  finnhubWs.on('error', (err) => {
    console.error('Finnhub WS error:', err.message);
  });
}

wss.on('connection', (ws) => {
  clientSubscriptions.set(ws, new Set());

  ws.on('message', (message) => {
    try {
      const msg = JSON.parse(message);
      if (msg.type === 'subscribe') {
        const symbol = msg.symbol;
        const subs = clientSubscriptions.get(ws);
        if (!subs.has(symbol)) {
          subs.add(symbol);
          let clients = globalSubscriptions.get(symbol);
          if (!clients) {
            clients = new Set();
            globalSubscriptions.set(symbol, clients);
            if (finnhubWs && finnhubWs.readyState === WebSocket.OPEN) {
              finnhubWs.send(JSON.stringify({ type: 'subscribe', symbol }));
            }
          }
          clients.add(ws);
        }
      } else if (msg.type === 'unsubscribe') {
        const symbol = msg.symbol;
        const subs = clientSubscriptions.get(ws);
        if (subs.delete(symbol)) {
          const clients = globalSubscriptions.get(symbol);
          if (clients) {
            clients.delete(ws);
            if (clients.size === 0) {
              globalSubscriptions.delete(symbol);
              if (finnhubWs && finnhubWs.readyState === WebSocket.OPEN) {
                finnhubWs.send(JSON.stringify({ type: 'unsubscribe', symbol }));
              }
            }
          }
        }
      }
    } catch (err) {}
  });

  ws.on('close', () => {
    const subs = clientSubscriptions.get(ws);
    if (subs) {
      subs.forEach(symbol => {
        const clients = globalSubscriptions.get(symbol);
        if (clients) {
          clients.delete(ws);
          if (clients.size === 0) {
            globalSubscriptions.delete(symbol);
            if (finnhubWs && finnhubWs.readyState === WebSocket.OPEN) {
              finnhubWs.send(JSON.stringify({ type: 'unsubscribe', symbol }));
            }
          }
        }
      });
    }
    clientSubscriptions.delete(ws);
  });
});

startFinnhubWs();

// ---------- REST endpoints ----------
async function fetchFromFinnhub(endpoint) {
  const url = `${FINNHUB_BASE}${endpoint}&token=${FINNHUB_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Finnhub error ${res.status}`);
  return res.json();
}

// Quote
app.get('/api/quote/:symbol', async (req, res) => {
  try {
    const data = await fetchFromFinnhub(`/quote?symbol=${req.params.symbol}`);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Candles
app.get('/api/candles/:symbol', async (req, res) => {
  const { symbol } = req.params;
  const { resolution, from, to } = req.query;
  if (!resolution || !from || !to) {
    return res.status(400).json({ error: 'Missing resolution, from, or to' });
  }
  try {
    const data = await fetchFromFinnhub(`/stock/candle?symbol=${symbol}&resolution=${resolution}&from=${from}&to=${to}`);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Company news
app.get('/api/news/:symbol', async (req, res) => {
  const { symbol } = req.params;
  const { days = 7 } = req.query;
  const to = new Date();
  const from = new Date(to - days * 86400000);
  const fromStr = from.toISOString().split('T')[0];
  const toStr = to.toISOString().split('T')[0];
  try {
    const data = await fetchFromFinnhub(`/company-news?symbol=${symbol}&from=${fromStr}&to=${toStr}`);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Market news
app.get('/api/market-news', async (req, res) => {
  const { category = 'general' } = req.query;
  try {
    const data = await fetchFromFinnhub(`/news?category=${category}`);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Insider transactions
app.get('/api/insiders/:symbol', async (req, res) => {
  try {
    const data = await fetchFromFinnhub(`/stock/insider-transactions?symbol=${req.params.symbol}`);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- Paper trading endpoints (demo user) ----------
const DEMO_USER_ID = 1;

db.get('SELECT id FROM users WHERE id = ?', DEMO_USER_ID, (err, row) => {
  if (!row) {
    db.run('INSERT INTO users (id, username, password) VALUES (?, ?, ?)', [DEMO_USER_ID, 'demo', 'demo']);
    db.run('INSERT INTO paper_accounts (user_id, balance) VALUES (?, ?)', [DEMO_USER_ID, 100000]);
  }
});

app.get('/api/paper/account', (req, res) => {
  db.get('SELECT balance FROM paper_accounts WHERE user_id = ?', DEMO_USER_ID, (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(row || { balance: 100000 });
  });
});

app.get('/api/paper/positions', (req, res) => {
  db.all('SELECT symbol, shares, avg_cost, name, entry_date, high_price, low_price FROM paper_positions WHERE user_id = ?', DEMO_USER_ID, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get('/api/paper/orders', (req, res) => {
  db.all('SELECT * FROM paper_orders WHERE user_id = ? ORDER BY time DESC', DEMO_USER_ID, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get('/api/paper/equity', (req, res) => {
  db.all('SELECT timestamp, value FROM paper_equity WHERE user_id = ? ORDER BY timestamp', DEMO_USER_ID, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/paper/trade', (req, res) => {
  const { side, symbol, shares, price, total, pnl, pnlPct, tif, status } = req.body;
  const now = Date.now();
  db.serialize(() => {
    db.get('SELECT balance FROM paper_accounts WHERE user_id = ?', DEMO_USER_ID, (err, row) => {
      let newBalance = row.balance;
      if (side === 'buy') newBalance -= total;
      else newBalance += total;
      db.run('UPDATE paper_accounts SET balance = ? WHERE user_id = ?', [newBalance, DEMO_USER_ID]);

      if (side === 'buy') {
        db.get('SELECT shares, avg_cost FROM paper_positions WHERE user_id = ? AND symbol = ?', [DEMO_USER_ID, symbol], (err, pos) => {
          const existingShares = pos ? pos.shares : 0;
          const existingCost = pos ? pos.avg_cost : 0;
          const newShares = existingShares + shares;
          const newAvg = (existingCost * existingShares + total) / newShares;
          db.run('INSERT OR REPLACE INTO paper_positions (user_id, symbol, shares, avg_cost, name, entry_date, high_price, low_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [DEMO_USER_ID, symbol, newShares, newAvg, '', now, price, price]);
        });
      } else {
        db.get('SELECT shares, avg_cost FROM paper_positions WHERE user_id = ? AND symbol = ?', [DEMO_USER_ID, symbol], (err, pos) => {
          if (!pos) return;
          const newShares = pos.shares - shares;
          if (newShares <= 0) {
            db.run('DELETE FROM paper_positions WHERE user_id = ? AND symbol = ?', [DEMO_USER_ID, symbol]);
          } else {
            db.run('UPDATE paper_positions SET shares = ? WHERE user_id = ? AND symbol = ?', [newShares, DEMO_USER_ID, symbol]);
          }
        });
      }

      db.run(`INSERT INTO paper_orders (user_id, type, symbol, shares, price, total, pnl, pnl_pct, tif, time, status)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [DEMO_USER_ID, side.toUpperCase(), symbol, shares, price, total, pnl, pnlPct, tif, now, status]);

      db.run('INSERT INTO paper_equity (user_id, timestamp, value) VALUES (?, ?, ?)', [DEMO_USER_ID, now, newBalance]);

      res.json({ success: true });
    });
  });
});

app.post('/api/paper/reset', (req, res) => {
  const { balance } = req.body;
  db.serialize(() => {
    db.run('UPDATE paper_accounts SET balance = ? WHERE user_id = ?', [balance, DEMO_USER_ID]);
    db.run('DELETE FROM paper_positions WHERE user_id = ?', DEMO_USER_ID);
    db.run('DELETE FROM paper_orders WHERE user_id = ?', DEMO_USER_ID);
    db.run('DELETE FROM paper_equity WHERE user_id = ?', DEMO_USER_ID);
    res.json({ success: true });
  });
});

// ---------- Start server ----------
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});