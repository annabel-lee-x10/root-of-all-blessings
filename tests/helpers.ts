import Database from 'better-sqlite3'
import { vi } from 'vitest'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'

let testDb: Database.Database

const SCHEMA = `
CREATE TABLE IF NOT EXISTS portfolio_snapshots (
  id TEXT PRIMARY KEY,
  snapshot_date TEXT NOT NULL,
  total_value REAL NOT NULL,
  total_pnl REAL,
  holdings_json TEXT NOT NULL DEFAULT '[]',
  raw_html TEXT,
  created_at TEXT NOT NULL,
  snap_label TEXT,
  snap_time TEXT,
  cash REAL,
  pending REAL,
  net_invested REAL,
  unrealised_pnl REAL,
  realised_pnl REAL,
  net_deposited REAL,
  dividends REAL,
  prior_value REAL,
  prior_unrealised REAL,
  prior_realised REAL,
  prior_cash REAL,
  prior_holdings INTEGER,
  drift_warning TEXT,
  source TEXT DEFAULT 'html_import'
);
CREATE TABLE IF NOT EXISTS portfolio_holdings (
  id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL,
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
  day_high REAL,
  day_low REAL,
  prev_close REAL,
  weight REAL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS portfolio_transactions (
  id TEXT PRIMARY KEY,
  snapshot_id TEXT REFERENCES portfolio_snapshots(id) ON DELETE CASCADE,
  ticker TEXT,
  type TEXT NOT NULL,
  amount REAL,
  currency TEXT NOT NULL DEFAULT 'SGD',
  date TEXT,
  notes TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS portfolio_orders (
  id TEXT PRIMARY KEY,
  snapshot_id TEXT REFERENCES portfolio_snapshots(id) ON DELETE CASCADE,
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
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS portfolio_realised (
  id TEXT PRIMARY KEY,
  snapshot_id TEXT REFERENCES portfolio_snapshots(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value REAL NOT NULL,
  note TEXT,
  trade_date TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS portfolio_growth (
  id TEXT PRIMARY KEY,
  snapshot_id TEXT REFERENCES portfolio_snapshots(id) ON DELETE CASCADE,
  dimension TEXT NOT NULL,
  score REAL NOT NULL,
  label TEXT,
  level TEXT,
  items_json TEXT NOT NULL DEFAULT '[]',
  next_text TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS portfolio_milestones (
  id TEXT PRIMARY KEY,
  snapshot_id TEXT REFERENCES portfolio_snapshots(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  tags_json TEXT NOT NULL DEFAULT '[]',
  text TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS news_briefs (
  id TEXT PRIMARY KEY,
  brief_date TEXT NOT NULL,
  content_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  tickers TEXT
);
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK(type IN ('bank','wallet','cash','fund','credit_card')),
  currency TEXT NOT NULL DEFAULT 'SGD',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('expense','income')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  parent_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS category_remap_backup (
  transaction_id TEXT NOT NULL PRIMARY KEY,
  original_category_id TEXT,
  backed_up_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS transactions (
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
  status TEXT NOT NULL DEFAULT 'approved',
  datetime TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS transaction_tags (
  transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (transaction_id, tag_id)
);
`

export function initTestDb() {
  testDb = new Database(':memory:')
  testDb.pragma('foreign_keys = ON')
  testDb.exec(SCHEMA)
  wireDbMock()
}

export function clearTestDb() {
  if (testDb) testDb.close()
}

export function resetTestDb() {
  if (testDb) {
    testDb.exec(`
      DELETE FROM transaction_tags;
      DELETE FROM transactions;
      DELETE FROM tags;
      DELETE FROM categories;
      DELETE FROM accounts;
      DELETE FROM news_briefs;
      DELETE FROM portfolio_milestones;
      DELETE FROM portfolio_growth;
      DELETE FROM portfolio_realised;
      DELETE FROM portfolio_transactions;
      DELETE FROM portfolio_orders;
      DELETE FROM portfolio_holdings;
      DELETE FROM portfolio_snapshots;
      DELETE FROM category_remap_backup;
    `)
  }
}

