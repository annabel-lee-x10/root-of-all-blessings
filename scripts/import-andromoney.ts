/**
 * AndroMoney CSV import script.
 *
 * Usage:
 *   npx tsx scripts/import-andromoney.ts /path/to/andromoney-export.csv
 *   npx tsx scripts/import-andromoney.ts /path/to/file.csv --dry-run
 *
 * CSV columns (0-indexed):
 *   0  Id
 *   1  Currency
 *   2  Amount
 *   3  Category
 *   4  Sub-Category
 *   5  Date (YYYYMMDD)
 *   6  Expense(Transfer Out)   - source account
 *   7  Income(Transfer In)     - dest account
 *   8  Note
 *   9  Periodic
 *   10 Project
 *   11 Payee/Payer
 *   12 uid
 *   13 Time (HHMM)
 */

import * as fs from 'fs'
import * as path from 'path'
import { db } from '../lib/db'

// ── Column indices ────────────────────────────────────────────────────────────

export const COL = {
  ID: 0,
  CURRENCY: 1,
  AMOUNT: 2,
  CATEGORY: 3,
  SUB_CATEGORY: 4,
  DATE: 5,
  EXPENSE: 6,
  INCOME: 7,
  NOTE: 8,
  PERIODIC: 9,
  PROJECT: 10,
  PAYEE: 11,
  UID: 12,
  TIME: 13,
} as const

// ── Row type ──────────────────────────────────────────────────────────────────

export type RowType = 'expense' | 'income' | 'transfer' | 'init_balance'

export interface CsvRow {
  id: string
  currency: string
  amount: number
  category: string
  subCategory: string
  date: string
  expenseAccount: string
  incomeAccount: string
  note: string
  payee: string
  uid: string
  time: string
}

// ── CSV parsing ───────────────────────────────────────────────────────────────

export function parseCsvLine(line: string): string[] {
  const fields: string[] = []
  let cur = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        cur += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        fields.push(cur.trim())
        cur = ''
      } else {
        cur += ch
      }
    }
  }
  fields.push(cur.trim())
  return fields
}

export function parseRow(fields: string[]): CsvRow | null {
  if (fields.length < 13) return null
  const amount = parseFloat(fields[COL.AMOUNT])
  if (isNaN(amount)) return null
  return {
    id: fields[COL.ID] ?? '',
    currency: (fields[COL.CURRENCY] ?? 'SGD').trim().toUpperCase() || 'SGD',
    amount: Math.abs(amount),
    category: (fields[COL.CATEGORY] ?? '').trim(),
    subCategory: (fields[COL.SUB_CATEGORY] ?? '').trim(),
    date: (fields[COL.DATE] ?? '').trim(),
    expenseAccount: (fields[COL.EXPENSE] ?? '').trim(),
    incomeAccount: (fields[COL.INCOME] ?? '').trim(),
    note: (fields[COL.NOTE] ?? '').trim(),
    payee: (fields[COL.PAYEE] ?? '').trim(),
    uid: (fields[COL.UID] ?? '').trim(),
    time: (fields[COL.TIME] ?? '0000').trim(),
  }
}

// ── Row type detection ────────────────────────────────────────────────────────

export function determineRowType(row: CsvRow): RowType {
  if (row.category === 'SYSTEM' && row.subCategory === 'INIT_AMOUNT') return 'init_balance'
  const hasExpense = row.expenseAccount.length > 0
  const hasIncome = row.incomeAccount.length > 0
  if (hasExpense && hasIncome) return 'transfer'
  if (hasExpense) return 'expense'
  if (hasIncome) return 'income'
  return 'expense'
}

// ── DateTime parsing ──────────────────────────────────────────────────────────

export function parseDateTime(date: string, time: string): string {
  // date: YYYYMMDD, time: HHMM or HH:MM or empty
  const y = date.slice(0, 4)
  const m = date.slice(4, 6)
  const d = date.slice(6, 8)
  const clean = time.replace(':', '')
  const hh = clean.slice(0, 2).padStart(2, '0') || '00'
  const mm = clean.slice(2, 4).padStart(2, '0') || '00'
  return `${y}-${m}-${d}T${hh}:${mm}:00`
}

