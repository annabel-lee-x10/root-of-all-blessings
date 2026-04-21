import { config } from 'dotenv'
config({ path: new URL('../.env.local', import.meta.url).pathname })
import { db } from '../lib/db'

const DDL: Array<{ name: string; sql: string }> = [
  // Extend portfolio_snapshots
  { name: 'portfolio_snapshots.cash',               sql: 'ALTER TABLE portfolio_snapshots ADD COLUMN cash REAL DEFAULT 0' },
  { name: 'portfolio_snapshots.pending',             sql: 'ALTER TABLE portfolio_snapshots ADD COLUMN pending REAL DEFAULT 0' },
  { name: 'portfolio_snapshots.realised_pnl',        sql: 'ALTER TABLE portfolio_snapshots ADD COLUMN realised_pnl REAL DEFAULT 0' },
  { name: 'portfolio_snapshots.net_invested',        sql: 'ALTER TABLE portfolio_snapshots ADD COLUMN net_invested REAL' },
  { name: 'portfolio_snapshots.net_deposited',       sql: 'ALTER TABLE portfolio_snapshots ADD COLUMN net_deposited REAL' },
  { name: 'portfolio_snapshots.dividends_received',  sql: 'ALTER TABLE portfolio_snapshots ADD COLUMN dividends_received REAL DEFAULT 0' },
  { name: 'portfolio_snapshots.prior_value',         sql: 'ALTER TABLE portfolio_snapshots ADD COLUMN prior_value REAL' },
  { name: 'portfolio_snapshots.prior_unrealised',    sql: 'ALTER TABLE portfolio_snapshots ADD COLUMN prior_unrealised REAL' },
  { name: 'portfolio_snapshots.prior_realised',      sql: 'ALTER TABLE portfolio_snapshots ADD COLUMN prior_realised REAL' },
  { name: 'portfolio_snapshots.prior_cash',          sql: 'ALTER TABLE portfolio_snapshots ADD COLUMN prior_cash REAL' },
  { name: 'portfolio_snapshots.snap_label',          sql: 'ALTER TABLE portfolio_snapshots ADD COLUMN snap_label TEXT' },
  { name: 'portfolio_snapshots.prior_holdings_count',sql: 'ALTER TABLE portfolio_snapshots ADD COLUMN prior_holdings_count INTEGER' },
  // New tables
  {
    name: 'portfolio_orders',
    sql: `CREATE TABLE IF NOT EXISTS portfolio_orders (
      id TEXT PRIMARY KEY,
      ticker TEXT NOT NULL,
      geo TEXT NOT NULL DEFAULT 'US',
      type TEXT NOT NULL,
      price REAL NOT NULL,
      qty REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      placed TEXT NOT NULL,
      current_price REAL,
      note TEXT,
      new_flag INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL
    )`,
  },
  {
    name: 'portfolio_realised',
    sql: `CREATE TABLE IF NOT EXISTS portfolio_realised (
      id TEXT PRIMARY KEY,
      ticker TEXT NOT NULL,
      pnl REAL NOT NULL,
      note TEXT,
      trade_date TEXT,
      created_at TEXT NOT NULL
    )`,
  },
  {
    name: 'portfolio_growth',
    sql: `CREATE TABLE IF NOT EXISTS portfolio_growth (
      dimension TEXT PRIMARY KEY,
      score REAL NOT NULL,
      label TEXT NOT NULL,
      level TEXT NOT NULL,
      items_json TEXT NOT NULL DEFAULT '[]',
      next_action TEXT,
      updated_at TEXT NOT NULL
    )`,
  },
  {
    name: 'portfolio_milestones',
    sql: `CREATE TABLE IF NOT EXISTS portfolio_milestones (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      tags_json TEXT NOT NULL DEFAULT '[]',
      text TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )`,
  },
]

async function run() {
  const results: Record<string, string> = {}
  for (const m of DDL) {
    try {
      await db.execute(m.sql)
      results[m.name] = 'ok'
    } catch {
      results[m.name] = 'already exists'
    }
  }
  for (const [k, v] of Object.entries(results)) {
    console.log(`  ${v === 'ok' ? '✓' : '–'} ${k}: ${v}`)
  }
  console.log('Migration complete.')
  process.exit(0)
}

run().catch(err => { console.error(err); process.exit(1) })
