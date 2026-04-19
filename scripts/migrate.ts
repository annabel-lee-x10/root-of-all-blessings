import { config } from 'dotenv'
config({ path: new URL('../.env.local', import.meta.url).pathname })
import { db } from '../lib/db'

async function migrate() {
  console.log('Running migrations...')

  await db.batch([
    `CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL CHECK(type IN ('bank','wallet','cash','fund')),
      currency TEXT NOT NULL DEFAULT 'SGD',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL CHECK(type IN ('expense','income')),
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK(type IN ('expense','income','transfer')),
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'SGD',
      fx_rate REAL,
      fx_date TEXT,
      sgd_equivalent REAL,
      account_id TEXT NOT NULL REFERENCES accounts(id),
      to_account_id TEXT REFERENCES accounts(id),
      category_id TEXT REFERENCES categories(id),
      payee TEXT,
      note TEXT,
      payment_method TEXT,
      datetime TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS transaction_tags (
      transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
      tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (transaction_id, tag_id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_tx_datetime ON transactions(datetime DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_tx_account ON transactions(account_id)`,
    `CREATE INDEX IF NOT EXISTS idx_tx_category ON transactions(category_id)`,
    `CREATE INDEX IF NOT EXISTS idx_tx_type ON transactions(type)`,
    `CREATE TABLE IF NOT EXISTS portfolio_snapshots (
      id TEXT PRIMARY KEY,
      snapshot_date TEXT NOT NULL,
      total_value REAL NOT NULL,
      total_pnl REAL,
      holdings_json TEXT NOT NULL,
      raw_html TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_portfolio_date ON portfolio_snapshots(snapshot_date DESC)`,
    `CREATE TABLE IF NOT EXISTS news_briefs (
      id TEXT PRIMARY KEY,
      brief_date TEXT NOT NULL,
      content_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      tickers TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_news_date ON news_briefs(brief_date DESC)`,
    `CREATE TABLE IF NOT EXISTS andromoney_imports (
      uid TEXT PRIMARY KEY,
      imported_at TEXT NOT NULL
    )`,
  ])

  // Idempotent: add tickers column to existing news_briefs tables
  try {
    await db.execute('ALTER TABLE news_briefs ADD COLUMN tickers TEXT')
  } catch {
    // Column already exists — safe to ignore
  }

  // Idempotent: add payment_method column to existing transactions tables
  try {
    await db.execute('ALTER TABLE transactions ADD COLUMN payment_method TEXT')
  } catch {
    // Column already exists — safe to ignore
  }

  console.log('Migrations complete.')
  process.exit(0)
}

migrate().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