// ── Category mapping ──────────────────────────────────────────────────────────

export interface CategoryResult {
  category: string
  type: 'expense' | 'income'
}

// Keys are lowercased AndroMoney category (or "category::sub-category") values
const CATEGORY_MAP: Record<string, CategoryResult> = {
  // Food
  'food & dining':     { category: 'Food', type: 'expense' },
  'food and dining':   { category: 'Food', type: 'expense' },
  'food':              { category: 'Food', type: 'expense' },
  'drink':             { category: 'Food', type: 'expense' },
  'drinks':            { category: 'Food', type: 'expense' },
  'restaurant':        { category: 'Food', type: 'expense' },
  'groceries':         { category: 'Food', type: 'expense' },
  'grocery':           { category: 'Food', type: 'expense' },
  'coffee':            { category: 'Food', type: 'expense' },
  'bubble tea':        { category: 'Food', type: 'expense' },
  'supper':            { category: 'Food', type: 'expense' },
  'lunch':             { category: 'Food', type: 'expense' },
  'dinner':            { category: 'Food', type: 'expense' },
  'breakfast':         { category: 'Food', type: 'expense' },
  'snacks':            { category: 'Food', type: 'expense' },

  // Transport
  'transportation':    { category: 'Transport', type: 'expense' },
  'transport':         { category: 'Transport', type: 'expense' },
  'car':               { category: 'Transport', type: 'expense' },
  'petrol':            { category: 'Transport', type: 'expense' },
  'fuel':              { category: 'Transport', type: 'expense' },
  'grab':              { category: 'Transport', type: 'expense' },
  'gojek':             { category: 'Transport', type: 'expense' },
  'taxi':              { category: 'Transport', type: 'expense' },
  'mrt':               { category: 'Transport', type: 'expense' },
  'bus':               { category: 'Transport', type: 'expense' },
  'parking':           { category: 'Transport', type: 'expense' },
  'toll':              { category: 'Transport', type: 'expense' },
  'ez-link':           { category: 'Transport', type: 'expense' },
  'ezlink':            { category: 'Transport', type: 'expense' },
  'transit':           { category: 'Transport', type: 'expense' },

  // Housing
  'housing':           { category: 'Housing', type: 'expense' },
  'rent':              { category: 'Housing', type: 'expense' },
  'home':              { category: 'Housing', type: 'expense' },
  'household':         { category: 'Housing', type: 'expense' },
  'furniture':         { category: 'Housing', type: 'expense' },
  'renovation':        { category: 'Housing', type: 'expense' },
  'appliances':        { category: 'Housing', type: 'expense' },

  // Bills
  'utilities':         { category: 'Bills', type: 'expense' },
  'bills':             { category: 'Bills', type: 'expense' },
  'phone':             { category: 'Bills', type: 'expense' },
  'mobile':            { category: 'Bills', type: 'expense' },
  'internet':          { category: 'Bills', type: 'expense' },
  'insurance':         { category: 'Bills', type: 'expense' },
  'electricity':       { category: 'Bills', type: 'expense' },
  'water':             { category: 'Bills', type: 'expense' },
  'telco':             { category: 'Bills', type: 'expense' },

  // Health
  'health & fitness':  { category: 'Health', type: 'expense' },
  'health and fitness':{ category: 'Health', type: 'expense' },
  'health':            { category: 'Health', type: 'expense' },
  'medical':           { category: 'Health', type: 'expense' },
  'medicine':          { category: 'Health', type: 'expense' },
  'healthcare':        { category: 'Health', type: 'expense' },
  'fitness':           { category: 'Health', type: 'expense' },
  'gym':               { category: 'Health', type: 'expense' },
  'dental':            { category: 'Health', type: 'expense' },
  'clinic':            { category: 'Health', type: 'expense' },

  // Entertainment
  'entertainment':     { category: 'Entertainment', type: 'expense' },
  'games':             { category: 'Entertainment', type: 'expense' },
  'gaming':            { category: 'Entertainment', type: 'expense' },
  'movies':            { category: 'Entertainment', type: 'expense' },
  'sports':            { category: 'Entertainment', type: 'expense' },
  'recreation':        { category: 'Entertainment', type: 'expense' },
  'hobby':             { category: 'Entertainment', type: 'expense' },
  'hobbies':           { category: 'Entertainment', type: 'expense' },
  'music':             { category: 'Entertainment', type: 'expense' },
  'concert':           { category: 'Entertainment', type: 'expense' },
  'event':             { category: 'Entertainment', type: 'expense' },
  'karaoke':           { category: 'Entertainment', type: 'expense' },

  // Subscriptions
  'subscriptions':     { category: 'Subscriptions', type: 'expense' },
  'subscription':      { category: 'Subscriptions', type: 'expense' },
  'streaming':         { category: 'Subscriptions', type: 'expense' },
  'membership':        { category: 'Subscriptions', type: 'expense' },

  // Education
  'education':         { category: 'Education', type: 'expense' },
  'books':             { category: 'Education', type: 'expense' },
  'book':              { category: 'Education', type: 'expense' },
  'course':            { category: 'Education', type: 'expense' },
  'courses':           { category: 'Education', type: 'expense' },
  'tuition':           { category: 'Education', type: 'expense' },
  'training':          { category: 'Education', type: 'expense' },

  // Pet
  'pet & animal':      { category: 'Pet', type: 'expense' },
  'pet and animal':    { category: 'Pet', type: 'expense' },
  'pet':               { category: 'Pet', type: 'expense' },
  'pets':              { category: 'Pet', type: 'expense' },
  'cat':               { category: 'Pet', type: 'expense' },
  'dog':               { category: 'Pet', type: 'expense' },
  'vet':               { category: 'Pet', type: 'expense' },

  // Income
  'salary':            { category: 'Salary', type: 'income' },
  'wages':             { category: 'Salary', type: 'income' },
  'payroll':           { category: 'Salary', type: 'income' },
  'income':            { category: 'Salary', type: 'income' },
  'rental income':     { category: 'Rental', type: 'income' },
  'rental':            { category: 'Rental', type: 'income' },
  'sales':             { category: 'Sales', type: 'income' },
  'freelance':         { category: 'Sales', type: 'income' },
  'side income':       { category: 'Sales', type: 'income' },
  'carousell':         { category: 'Sales', type: 'income' },
  'refund':            { category: 'Refund', type: 'income' },
  'repayment':         { category: 'Repayment', type: 'income' },
  'angpow':            { category: 'Angpow', type: 'income' },
  'ang pao':           { category: 'Angpow', type: 'income' },
  'red packet':        { category: 'Angpow', type: 'income' },
  'hongbao':           { category: 'Angpow', type: 'income' },
  'interest':          { category: 'Other Income', type: 'income' },
  'dividend':          { category: 'Other Income', type: 'income' },
  'dividends':         { category: 'Other Income', type: 'income' },
  'cashback':          { category: 'Other Income', type: 'income' },
  'cash back':         { category: 'Other Income', type: 'income' },
  'gift':              { category: 'Other Income', type: 'income' },
  'bonus':             { category: 'Other Income', type: 'income' },
  'rebate':            { category: 'Other Income', type: 'income' },
  'allowance':         { category: 'Other Income', type: 'income' },

  // Other expense catch-all
  'shopping':          { category: 'Other', type: 'expense' },
  'clothing':          { category: 'Other', type: 'expense' },
  'apparel':           { category: 'Other', type: 'expense' },
  'beauty':            { category: 'Other', type: 'expense' },
  'personal care':     { category: 'Other', type: 'expense' },
  'personal':          { category: 'Other', type: 'expense' },
  'travel':            { category: 'Other', type: 'expense' },
  'holiday':           { category: 'Other', type: 'expense' },
  'vacation':          { category: 'Other', type: 'expense' },
  'charity':           { category: 'Other', type: 'expense' },
  'donation':          { category: 'Other', type: 'expense' },
  'other':             { category: 'Other', type: 'expense' },
  'others':            { category: 'Other', type: 'expense' },
  'miscellaneous':     { category: 'Other', type: 'expense' },
  'misc':              { category: 'Other', type: 'expense' },
  'fees':              { category: 'Other', type: 'expense' },
  'tax':               { category: 'Other', type: 'expense' },
  'taxes':             { category: 'Other', type: 'expense' },
}

