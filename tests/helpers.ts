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
  holdings_json TEXT NOT NULL,
  raw_html TEXT,
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
  type TEXT NOT NULL CHECK(type IN ('bank','wallet','cash','fund')),
  currency TEXT NOT NULL DEFAULT 'SGD',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK(type IN ('expense','income')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
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
      DELETE FROM portfolio_snapshots;
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
    stmt.run(...args)
    return Promise.resolve({ rows: [] })
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

export function seedCategory(id: string, name: string, type: 'expense' | 'income') {
  const n = new Date().toISOString()
  testDb.prepare(
    'INSERT INTO categories (id, name, type, sort_order, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)'
  ).run(id, name, type, n, n)
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

export function seedPortfolioSnapshot(
  id: string,
  holdings: object[],
  opts: { total_value?: number; total_pnl?: number | null; snapshot_date?: string } = {}
) {
  const n = new Date().toISOString()
  const { total_value = 10000, total_pnl = null, snapshot_date = n } = opts
  testDb
    .prepare(
      `INSERT INTO portfolio_snapshots (id, snapshot_date, total_value, total_pnl, holdings_json, raw_html, created_at)
       VALUES (?, ?, ?, ?, ?, NULL, ?)`
    )
    .run(id, snapshot_date, total_value, total_pnl, JSON.stringify(holdings), n)
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
    datetime = n,
  } = opts
  testDb.prepare(
    `INSERT INTO transactions
      (id, type, amount, currency, fx_rate, fx_date, sgd_equivalent,
       account_id, to_account_id, category_id, payee, note, datetime, created_at, updated_at)
     VALUES (?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, type, amount, currency, accountId, toAccountId, categoryId, payee, note, datetime, n, n)
}
