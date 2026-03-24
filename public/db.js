const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, 'data.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error('DB error:', err.message);
  else console.log('Connected to SQLite database');
});

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS watchlists (
    user_id INTEGER,
    symbol TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id),
    PRIMARY KEY(user_id, symbol)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS paper_accounts (
    user_id INTEGER PRIMARY KEY,
    balance REAL,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS paper_positions (
    user_id INTEGER,
    symbol TEXT,
    shares REAL,
    avg_cost REAL,
    name TEXT,
    entry_date INTEGER,
    high_price REAL,
    low_price REAL,
    PRIMARY KEY(user_id, symbol)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS paper_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    type TEXT,
    symbol TEXT,
    shares REAL,
    price REAL,
    total REAL,
    pnl REAL,
    pnl_pct REAL,
    tif TEXT,
    time INTEGER,
    status TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS paper_equity (
    user_id INTEGER,
    timestamp INTEGER,
    value REAL
  )`);
});

module.exports = db;