export function mapCategory(
  category: string,
  subCategory: string,
  rowType: RowType
): CategoryResult | null {
  if (rowType === 'transfer' || rowType === 'init_balance') return null

  const catKey = category.toLowerCase().trim()
  const subKey = subCategory.toLowerCase().trim()

  // Try combined key first
  if (subKey) {
    const combined = `${catKey}::${subKey}`
    if (CATEGORY_MAP[combined]) return CATEGORY_MAP[combined]
    if (CATEGORY_MAP[subKey]) return CATEGORY_MAP[subKey]
  }

  if (CATEGORY_MAP[catKey]) return CATEGORY_MAP[catKey]

  // Fallback by row type: income cols filled → income, else expense
  if (rowType === 'income') return { category: 'Other Income', type: 'income' }
  return null
}

// ── Account name normalisation ────────────────────────────────────────────────

// Maps lowercased CSV account names → canonical blessroot account names
const ACCOUNT_NAME_MAP: Record<string, string> = {
  'posb':                 'POSB',
  'ocbc':                 'OCBC',
  '6674':                 '6674',
  'grabpay':              'GrabPay',
  'grab pay':             'GrabPay',
  'shopee pay':           'Shopee Pay',
  'shopeepay':            'Shopee Pay',
  'uob one':              'UOB One',
  'uob savings':          'UOB Savings',
  'uob saving':           'UOB Savings',
  'shopback':             'ShopBack',
  'shop back':            'ShopBack',
  'paypal':               'PayPal',
  'syfe':                 'Syfe',
  'pandapay':             'PandaPay',
  'panda pay':            'PandaPay',
  'cash':                 'Cash',
  'tech funds':           'Tech Funds',
  'ifunds annihilator':   'iFunds Annihilator',
  'vallow':               'vallow',
  'lalamove easyvan':     'Lalamove Easyvan',
  'lalamove':             'Lalamove Easyvan',
  '2024 japan':           '2024 Japan',
}

