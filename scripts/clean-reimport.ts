/**
 * Clean Reimport: wipe transaction-related tables and reimport from CSV.
 *
 * This script:
 *   1. Backs up row counts for verification
 *   2. Wipes: transactions, transaction_tags, andromoney_imports, categories, accounts, tags
 *   3. Runs seed-categories (rebuilds the category hierarchy)
 *   4. Runs import-andromoney (imports all CSV rows)
 *   5. Verifies counts match expectations
 *
 * Does NOT touch: portfolio_snapshots, news_briefs
 *
 * Usage:
 *   npx tsx scripts/clean-reimport.ts /path/to/andromoney-export.csv
 *   npx tsx scripts/clean-reimport.ts /path/to/file.csv --dry-run
 */

import { config } from 'dotenv'
import { fileURLToPath } from 'url'
import path from 'path'
import { createClient } from '@libsql/client'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
config({ path: path.join(__dirname, '../.env.local') })
// createClient() is called here (after config()) so TURSO_DATABASE_URL is already set.
// A static `import { db } from '../lib/db'` would be hoisted before config() runs and
// fall back to file:local.db.
const db = createClient({
  url: process.env.TURSO_DATABASE_URL ?? 'file:local.db',
  authToken: process.env.TURSO_AUTH_TOKEN,
})

async function getCount(table: string): Promise<number> {
  try {
    const r = await db.execute(`SELECT COUNT(*) as c FROM ${table}`)
    return r.rows[0].c as number
  } catch {
    return -1 // table doesn't exist
  }
}

