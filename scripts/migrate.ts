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
      status TEXT NOT NULL DEFAULT 'approved' CHECK(status IN ('draft','approved')),
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

  // Idempotent: add status column to transactions (drafts system)
  try {
    await db.execute("ALTER TABLE transactions ADD COLUMN status TEXT NOT NULL DEFAULT 'approved'")
  } catch {
    // Column already exists — safe to ignore
  }

  // ── Portfolio v2: extend portfolio_snapshots + add child tables ──────────────
  const snapV2Cols: [string, string][] = [
    ['snap_label',      'TEXT'],
    ['snap_time',       'TEXT'],
    ['cash',            'REAL'],
    ['pending',         'REAL'],
    ['net_invested',    'REAL'],
    ['unrealised_pnl',  'REAL'],
    ['realised_pnl',    'REAL'],
    ['net_deposited',   'REAL'],
    ['dividends',       'REAL'],
    ['prior_value',     'REAL'],
    ['prior_unrealised','REAL'],
    ['prior_realised',  'REAL'],
    ['prior_cash',      'REAL'],
    ['prior_holdings',  'INTEGER'],
  ]
  for (const [col, type] of snapV2Cols) {
    try {
      await db.execute(`ALTER TABLE portfolio_snapshots ADD COLUMN ${col} ${type}`)
    } catch {
      // Already exists
    }
  }

  await db.batch([
    `CREATE TABLE IF NOT EXISTS portfolio_holdings (
      id TEXT PRIMARY KEY,
      snapshot_id TEXT NOT NULL REFERENCES portfolio_snapshots(id) ON DELETE CASCADE,
      ticker TEXT,
      name TEXT NOT NULL,
      geo TEXT,
      sector TEXT,
      currency TEXT,
      price REAL,
      change_1d REAL,
      value REAL NOT NULL,
      pnl REAL,
      qty REAL,
      value_usd REAL,
      avg_cost REAL,
      target REAL,
      sell_limit REAL,
      buy_limit REAL,
      is_new INTEGER NOT NULL DEFAULT 0,
      approx INTEGER NOT NULL DEFAULT 0,
      note TEXT,
      dividend_amount REAL,
      dividend_date TEXT,
      created_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_holdings_snap ON portfolio_holdings(snapshot_id)`,
    `CREATE TABLE IF NOT EXISTS portfolio_orders (
      id TEXT PRIMARY KEY,
      snapshot_id TEXT NOT NULL REFERENCES portfolio_snapshots(id) ON DELETE CASCADE,
      ticker TEXT NOT NULL,
      geo TEXT,
      type TEXT NOT NULL,
      price REAL NOT NULL,
      qty REAL NOT NULL,
      currency TEXT NOT NULL,
      placed TEXT,
      current_price REAL,
      note TEXT,
      new_flag INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_orders_snap ON portfolio_orders(snapshot_id)`,
    `CREATE TABLE IF NOT EXISTS portfolio_realised (
      id TEXT PRIMARY KEY,
      snapshot_id TEXT NOT NULL REFERENCES portfolio_snapshots(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      value REAL NOT NULL,
      created_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_realised_snap ON portfolio_realised(snapshot_id)`,
    `CREATE TABLE IF NOT EXISTS portfolio_growth (
      id TEXT PRIMARY KEY,
      snapshot_id TEXT NOT NULL REFERENCES portfolio_snapshots(id) ON DELETE CASCADE,
      dimension TEXT NOT NULL,
      score REAL NOT NULL,
      label TEXT,
      level TEXT,
      items_json TEXT NOT NULL DEFAULT '[]',
      next_text TEXT,
      created_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_growth_snap ON portfolio_growth(snapshot_id)`,
    `CREATE TABLE IF NOT EXISTS portfolio_milestones (
      id TEXT PRIMARY KEY,
      snapshot_id TEXT NOT NULL REFERENCES portfolio_snapshots(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      tags_json TEXT NOT NULL DEFAULT '[]',
      text TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_milestones_snap ON portfolio_milestones(snapshot_id)`,
  ])

  console.log('Migrations complete.')
  process.exit(0)
}

migrate().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