// Account type hints for auto-creating unknown accounts
const ACCOUNT_TYPE_HINTS: Record<string, string> = {
  'vallow':           'wallet',
  'lalamove easyvan': 'wallet',
  '2024 japan':       'cash',
}

export function normaliseAccountName(raw: string): string {
  const key = raw.toLowerCase().trim()
  return ACCOUNT_NAME_MAP[key] ?? raw.trim()
}

export function guessAccountType(canonicalName: string): string {
  const key = canonicalName.toLowerCase()
  return ACCOUNT_TYPE_HINTS[key] ?? 'bank'
}

// ── Main import logic ─────────────────────────────────────────────────────────

interface Stats {
  total: number
  imported: number
  skipped_dup: number
  skipped_init: number
  skipped_no_account: number
  skipped_no_uid: number
  errors: number
  unmapped_categories: Set<string>
}

async function loadExistingData() {
  const [acctRes, catRes, tagRes, importedRes] = await Promise.all([
    db.execute('SELECT id, name FROM accounts'),
    db.execute('SELECT id, name, type FROM categories'),
    db.execute('SELECT id, name FROM tags'),
    db.execute('SELECT uid FROM andromoney_imports'),
  ])

  const accounts = new Map<string, string>() // name → id
  for (const r of acctRes.rows) accounts.set(r.name as string, r.id as string)

  const categories = new Map<string, { id: string; type: string }>() // name → {id, type}
  for (const r of catRes.rows) categories.set(r.name as string, { id: r.id as string, type: r.type as string })

  const tags = new Map<string, string>() // name → id
  for (const r of tagRes.rows) tags.set(r.name as string, r.id as string)

  const imported = new Set<string>()
  for (const r of importedRes.rows) imported.add(r.uid as string)

  return { accounts, categories, tags, imported }
}