async function main() {
  const args = process.argv.slice(2)
  const csvPath = args.find(a => !a.startsWith('--'))
  const dryRun = args.includes('--dry-run')

  if (!csvPath) {
    console.error('Usage: npx tsx scripts/clean-reimport.ts <path/to/export.csv> [--dry-run]')
    process.exit(1)
  }

  console.log(`\n${'='.repeat(60)}`)
  console.log(`CLEAN REIMPORT${dryRun ? ' (DRY RUN)' : ''}`)
  console.log(`${'='.repeat(60)}\n`)

  // Step 1: Backup row counts
  console.log('Step 1: Pre-wipe row counts')
  const tables = ['transactions', 'transaction_tags', 'andromoney_imports', 'categories', 'accounts', 'tags']
  for (const t of tables) {
    const count = await getCount(t)
    console.log(`  ${t}: ${count}`)
  }

  // Step 2: Wipe tables
  console.log('\nStep 2: Wiping tables...')
  if (!dryRun) {
    // Order matters: foreign keys
    await db.execute('DELETE FROM transaction_tags')
    await db.execute('DELETE FROM andromoney_imports')
    await db.execute('DELETE FROM transactions')
    await db.execute('DELETE FROM tags')
    // accounts and categories are dropped and recreated in step 3
    console.log('  Tables wiped.')
  } else {
    console.log('  (dry run - no wipe)')
  }

  // Step 3: Rebuild accounts + categories
  console.log('\nStep 3: Rebuilding accounts and categories...')
  if (!dryRun) {
    // Disable FK checks so DROP TABLE doesn't trigger ON DELETE SET NULL cascades
    // (which would cause UNIQUE constraint violations on the self-referential categories table)
    await db.execute('PRAGMA foreign_keys = OFF')

    // Drop and recreate accounts table with credit_card type support
    await db.execute('DROP TABLE IF EXISTS accounts')
    await db.execute(`
      CREATE TABLE accounts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        type TEXT NOT NULL CHECK(type IN ('bank','wallet','cash','fund','credit_card')),
        currency TEXT NOT NULL DEFAULT 'SGD',
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `)

    // Drop and recreate categories table without UNIQUE on name
    await db.execute('DROP TABLE IF EXISTS categories')
    await db.execute(`
      CREATE TABLE categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('expense','income')),
        sort_order INTEGER NOT NULL DEFAULT 0,
        parent_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `)
    await db.execute(`
      CREATE UNIQUE INDEX idx_categories_name_parent
      ON categories (name, COALESCE(parent_id, '__ROOT__'))
    `)
    await db.execute('CREATE INDEX idx_categories_parent ON categories(parent_id)')

    // Re-enable FK checks now that tables are freshly created
    await db.execute('PRAGMA foreign_keys = ON')
  }

  // Inline the seed logic (same as seed-categories.ts)
  const HIERARCHY: Array<{ parent: string; type: 'expense' | 'income'; children: string[] }> = [
    { parent: 'Food', type: 'expense', children: ['Meals', 'Coffee', 'Alcohol', 'Groceries', 'Snacks'] },
    { parent: 'Transportation', type: 'expense', children: ['Bus and Train', 'Taxi', 'Delivery'] },
    { parent: 'Living', type: 'expense', children: [
      'Appliances', 'Furniture', 'Groceries', 'Tools', 'Clothes', 'Insurance - Pure',
      'Allowance', 'Income Tax', 'Property Tax', 'Rent', 'Mortgage', 'MCST',
      'Home Maintenance', 'Coffee Gear', 'Household', 'Agent Fees', 'Others',
    ] },
    { parent: 'Bills', type: 'expense', children: [
      'Aircon Service', 'Broadband', 'Credit Cards', 'Electricity',
      'Management Fees', 'Mobile', 'Utilities',
    ] },
    { parent: 'Entertainment', type: 'expense', children: [
      'Gaming', 'Toys', 'Tech', 'Carry', 'Gifts', 'Music', 'Nightlife',
      'Apps', 'Shows and Movies', 'Shopping', 'Crafts', 'Fitness',
    ] },
    { parent: 'Health and Wellness', type: 'expense', children: [
      'Supplements', 'Spa Massage', 'Skincare', 'Therapy', 'Tools', 'Haircut',
      'Medical', 'Dental', 'Supplies', 'Personal Care', 'App', 'Eyewear',
    ] },
    { parent: 'Education', type: 'expense', children: [
      'Stationery', 'Books', 'Courses', 'Software', 'Materials', 'Accessories', 'Credentials',
    ] },
    { parent: 'Pet', type: 'expense', children: [
      'Pet Food', 'Grooming', 'Litter', 'Others', 'Toys', 'Treats', 'Vet', 'Pet Supplements', 'Cleaning',
    ] },
    { parent: 'Investment', type: 'expense', children: ['Insurance - ILP', 'Insurance Accumulate'] },
    { parent: 'Subscriptions', type: 'expense', children: [
      'Entertainment', 'Storage', 'Business Tools', 'Others', 'Membership',
      'Telecommunications', 'Education', 'Internet',
    ] },
    { parent: 'Supplies', type: 'expense', children: ['Cleaning', 'Tools', 'Toiletries', 'Filters', 'Batteries'] },
    { parent: 'Income', type: 'income', children: [
      'Sale of', 'Repayment', 'Refund', 'Salary', 'Angpow', 'Rental',
      'Others', 'Pocket Money', 'Rebates',
    ] },
    { parent: 'Transfer', type: 'expense', children: ['General Transfer', 'Housing Fund'] },
    { parent: 'AI', type: 'expense', children: ['APIs', 'Subscription', 'Domain', 'Membership'] },
    { parent: 'Fees', type: 'expense', children: [
      'Logistics', 'Buffer', 'Import Duties', 'Stamp Duty', 'Transfer Fee', 'GST', 'Hold',
    ] },
    { parent: 'Others', type: 'expense', children: ['Incidental Expenses', 'Lending', 'Loan', 'Misc', 'Return'] },
    { parent: 'Travel', type: 'expense', children: ['Hotel', 'Flight', 'Travel', 'Cash Exchange'] },
  ]

  const now = new Date().toISOString()
  const parentIds = new Map<string, string>()
  let parentCount = 0
  let childCount = 0

  for (const { parent, type } of HIERARCHY) {
    if (parentIds.has(parent)) continue
    const id = crypto.randomUUID()
    if (!dryRun) {
      await db.execute({
        sql: `INSERT INTO categories (id, name, type, sort_order, parent_id, created_at, updated_at)
              VALUES (?, ?, ?, 0, NULL, ?, ?)`,
        args: [id, parent, type, now, now],
      })
    }
    parentIds.set(parent, id)
    parentCount++
  }

  for (const { parent, type, children } of HIERARCHY) {
    const parentId = parentIds.get(parent)!
    for (const child of children) {
      const id = crypto.randomUUID()
      if (!dryRun) {
        await db.execute({
          sql: `INSERT INTO categories (id, name, type, sort_order, parent_id, created_at, updated_at)
                VALUES (?, ?, ?, 0, ?, ?, ?)`,
          args: [id, child, type, parentId, now, now],
        })
      }
      childCount++
    }
  }

  console.log(`  Seeded: ${parentCount} parents, ${childCount} subcategories, total ${parentCount + childCount}`)

  // Step 4: Import CSV (inline the import logic)
  console.log(`\nStep 4: Importing from ${csvPath}...`)
  // We import by running the import-andromoney script as a child process
  // to keep this script focused on orchestration
  const { execSync } = await import('child_process')
  const importCmd = `npx tsx scripts/import-andromoney.ts "${csvPath}"${dryRun ? ' --dry-run' : ''}`
  console.log(`  Running: ${importCmd}\n`)

  try {
    execSync(importCmd, {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit',
      timeout: 0,
    })
  } catch (err) {
    console.error('  Import failed!')
    process.exit(1)
  }

  // Step 5: Verify
  console.log(`\n${'='.repeat(60)}`)
  console.log('Step 5: Post-import verification')
  for (const t of tables) {
    const count = await getCount(t)
    console.log(`  ${t}: ${count}`)
  }

  // Expected: 7,040 transactions, ~17 parent + ~120 subcategories
  const txCount = await getCount('transactions')
  if (txCount >= 7000 && txCount <= 7100) {
    console.log(`\n  Transaction count ${txCount} is in expected range (7000-7100).`)
  } else if (!dryRun) {
    console.log(`\n  WARNING: Transaction count ${txCount} is outside expected range (7000-7100)!`)
  }

  console.log(`\n${'='.repeat(60)}`)
  console.log(`CLEAN REIMPORT ${dryRun ? '(DRY RUN) ' : ''}COMPLETE`)
  console.log(`${'='.repeat(60)}\n`)
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(console.error)
}
