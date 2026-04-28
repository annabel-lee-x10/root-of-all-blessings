// Drop portfolio + news tables that became orphans after kill-portfolio-news.
// Idempotent: every statement uses IF EXISTS, so re-runs are no-ops.
// NOT auto-run from package.json — invoke manually on prod when ready.
//
// Usage: tsx scripts/migrate-drop-portfolio-news.ts
//
// dotenv config() must finish before createClient(), so we inline the
// client construction here rather than importing from lib/db (its top-level
// import would hoist above the config() call and read TURSO_* before .env.local
// is loaded).

import { config } from 'dotenv'
config({ path: new URL('../.env.local', import.meta.url).pathname })

import { createClient } from '@libsql/client'

const url = process.env.TURSO_DATABASE_URL ?? 'file:local.db'
const authToken = process.env.TURSO_AUTH_TOKEN
const db = createClient({ url, authToken })

// Dropped in dependency order: child tables first (they reference snapshots),
// snapshots themselves last among portfolio tables, then news_briefs (standalone).
const DROP_STATEMENTS = [
  'DROP TABLE IF EXISTS portfolio_transactions',
  'DROP TABLE IF EXISTS portfolio_milestones',
  'DROP TABLE IF EXISTS portfolio_growth',
  'DROP TABLE IF EXISTS portfolio_realised',
  'DROP TABLE IF EXISTS portfolio_orders',
  'DROP TABLE IF EXISTS portfolio_holdings',
  'DROP TABLE IF EXISTS portfolio_snapshots',
  'DROP TABLE IF EXISTS news_briefs',
]

async function run() {
  console.log(`Dropping portfolio + news tables on ${url}...`)
  for (const sql of DROP_STATEMENTS) {
    process.stdout.write(`  ${sql} ... `)
    await db.execute(sql)
    console.log('ok')
  }
  console.log('Done.')
}

run().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