async function ensureAccount(
  name: string,
  accounts: Map<string, string>,
  dryRun: boolean
): Promise<string | null> {
  if (accounts.has(name)) return accounts.get(name)!
  const type = guessAccountType(name)
  const id = crypto.randomUUID()
  const n = new Date().toISOString()
  if (!dryRun) {
    await db.execute({
      sql: `INSERT OR IGNORE INTO accounts (id, name, type, currency, is_active, created_at, updated_at)
            VALUES (?, ?, ?, 'SGD', 1, ?, ?)`,
      args: [id, name, type, n, n],
    })
    // Refetch in case INSERT OR IGNORE skipped due to dupe
    const r = await db.execute({ sql: 'SELECT id FROM accounts WHERE name = ?', args: [name] })
    const realId = r.rows[0]?.id as string ?? id
    accounts.set(name, realId)
    return realId
  }
  accounts.set(name, id)
  return id
}

async function ensureTag(
  name: string,
  tags: Map<string, string>,
  dryRun: boolean
): Promise<string> {
  if (tags.has(name)) return tags.get(name)!
  const id = crypto.randomUUID()
  const n = new Date().toISOString()
  if (!dryRun) {
    await db.execute({
      sql: `INSERT OR IGNORE INTO tags (id, name, created_at) VALUES (?, ?, ?)`,
      args: [id, name, n],
    })
    const r = await db.execute({ sql: 'SELECT id FROM tags WHERE name = ?', args: [name] })
    const realId = r.rows[0]?.id as string ?? id
    tags.set(name, realId)
    return realId
  }
  tags.set(name, id)
  return id
}