function wireDbMock() {
  const execute = vi.fn((query: string | { sql: string; args?: unknown[] }) => {
    const sql = typeof query === 'string' ? query : query.sql
    const rawArgs = typeof query === 'string' ? [] : (query.args ?? [])
    // Turso InValue can be bigint; convert for better-sqlite3
    const args = (rawArgs as unknown[]).map((v) =>
      typeof v === 'bigint' ? Number(v) : v
    )

    const trimmed = sql.trim().toUpperCase()
    const isSelect = trimmed.startsWith('SELECT')
    const stmt = testDb.prepare(sql)

    if (isSelect) {
      const rows = stmt.all(...args)
      return Promise.resolve({ rows })
    }
    const info = stmt.run(...args)
    return Promise.resolve({ rows: [], rowsAffected: info.changes })
  })

  const batch = vi.fn((stmts: (string | { sql: string })[]) => {
    for (const s of stmts) {
      const sql = typeof s === 'string' ? s : s.sql
      testDb.exec(sql)
    }
    return Promise.resolve([])
  })

  vi.mocked(db.execute).mockImplementation(execute.getMockImplementation()!)
  vi.mocked(db.batch).mockImplementation(batch.getMockImplementation()!)
}

export function req(
  url: string,
  method = 'GET',
  body?: object,
  headers?: Record<string, string>
): NextRequest {
  const fullUrl = url.startsWith('http') ? url : `http://localhost${url}`
  return new NextRequest(new URL(fullUrl), {
    method,
    body: body != null ? JSON.stringify(body) : undefined,
    headers: {
      ...(body != null ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
  })
}

export function seedAccount(id: string, name: string, type = 'bank', currency = 'SGD') {
  const n = new Date().toISOString()
  testDb.prepare(
    'INSERT INTO accounts (id, name, type, currency, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)'
  ).run(id, name, type, currency, n, n)
}

export function seedCategory(id: string, name: string, type: 'expense' | 'income', parentId?: string) {
  const n = new Date().toISOString()
  testDb.prepare(
    'INSERT INTO categories (id, name, type, sort_order, parent_id, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?, ?)'
  ).run(id, name, type, parentId ?? null, n, n)
}

export function seedTransactionTag(transactionId: string, tagId: string) {
  testDb.prepare(
    'INSERT OR IGNORE INTO transaction_tags (transaction_id, tag_id) VALUES (?, ?)'
  ).run(transactionId, tagId)
}

export function seedTag(id: string, name: string) {
  const n = new Date().toISOString()
  testDb.prepare('INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?)').run(id, name, n)
}

export function seedNewsBrief(
  id: string,
  briefJson: object,
  tickers: string[] | null = null,
  createdAt?: string
) {
  const n = createdAt ?? new Date().toISOString()
  const date = n.slice(0, 10)
  testDb
    .prepare(
      'INSERT INTO news_briefs (id, brief_date, content_json, created_at, tickers) VALUES (?, ?, ?, ?, ?)'
    )
    .run(id, date, JSON.stringify(briefJson), n, tickers ? JSON.stringify(tickers) : null)
}

// Legacy snapshot seeder — stores holdings in holdings_json (used by old /api/portfolio route tests)
export function seedPortfolioSnapshot(
  id: string,
  holdings: object[],
  opts: {
    total_value?: number; total_pnl?: number | null; snapshot_date?: string
    cash?: number; pending?: number; realised_pnl?: number
    net_invested?: number; net_deposited?: number; dividends?: number
    prior_value?: number; prior_unrealised?: number; prior_realised?: number
    prior_cash?: number; snap_label?: string; prior_holdings?: number
    snap_time?: string; unrealised_pnl?: number; source?: string
  } = {}
) {
  const n = new Date().toISOString()
  const { total_value = 10000, total_pnl = null, snapshot_date = n,
          cash = null, pending = null, realised_pnl = null, net_invested = null,
          net_deposited = null, dividends = null, prior_value = null,
          prior_unrealised = null, prior_realised = null, prior_cash = null,
          snap_label = null, prior_holdings = null, snap_time = null, unrealised_pnl = null,
          source = 'html_import' } = opts
  testDb
    .prepare(
      `INSERT INTO portfolio_snapshots
         (id, snapshot_date, total_value, total_pnl, holdings_json, raw_html, created_at,
          snap_label, snap_time, cash, pending, net_invested, unrealised_pnl, realised_pnl,
          net_deposited, dividends,
          prior_value, prior_unrealised, prior_realised, prior_cash, prior_holdings, source)
       VALUES (?,?,?,?,?,NULL,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(id, snapshot_date, total_value, total_pnl, JSON.stringify(holdings), n,
         snap_label, snap_time, cash, pending, net_invested, unrealised_pnl, realised_pnl,
         net_deposited, dividends,
         prior_value, prior_unrealised, prior_realised, prior_cash, prior_holdings, source)
}

// V2 snapshot seeder — uses snap_label to mark as v2, child data in separate tables
export function seedPortfolioSnapshotV2(
  id: string,
  opts: {
    total_value?: number
    snap_label?: string
    snap_time?: string
    unrealised_pnl?: number | null
    realised_pnl?: number | null
    cash?: number | null
    net_invested?: number | null
    net_deposited?: number | null
    snapshot_date?: string
  } = {}
) {
  const n = new Date().toISOString()
  const {
    total_value = 10000, snap_label = 'Test Snap', snap_time = '12:00 SGT',
    unrealised_pnl = null, realised_pnl = null, cash = null,
    net_invested = null, net_deposited = null,
    snapshot_date = n,
  } = opts
  testDb.prepare(
    `INSERT INTO portfolio_snapshots
      (id, snapshot_date, total_value, total_pnl, holdings_json, raw_html, created_at,
       snap_label, snap_time, unrealised_pnl, realised_pnl, cash, net_invested, net_deposited)
     VALUES (?, ?, ?, NULL, '[]', NULL, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, snapshot_date, total_value, n, snap_label, snap_time, unrealised_pnl, realised_pnl, cash, net_invested, net_deposited)
}

export function seedPortfolioHolding(
  snapId: string,
  opts: {
    id?: string
    ticker?: string
    name?: string
    value?: number
    pnl?: number | null
    qty?: number | null
    price?: number | null
    geo?: string
    sector?: string
    currency?: string
    sell_limit?: number | null
    buy_limit?: number | null
    target?: number | null
    change_1d?: number | null
    value_usd?: number | null
    is_new?: boolean
    approx?: boolean
    note?: string | null
    dividend_amount?: number | null
    dividend_date?: string | null
    day_high?: number | null
    day_low?: number | null
    prev_close?: number | null
  } = {}
) {
  const n = new Date().toISOString()
  const {
    id = crypto.randomUUID(), ticker = null, name = 'Test Holding',
    value = 1000, pnl = null, qty = null, price = null,
    geo = 'US', sector = 'Technology', currency = 'USD',
    sell_limit = null, buy_limit = null, target = null,
    change_1d = null, value_usd = null, is_new = false, approx = false,
    note = null, dividend_amount = null, dividend_date = null,
    day_high = null, day_low = null, prev_close = null,
  } = opts
  testDb.prepare(
    `INSERT INTO portfolio_holdings
      (id, snapshot_id, ticker, name, geo, sector, currency, price, change_1d,
       value, pnl, qty, value_usd, avg_cost, target, sell_limit, buy_limit,
       is_new, approx, note, dividend_amount, dividend_date,
       day_high, day_low, prev_close, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, snapId, ticker, name, geo, sector, currency, price, change_1d,
    value, pnl, qty, value_usd, target, sell_limit, buy_limit,
    is_new ? 1 : 0, approx ? 1 : 0, note, dividend_amount, dividend_date,
    day_high, day_low, prev_close, n)
}

// Unified order seeder. Use snapshot_id in opts for snapshot-linked orders;
// omit snapshot_id for standalone orders (visible to /api/portfolio/orders).
export function seedPortfolioOrder(
  id: string,
  opts: {
    snapshot_id?: string | null
    ticker?: string
    geo?: string
    type?: string
    price?: number
    qty?: number
    currency?: string
    placed?: string
    current_price?: number | null
    note?: string | null
    new_flag?: boolean | number
    status?: string
  } = {}
) {
  const n = new Date().toISOString()
  const {
    snapshot_id = null, ticker = 'MU', geo = 'US', type = 'SELL LIMIT',
    price = 100, qty = 1, currency = 'USD', placed = n,
    current_price = null, note = null, new_flag = false, status = 'open',
  } = opts
  const nf = typeof new_flag === 'boolean' ? (new_flag ? 1 : 0) : new_flag
  testDb.prepare(
    `INSERT INTO portfolio_orders
      (id, snapshot_id, ticker, geo, type, price, qty, currency, placed, current_price, note, new_flag, status, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(id, snapshot_id, ticker, geo, type, price, qty, currency, placed, current_price, note, nf, status, n)
}

// Unified realised seeder. Pass snapshot_id for snapshot-linked records;
// omit for standalone records (visible to /api/portfolio/realised).
export function seedPortfolioRealised(
  id: string, key: string, value: number, snapshot_id?: string | null
) {
  const n = new Date().toISOString()
  testDb.prepare(
    `INSERT INTO portfolio_realised (id, snapshot_id, key, value, note, trade_date, created_at) VALUES (?,?,?,?,NULL,NULL,?)`
  ).run(id, snapshot_id ?? null, key, value, n)
}

// Unified growth seeder. Pass snapshot_id for snapshot-linked records;
// omit for standalone records (visible to /api/portfolio/growth).
export function seedPortfolioGrowth(
  dimension: string, score: number, label: string, level: string,
  items: string[] = [], next_text: string | null = null,
  snapshot_id?: string | null
) {
  const n = new Date().toISOString()
  testDb.prepare(
    `INSERT INTO portfolio_growth
      (id, snapshot_id, dimension, score, label, level, items_json, next_text, created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`
  ).run(crypto.randomUUID(), snapshot_id ?? null, dimension, score, label, level, JSON.stringify(items), next_text, n)
}

// Unified milestone seeder. Pass snapshot_id for snapshot-linked records;
// omit for standalone records (visible to /api/portfolio/growth milestones).
export function seedPortfolioMilestone(
  id: string, date: string, tags: string[], text: string, order = 0,
  snapshot_id?: string | null
) {
  const n = new Date().toISOString()
  testDb.prepare(
    `INSERT INTO portfolio_milestones
      (id, snapshot_id, date, tags_json, text, sort_order, created_at)
     VALUES (?,?,?,?,?,?,?)`
  ).run(id, snapshot_id ?? null, date, JSON.stringify(tags), text, order, n)
}

export function seedTransaction(
  id: string,
  accountId: string,
  opts: {
    type?: 'expense' | 'income' | 'transfer'
    amount?: number
    currency?: string
    toAccountId?: string | null
    categoryId?: string | null
    payee?: string | null
    note?: string | null
    payment_method?: string | null
    status?: string
    datetime?: string
  } = {}
) {
  const n = new Date().toISOString()
  const {
    type = 'expense',
    amount = 10,
    currency = 'SGD',
    toAccountId = null,
    categoryId = null,
    payee = null,
    note = null,
    payment_method = null,
    status = 'approved',
    datetime = n,
  } = opts
  testDb.prepare(
    `INSERT INTO transactions
      (id, type, amount, currency, fx_rate, fx_date, sgd_equivalent,
       account_id, to_account_id, category_id, payee, note, payment_method, status, datetime, created_at, updated_at)
     VALUES (?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, type, amount, currency, accountId, toAccountId, categoryId, payee, note, payment_method, status, datetime, n, n)
}

export function seedPortfolioTransaction(
  id: string,
  snapshotId: string,
  opts: {
    ticker?: string | null
    type?: string
    amount?: number | null
    currency?: string
    date?: string | null
    notes?: string | null
  } = {}
) {
  const n = new Date().toISOString()
  const {
    ticker = null, type = 'deposit', amount = null,
    currency = 'SGD', date = null, notes = null,
  } = opts
  testDb.prepare(
    `INSERT INTO portfolio_transactions
      (id, snapshot_id, ticker, type, amount, currency, date, notes, created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`
  ).run(id, snapshotId, ticker, type, amount, currency, date, notes, n)
}