async function importRow(
  row: CsvRow,
  state: Awaited<ReturnType<typeof loadExistingData>>,
  stats: Stats,
  dryRun: boolean
): Promise<void> {
  stats.total++

  if (!row.uid) {
    stats.skipped_no_uid++
    return
  }

  if (state.imported.has(row.uid)) {
    stats.skipped_dup++
    return
  }

  const rowType = determineRowType(row)

  // INIT_AMOUNT: mark as imported, skip inserting a transaction
  if (rowType === 'init_balance') {
    stats.skipped_init++
    if (!dryRun) {
      await db.execute({
        sql: `INSERT OR IGNORE INTO andromoney_imports (uid, imported_at) VALUES (?, ?)`,
        args: [row.uid, new Date().toISOString()],
      })
    }
    state.imported.add(row.uid)
    return
  }

  // Resolve accounts
  const expAcctRaw = rowType !== 'income' ? normaliseAccountName(row.expenseAccount) : ''
  const incAcctRaw = rowType !== 'expense' ? normaliseAccountName(row.incomeAccount) : ''

  const fromAcctName = expAcctRaw || null
  const toAcctName = incAcctRaw || null

  const primaryAcctName = fromAcctName ?? toAcctName
  if (!primaryAcctName) {
    stats.skipped_no_account++
    return
  }

  const fromId = fromAcctName ? await ensureAccount(fromAcctName, state.accounts, dryRun) : null
  const toId = toAcctName ? await ensureAccount(toAcctName, state.accounts, dryRun) : null

  if (!fromId && !toId) {
    stats.skipped_no_account++
    return
  }

  // Resolve category (null for transfers)
  const catResult = mapCategory(row.category, row.subCategory, rowType)
  let categoryId: string | null = null

  if (catResult) {
    const catEntry = state.categories.get(catResult.category)
    if (catEntry) {
      categoryId = catEntry.id
    } else {
      stats.unmapped_categories.add(`${row.category}/${row.subCategory}`)
    }
  } else if (rowType !== 'transfer') {
    stats.unmapped_categories.add(`${row.category}/${row.subCategory}`)
  }

  // Build tag from sub-category (if present and meaningful)
  const tagNames: string[] = []
  if (row.subCategory && row.subCategory.toLowerCase() !== 'init_amount') {
    tagNames.push(row.subCategory)
  }

  // DateTime
  const datetime = parseDateTime(row.date, row.time)

  // FX
  const isSGD = row.currency === 'SGD'
  const txId = crypto.randomUUID()
  const now = new Date().toISOString()

  if (!dryRun) {
    await db.execute({
      sql: `INSERT INTO transactions
              (id, type, amount, currency, fx_rate, fx_date, sgd_equivalent,
               account_id, to_account_id, category_id, payee, note, datetime, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        txId,
        rowType,
        row.amount,
        row.currency,
        null,
        isSGD ? null : row.date.slice(0, 4) + '-' + row.date.slice(4, 6) + '-' + row.date.slice(6, 8),
        isSGD ? row.amount : null,
        fromId ?? toId!,
        rowType === 'transfer' ? toId : null,
        categoryId,
        row.payee || null,
        row.note || null,
        datetime,
        now,
        now,
      ],
    })

    // Tags
    for (const tagName of tagNames) {
      const tagId = await ensureTag(tagName, state.tags, dryRun)
      await db.execute({
        sql: `INSERT OR IGNORE INTO transaction_tags (transaction_id, tag_id) VALUES (?, ?)`,
        args: [txId, tagId],
      })
    }

    // Mark as imported
    await db.execute({
      sql: `INSERT OR IGNORE INTO andromoney_imports (uid, imported_at) VALUES (?, ?)`,
      args: [row.uid, now],
    })
  }

  state.imported.add(row.uid)
  stats.imported++
}

// ── Entry point ───────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)
  const csvPath = args.find(a => !a.startsWith('--'))
  const dryRun = args.includes('--dry-run')

  if (!csvPath) {
    console.error('Usage: npx tsx scripts/import-andromoney.ts <path/to/export.csv> [--dry-run]')
    process.exit(1)
  }

  const resolved = path.resolve(csvPath)
  if (!fs.existsSync(resolved)) {
    console.error(`File not found: ${resolved}`)
    process.exit(1)
  }

  console.log(`\nAndroMoney Import${dryRun ? ' (DRY RUN - no writes)' : ''}`)
  console.log(`File: ${resolved}\n`)

  const content = fs.readFileSync(resolved, 'utf-8')
  const lines = content.split(/\r?\n/).filter(l => l.trim())

  // Skip header
  const dataLines = lines.slice(1)
  console.log(`Rows in CSV (excl. header): ${dataLines.length}`)

  const state = await loadExistingData()
  console.log(`Existing accounts: ${state.accounts.size}, categories: ${state.categories.size}, already-imported UIDs: ${state.imported.size}\n`)

  const stats: Stats = {
    total: 0,
    imported: 0,
    skipped_dup: 0,
    skipped_init: 0,
    skipped_no_account: 0,
    skipped_no_uid: 0,
    errors: 0,
    unmapped_categories: new Set(),
  }

  for (const line of dataLines) {
    if (!line.trim()) continue
    const fields = parseCsvLine(line)
    const row = parseRow(fields)
    if (!row) {
      stats.errors++
      continue
    }
    try {
      await importRow(row, state, stats, dryRun)
    } catch (err) {
      stats.errors++
      console.error(`  Error on uid ${row.uid}:`, (err as Error).message)
    }
  }

  console.log('─'.repeat(40))
  console.log(`Total rows processed : ${stats.total}`)
  console.log(`Imported             : ${stats.imported}`)
  console.log(`Skipped (dup)        : ${stats.skipped_dup}`)
  console.log(`Skipped (init bal)   : ${stats.skipped_init}`)
  console.log(`Skipped (no account) : ${stats.skipped_no_account}`)
  console.log(`Skipped (no uid)     : ${stats.skipped_no_uid}`)
  console.log(`Errors               : ${stats.errors}`)

  if (stats.unmapped_categories.size > 0) {
    console.log(`\nUnmapped categories (fell back to null/Other):`)
    for (const c of stats.unmapped_categories) {
      console.log(`  - ${c}`)
    }
  }

  if (dryRun) console.log('\n[DRY RUN] No data was written.')
  console.log('')
  process.exit(0)
}

// Guard: only run when executed directly, not when imported by tests
const isDirectRun = process.argv[1]?.endsWith('import-andromoney.ts') ||
                    process.argv[1]?.endsWith('import-andromoney.js')

if (isDirectRun) {
  main().catch(err => {
    console.error('Import failed:', err)
    process.exit(1)
  })
}
