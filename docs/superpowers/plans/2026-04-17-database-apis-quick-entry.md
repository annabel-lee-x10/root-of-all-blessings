# Finance Tracker: Database, APIs & "Where's My Money" Panel

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Turso database schema, full CRUD API layer, and a frictionless "Where's My Money" transaction quick-entry panel as the main dashboard.

**Architecture:** Turso (libSQL) via @libsql/client with raw SQL. All API routes under `app/api/` protected by existing auth middleware. Dashboard lives at `app/(protected)/page.tsx` (matches URL `/`). The "Where's My Money" panel is a prominent client-side form for fast transaction logging, followed by a recent-transactions list. Separate full CRUD screens for accounts/categories/tags/transactions browse will come in a future phase.

**Tech Stack:** `@libsql/client` (Turso), `tsx` (script runner), Next.js 16 route handlers (`params` is now a `Promise` — must `await params`), React 19 client components, Tailwind v4 CSS-variable theme.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `lib/db.ts` | Create | Turso client singleton, falls back to `file:local.db` |
| `lib/types.ts` | Create | All shared TypeScript interfaces |
| `scripts/migrate.ts` | Create | Create tables + indexes |
| `scripts/seed.ts` | Create | Insert starter accounts, categories, tags |
| `app/api/accounts/route.ts` | Create | GET list, POST create |
| `app/api/accounts/[id]/route.ts` | Create | PATCH update, DELETE soft-delete |
| `app/api/categories/route.ts` | Create | GET list (filter by type), POST create |
| `app/api/categories/[id]/route.ts` | Create | PATCH update, DELETE |
| `app/api/tags/route.ts` | Create | GET list, POST create |
| `app/api/tags/[id]/route.ts` | Create | PATCH update, DELETE |
| `app/api/transactions/route.ts` | Create | GET paginated+filtered list, POST create |
| `app/api/transactions/[id]/route.ts` | Create | PATCH update, DELETE |
| `app/api/transactions/payees/route.ts` | Create | GET distinct payees for autocomplete |
| `app/(protected)/page.tsx` | Create | Root dashboard (replaces old redirect) |
| `app/(protected)/layout.tsx` | Modify | Add top nav (branding + sign-out) |
| `app/(protected)/components/wheres-my-money.tsx` | Create | Client component: full transaction entry form |
| `app/(protected)/components/recent-transactions.tsx` | Create | Server component: last-20 transaction list |
| `app/(protected)/components/toast.tsx` | Create | Toast notification (client, context-based) |
| `app/page.tsx` | Modify | Change redirect to `/` (no-op, will be deleted) |
| `package.json` | Modify | Add deps + `migrate`/`seed` scripts |
| `.env.local` | Modify | Note local.db fallback |

---

## Task 1: Install deps + lib/db.ts + lib/types.ts

**Files:**
- Modify: `package.json`
- Create: `lib/db.ts`
- Create: `lib/types.ts`

- [ ] **Step 1: Install @libsql/client and tsx**

```bash
cd /d/a10101100_labs/root-of-all-blessings
npm install @libsql/client
npm install -D tsx
```

Expected: both install without error.

- [ ] **Step 2: Add migrate + seed scripts to package.json**

In `package.json`, under `"scripts"`, add:

```json
"migrate": "tsx scripts/migrate.ts",
"seed": "tsx scripts/seed.ts"
```

- [ ] **Step 3: Create lib/db.ts**

```typescript
import { createClient } from '@libsql/client'

const url = process.env.TURSO_DATABASE_URL ?? 'file:local.db'
const authToken = process.env.TURSO_AUTH_TOKEN

export const db = createClient({ url, authToken })
```

- [ ] **Step 4: Create lib/types.ts**

```typescript
export type AccountType = 'bank' | 'wallet' | 'cash' | 'fund'
export type CategoryType = 'expense' | 'income'
export type TxType = 'expense' | 'income' | 'transfer'

export interface Account {
  id: string
  name: string
  type: AccountType
  currency: string
  is_active: number
  created_at: string
  updated_at: string
}

export interface Category {
  id: string
  name: string
  type: CategoryType
  sort_order: number
  created_at: string
  updated_at: string
}

export interface Tag {
  id: string
  name: string
  created_at: string
}

export interface Transaction {
  id: string
  type: TxType
  amount: number
  currency: string
  fx_rate: number | null
  fx_date: string | null
  sgd_equivalent: number | null
  account_id: string
  to_account_id: string | null
  category_id: string | null
  payee: string | null
  note: string | null
  datetime: string
  created_at: string
  updated_at: string
}

export interface TransactionRow extends Transaction {
  account_name: string
  to_account_name: string | null
  category_name: string | null
  tags: Tag[]
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
}
```

- [ ] **Step 5: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no output (no errors).

- [ ] **Step 6: Commit**

```bash
git add lib/db.ts lib/types.ts package.json package-lock.json
git commit -m "feat: add @libsql/client db layer and shared types"
```

---

## Task 2: Migration Script

**Files:**
- Create: `scripts/migrate.ts`

- [ ] **Step 1: Create scripts/migrate.ts**

```typescript
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
  ])

  console.log('Migrations complete.')
  process.exit(0)
}

migrate().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
```

- [ ] **Step 2: Run migration**

```bash
npm run migrate
```

Expected output:
```
Running migrations...
Migrations complete.
```

A `local.db` file appears in the project root (local SQLite fallback).

- [ ] **Step 3: Add local.db to .gitignore**

In `.gitignore`, add below `# misc`:
```
local.db
local.db-shm
local.db-wal
```

- [ ] **Step 4: Commit**

```bash
git add scripts/migrate.ts .gitignore
git commit -m "feat: add database migration script"
```

---

## Task 3: Seed Script

**Files:**
- Create: `scripts/seed.ts`

- [ ] **Step 1: Create scripts/seed.ts**

```typescript
import { db } from '../lib/db'

function now() {
  return new Date().toISOString()
}

function uuid() {
  return crypto.randomUUID()
}

async function seed() {
  console.log('Seeding database...')
  const n = now()

  // Accounts
  const accounts: Array<{ name: string; type: string; is_active?: number }> = [
    { name: 'UOB One', type: 'bank' },
    { name: 'OCBC', type: 'bank' },
    { name: 'POSB', type: 'bank' },
    { name: 'UOB Savings', type: 'bank' },
    { name: '6674', type: 'bank', is_active: 0 },
    { name: 'Shopee Pay', type: 'wallet' },
    { name: 'GrabPay', type: 'wallet' },
    { name: 'PayPal', type: 'wallet' },
    { name: 'ShopBack', type: 'wallet' },
    { name: 'PandaPay', type: 'wallet' },
    { name: 'Cash', type: 'cash' },
    { name: 'Syfe', type: 'fund' },
    { name: 'Tech Funds', type: 'fund' },
    { name: 'iFunds Annihilator', type: 'fund' },
  ]

  for (const a of accounts) {
    await db.execute({
      sql: `INSERT OR IGNORE INTO accounts (id, name, type, currency, is_active, created_at, updated_at)
            VALUES (?, ?, ?, 'SGD', ?, ?, ?)`,
      args: [uuid(), a.name, a.type, a.is_active ?? 1, n, n],
    })
  }

  // Categories
  const categories: Array<{ name: string; type: string; sort_order: number }> = [
    { name: 'Food', type: 'expense', sort_order: 1 },
    { name: 'Transport', type: 'expense', sort_order: 2 },
    { name: 'Housing', type: 'expense', sort_order: 3 },
    { name: 'Bills', type: 'expense', sort_order: 4 },
    { name: 'Health', type: 'expense', sort_order: 5 },
    { name: 'Entertainment', type: 'expense', sort_order: 6 },
    { name: 'Subscriptions', type: 'expense', sort_order: 7 },
    { name: 'Education', type: 'expense', sort_order: 8 },
    { name: 'Pet', type: 'expense', sort_order: 9 },
    { name: 'Other', type: 'expense', sort_order: 10 },
    { name: 'Salary', type: 'income', sort_order: 1 },
    { name: 'Rental', type: 'income', sort_order: 2 },
    { name: 'Sales', type: 'income', sort_order: 3 },
    { name: 'Refund', type: 'income', sort_order: 4 },
    { name: 'Repayment', type: 'income', sort_order: 5 },
    { name: 'Angpow', type: 'income', sort_order: 6 },
    { name: 'Other Income', type: 'income', sort_order: 7 },
  ]

  for (const c of categories) {
    await db.execute({
      sql: `INSERT OR IGNORE INTO categories (id, name, type, sort_order, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [uuid(), c.name, c.type, c.sort_order, n, n],
    })
  }

  // Tags
  const tagNames = [
    'Coffee', 'Groceries', 'Taxi', 'Gaming', 'Skincare',
    'Carry Stuff', 'Tech', 'JKPP', 'Writing', 'Housing',
    'BB Munkihaus', 'CatHaus', 'Lunch', 'Dinner', 'Breakfast',
  ]

  for (const name of tagNames) {
    await db.execute({
      sql: `INSERT OR IGNORE INTO tags (id, name, created_at) VALUES (?, ?, ?)`,
      args: [uuid(), name, n],
    })
  }

  console.log('Seed complete.')
  process.exit(0)
}

seed().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
```

- [ ] **Step 2: Run seed**

```bash
npm run seed
```

Expected output:
```
Seeding database...
Seed complete.
```

- [ ] **Step 3: Commit**

```bash
git add scripts/seed.ts
git commit -m "feat: add database seed script with starter data"
```

---

## Task 4: Accounts API

**Files:**
- Create: `app/api/accounts/route.ts`
- Create: `app/api/accounts/[id]/route.ts`

- [ ] **Step 1: Create app/api/accounts/route.ts**

```typescript
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { Account } from '@/lib/types'

export async function GET() {
  const result = await db.execute(
    'SELECT * FROM accounts ORDER BY is_active DESC, type, name'
  )
  return Response.json(result.rows as unknown as Account[])
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { name, type, currency = 'SGD' } = body

  if (!name || !type) {
    return Response.json({ error: 'name and type are required' }, { status: 400 })
  }
  const validTypes = ['bank', 'wallet', 'cash', 'fund']
  if (!validTypes.includes(type)) {
    return Response.json({ error: `type must be one of: ${validTypes.join(', ')}` }, { status: 400 })
  }

  const id = crypto.randomUUID()
  const n = new Date().toISOString()

  await db.execute({
    sql: `INSERT INTO accounts (id, name, type, currency, is_active, created_at, updated_at)
          VALUES (?, ?, ?, ?, 1, ?, ?)`,
    args: [id, name, type, currency, n, n],
  })

  const row = await db.execute({ sql: 'SELECT * FROM accounts WHERE id = ?', args: [id] })
  return Response.json(row.rows[0], { status: 201 })
}
```

- [ ] **Step 2: Create app/api/accounts/[id]/route.ts**

Note: in Next.js 16, `params` is a `Promise`. Must `await params`.

```typescript
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()
  const { name, type, currency, is_active } = body

  const existing = await db.execute({ sql: 'SELECT id FROM accounts WHERE id = ?', args: [id] })
  if (existing.rows.length === 0) {
    return Response.json({ error: 'Account not found' }, { status: 404 })
  }

  const n = new Date().toISOString()
  const updates: string[] = []
  const args: unknown[] = []

  if (name !== undefined) { updates.push('name = ?'); args.push(name) }
  if (type !== undefined) { updates.push('type = ?'); args.push(type) }
  if (currency !== undefined) { updates.push('currency = ?'); args.push(currency) }
  if (is_active !== undefined) { updates.push('is_active = ?'); args.push(is_active) }

  if (updates.length === 0) {
    return Response.json({ error: 'No fields to update' }, { status: 400 })
  }

  updates.push('updated_at = ?')
  args.push(n, id)

  await db.execute({ sql: `UPDATE accounts SET ${updates.join(', ')} WHERE id = ?`, args })

  const row = await db.execute({ sql: 'SELECT * FROM accounts WHERE id = ?', args: [id] })
  return Response.json(row.rows[0])
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const n = new Date().toISOString()

  const existing = await db.execute({ sql: 'SELECT id FROM accounts WHERE id = ?', args: [id] })
  if (existing.rows.length === 0) {
    return Response.json({ error: 'Account not found' }, { status: 404 })
  }

  await db.execute({
    sql: 'UPDATE accounts SET is_active = 0, updated_at = ? WHERE id = ?',
    args: [n, id],
  })

  return Response.json({ ok: true })
}
```

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add app/api/accounts/
git commit -m "feat: accounts CRUD API routes"
```

---

## Task 5: Categories & Tags APIs

**Files:**
- Create: `app/api/categories/route.ts`
- Create: `app/api/categories/[id]/route.ts`
- Create: `app/api/tags/route.ts`
- Create: `app/api/tags/[id]/route.ts`

- [ ] **Step 1: Create app/api/categories/route.ts**

```typescript
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  const type = request.nextUrl.searchParams.get('type')
  const sql = type
    ? 'SELECT * FROM categories WHERE type = ? ORDER BY sort_order, name'
    : 'SELECT * FROM categories ORDER BY type, sort_order, name'
  const args = type ? [type] : []
  const result = await db.execute({ sql, args })
  return Response.json(result.rows)
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { name, type, sort_order = 0 } = body

  if (!name || !type) {
    return Response.json({ error: 'name and type are required' }, { status: 400 })
  }
  if (!['expense', 'income'].includes(type)) {
    return Response.json({ error: 'type must be expense or income' }, { status: 400 })
  }

  const id = crypto.randomUUID()
  const n = new Date().toISOString()

  await db.execute({
    sql: `INSERT INTO categories (id, name, type, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
    args: [id, name, type, sort_order, n, n],
  })

  const row = await db.execute({ sql: 'SELECT * FROM categories WHERE id = ?', args: [id] })
  return Response.json(row.rows[0], { status: 201 })
}
```

- [ ] **Step 2: Create app/api/categories/[id]/route.ts**

```typescript
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()
  const { name, type, sort_order } = body

  const existing = await db.execute({ sql: 'SELECT id FROM categories WHERE id = ?', args: [id] })
  if (existing.rows.length === 0) {
    return Response.json({ error: 'Category not found' }, { status: 404 })
  }

  const n = new Date().toISOString()
  const updates: string[] = []
  const args: unknown[] = []

  if (name !== undefined) { updates.push('name = ?'); args.push(name) }
  if (type !== undefined) { updates.push('type = ?'); args.push(type) }
  if (sort_order !== undefined) { updates.push('sort_order = ?'); args.push(sort_order) }

  if (updates.length === 0) {
    return Response.json({ error: 'No fields to update' }, { status: 400 })
  }

  updates.push('updated_at = ?')
  args.push(n, id)

  await db.execute({ sql: `UPDATE categories SET ${updates.join(', ')} WHERE id = ?`, args })

  const row = await db.execute({ sql: 'SELECT * FROM categories WHERE id = ?', args: [id] })
  return Response.json(row.rows[0])
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const existing = await db.execute({ sql: 'SELECT id FROM categories WHERE id = ?', args: [id] })
  if (existing.rows.length === 0) {
    return Response.json({ error: 'Category not found' }, { status: 404 })
  }

  await db.execute({ sql: 'DELETE FROM categories WHERE id = ?', args: [id] })
  return Response.json({ ok: true })
}
```

- [ ] **Step 3: Create app/api/tags/route.ts**

```typescript
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  const result = await db.execute('SELECT * FROM tags ORDER BY name')
  return Response.json(result.rows)
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { name } = body

  if (!name) {
    return Response.json({ error: 'name is required' }, { status: 400 })
  }

  const id = crypto.randomUUID()
  const n = new Date().toISOString()

  await db.execute({
    sql: 'INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?)',
    args: [id, name, n],
  })

  const row = await db.execute({ sql: 'SELECT * FROM tags WHERE id = ?', args: [id] })
  return Response.json(row.rows[0], { status: 201 })
}
```

- [ ] **Step 4: Create app/api/tags/[id]/route.ts**

```typescript
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()
  const { name } = body

  if (!name) return Response.json({ error: 'name is required' }, { status: 400 })

  const existing = await db.execute({ sql: 'SELECT id FROM tags WHERE id = ?', args: [id] })
  if (existing.rows.length === 0) {
    return Response.json({ error: 'Tag not found' }, { status: 404 })
  }

  await db.execute({ sql: 'UPDATE tags SET name = ? WHERE id = ?', args: [name, id] })

  const row = await db.execute({ sql: 'SELECT * FROM tags WHERE id = ?', args: [id] })
  return Response.json(row.rows[0])
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const existing = await db.execute({ sql: 'SELECT id FROM tags WHERE id = ?', args: [id] })
  if (existing.rows.length === 0) {
    return Response.json({ error: 'Tag not found' }, { status: 404 })
  }

  await db.execute({ sql: 'DELETE FROM tags WHERE id = ?', args: [id] })
  return Response.json({ ok: true })
}
```

- [ ] **Step 5: TypeScript check + commit**

```bash
npx tsc --noEmit
git add app/api/categories/ app/api/tags/
git commit -m "feat: categories and tags CRUD API routes"
```

---

## Task 6: Transactions API

**Files:**
- Create: `app/api/transactions/route.ts`
- Create: `app/api/transactions/[id]/route.ts`
- Create: `app/api/transactions/payees/route.ts`

- [ ] **Step 1: Create app/api/transactions/route.ts**

```typescript
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { TransactionRow } from '@/lib/types'

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams
  const page = Math.max(1, parseInt(p.get('page') ?? '1', 10))
  const limit = Math.min(100, Math.max(1, parseInt(p.get('limit') ?? '20', 10)))
  const offset = (page - 1) * limit
  const type = p.get('type')
  const account_id = p.get('account_id')
  const category_id = p.get('category_id')
  const tag_id = p.get('tag_id')
  const start = p.get('start')
  const end = p.get('end')

  const where: string[] = []
  const args: unknown[] = []

  if (type) { where.push('t.type = ?'); args.push(type) }
  if (account_id) { where.push('(t.account_id = ? OR t.to_account_id = ?)'); args.push(account_id, account_id) }
  if (category_id) { where.push('t.category_id = ?'); args.push(category_id) }
  if (start) { where.push('t.datetime >= ?'); args.push(start) }
  if (end) { where.push('t.datetime <= ?'); args.push(end) }
  if (tag_id) {
    where.push('EXISTS (SELECT 1 FROM transaction_tags tt WHERE tt.transaction_id = t.id AND tt.tag_id = ?)')
    args.push(tag_id)
  }

  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''

  const countResult = await db.execute({
    sql: `SELECT COUNT(*) as total FROM transactions t ${whereClause}`,
    args,
  })
  const total = Number(countResult.rows[0].total)

  const txResult = await db.execute({
    sql: `SELECT t.*,
            a.name as account_name,
            ta.name as to_account_name,
            c.name as category_name
          FROM transactions t
          LEFT JOIN accounts a ON t.account_id = a.id
          LEFT JOIN accounts ta ON t.to_account_id = ta.id
          LEFT JOIN categories c ON t.category_id = c.id
          ${whereClause}
          ORDER BY t.datetime DESC
          LIMIT ? OFFSET ?`,
    args: [...args, limit, offset],
  })

  const rows = txResult.rows as unknown as TransactionRow[]

  if (rows.length > 0) {
    const ids = rows.map((r) => r.id)
    const placeholders = ids.map(() => '?').join(',')
    const tagResult = await db.execute({
      sql: `SELECT tt.transaction_id, tg.id, tg.name
            FROM transaction_tags tt
            JOIN tags tg ON tt.tag_id = tg.id
            WHERE tt.transaction_id IN (${placeholders})`,
      args: ids,
    })
    const tagMap = new Map<string, { id: string; name: string }[]>()
    for (const row of tagResult.rows) {
      const txId = row.transaction_id as string
      if (!tagMap.has(txId)) tagMap.set(txId, [])
      tagMap.get(txId)!.push({ id: row.id as string, name: row.name as string })
    }
    for (const row of rows) {
      row.tags = tagMap.get(row.id) ?? []
    }
  }

  return Response.json({ data: rows, total, page, limit })
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const {
    type, amount, currency = 'SGD', fx_rate = null, fx_date = null,
    account_id, to_account_id = null, category_id = null,
    payee = null, note = null, datetime, tag_ids = [],
  } = body

  if (!type || amount == null || !account_id || !datetime) {
    return Response.json({ error: 'type, amount, account_id, and datetime are required' }, { status: 400 })
  }
  if (!['expense', 'income', 'transfer'].includes(type)) {
    return Response.json({ error: 'type must be expense, income, or transfer' }, { status: 400 })
  }
  if (type === 'transfer') {
    if (!to_account_id) {
      return Response.json({ error: 'to_account_id is required for transfers' }, { status: 400 })
    }
    const toAcct = await db.execute({
      sql: 'SELECT id FROM accounts WHERE id = ? AND is_active = 1',
      args: [to_account_id],
    })
    if (toAcct.rows.length === 0) {
      return Response.json({ error: 'to_account_id does not exist or is inactive' }, { status: 400 })
    }
  }

  const fromAcct = await db.execute({
    sql: 'SELECT id FROM accounts WHERE id = ? AND is_active = 1',
    args: [account_id],
  })
  if (fromAcct.rows.length === 0) {
    return Response.json({ error: 'account_id does not exist or is inactive' }, { status: 400 })
  }

  const sgd_equivalent = currency !== 'SGD' && fx_rate != null ? amount * fx_rate : null
  const id = crypto.randomUUID()
  const n = new Date().toISOString()

  await db.execute({
    sql: `INSERT INTO transactions
            (id, type, amount, currency, fx_rate, fx_date, sgd_equivalent,
             account_id, to_account_id, category_id, payee, note, datetime, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [id, type, amount, currency, fx_rate, fx_date, sgd_equivalent,
           account_id, to_account_id, category_id, payee, note, datetime, n, n],
  })

  if (tag_ids.length > 0) {
    for (const tag_id of tag_ids) {
      await db.execute({
        sql: 'INSERT OR IGNORE INTO transaction_tags (transaction_id, tag_id) VALUES (?, ?)',
        args: [id, tag_id],
      })
    }
  }

  const row = await db.execute({
    sql: `SELECT t.*, a.name as account_name, ta.name as to_account_name, c.name as category_name
          FROM transactions t
          LEFT JOIN accounts a ON t.account_id = a.id
          LEFT JOIN accounts ta ON t.to_account_id = ta.id
          LEFT JOIN categories c ON t.category_id = c.id
          WHERE t.id = ?`,
    args: [id],
  })
  return Response.json(row.rows[0], { status: 201 })
}
```

- [ ] **Step 2: Create app/api/transactions/[id]/route.ts**

```typescript
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()

  const existing = await db.execute({ sql: 'SELECT id FROM transactions WHERE id = ?', args: [id] })
  if (existing.rows.length === 0) {
    return Response.json({ error: 'Transaction not found' }, { status: 404 })
  }

  const allowed = ['type','amount','currency','fx_rate','fx_date','sgd_equivalent',
                   'account_id','to_account_id','category_id','payee','note','datetime']
  const updates: string[] = []
  const args: unknown[] = []

  for (const key of allowed) {
    if (key in body) {
      updates.push(`${key} = ?`)
      args.push(body[key])
    }
  }

  if (updates.length === 0 && !body.tag_ids) {
    return Response.json({ error: 'No fields to update' }, { status: 400 })
  }

  const n = new Date().toISOString()

  if (updates.length > 0) {
    updates.push('updated_at = ?')
    args.push(n, id)
    await db.execute({ sql: `UPDATE transactions SET ${updates.join(', ')} WHERE id = ?`, args })
  }

  if (body.tag_ids !== undefined) {
    await db.execute({ sql: 'DELETE FROM transaction_tags WHERE transaction_id = ?', args: [id] })
    for (const tag_id of body.tag_ids) {
      await db.execute({
        sql: 'INSERT OR IGNORE INTO transaction_tags (transaction_id, tag_id) VALUES (?, ?)',
        args: [id, tag_id],
      })
    }
  }

  const row = await db.execute({
    sql: `SELECT t.*, a.name as account_name, ta.name as to_account_name, c.name as category_name
          FROM transactions t
          LEFT JOIN accounts a ON t.account_id = a.id
          LEFT JOIN accounts ta ON t.to_account_id = ta.id
          LEFT JOIN categories c ON t.category_id = c.id
          WHERE t.id = ?`,
    args: [id],
  })
  return Response.json(row.rows[0])
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const existing = await db.execute({ sql: 'SELECT id FROM transactions WHERE id = ?', args: [id] })
  if (existing.rows.length === 0) {
    return Response.json({ error: 'Transaction not found' }, { status: 404 })
  }

  await db.execute({ sql: 'DELETE FROM transaction_tags WHERE transaction_id = ?', args: [id] })
  await db.execute({ sql: 'DELETE FROM transactions WHERE id = ?', args: [id] })
  return Response.json({ ok: true })
}
```

- [ ] **Step 3: Create app/api/transactions/payees/route.ts**

```typescript
import { db } from '@/lib/db'

export async function GET() {
  const result = await db.execute(
    `SELECT DISTINCT payee FROM transactions WHERE payee IS NOT NULL AND payee != '' ORDER BY payee`
  )
  return Response.json(result.rows.map((r) => r.payee as string))
}
```

- [ ] **Step 4: TypeScript check + commit**

```bash
npx tsc --noEmit
git add app/api/transactions/
git commit -m "feat: transactions CRUD API with filtering, pagination, and tag support"
```

---

## Task 7: Protected Layout Nav + Dashboard Root Page

**Files:**
- Modify: `app/(protected)/layout.tsx`
- Create: `app/(protected)/page.tsx`
- Create: `app/(protected)/components/toast.tsx`
- Modify: `app/page.tsx` (remove, replace with redirect to `/`)

The root `/` URL will be the main dashboard (inside the protected group). `app/page.tsx` currently redirects to `/dashboard` - replace it so it redirects to `/` (which the protected page.tsx handles). Actually since `app/(protected)/page.tsx` IS the `/` route and the `app/page.tsx` conflicts with it, **delete `app/page.tsx`** and let `app/(protected)/page.tsx` be the only `/` handler.

- [ ] **Step 1: Delete app/page.tsx**

```bash
rm app/page.tsx
```

- [ ] **Step 2: Update app/(protected)/layout.tsx to include top nav**

Replace the file with:

```typescript
import { redirect } from 'next/navigation'
import { verifySession } from '@/lib/session'

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const valid = await verifySession()
  if (!valid) redirect('/login')
  return (
    <div style={{ minHeight: '100vh', background: '#0d1117' }}>
      <nav
        style={{
          background: '#161b22',
          borderBottom: '1px solid #30363d',
          padding: '0 1.5rem',
          height: '52px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '28px', height: '28px', borderRadius: '8px',
              background: 'linear-gradient(135deg, #f0b429 0%, #d4a017 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L8 8H4l4 4-2 6 6-3 6 3-2-6 4-4h-4L12 2z" fill="white" opacity="0.9"/>
            </svg>
          </div>
          <span style={{ color: '#e6edf3', fontWeight: 600, fontSize: '14px' }}>Root OS</span>
        </div>
        <form action="/api/auth/logout" method="POST">
          <button
            type="submit"
            style={{
              background: 'none', border: 'none', color: '#8b949e',
              fontSize: '13px', cursor: 'pointer', padding: '4px 8px',
            }}
          >
            Sign out
          </button>
        </form>
      </nav>
      {children}
    </div>
  )
}
```

- [ ] **Step 3: Create app/(protected)/components/toast.tsx**

```typescript
'use client'
import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

type ToastType = 'success' | 'error'
interface Toast { id: number; message: string; type: ToastType }
interface ToastContextValue { showToast: (message: string, type?: ToastType) => void }

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} })

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const showToast = useCallback((message: string, type: ToastType = 'success') => {
    const id = Date.now()
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500)
  }, [])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        style={{
          position: 'fixed', bottom: '24px', right: '24px',
          display: 'flex', flexDirection: 'column', gap: '8px', zIndex: 9999,
        }}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            style={{
              padding: '10px 16px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 500,
              boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
              background: t.type === 'success' ? '#1a4731' : '#4a1717',
              color: t.type === 'success' ? '#3fb884' : '#f85149',
              border: `1px solid ${t.type === 'success' ? '#2ea04380' : '#f8514980'}`,
              animation: 'slideIn 0.2s ease',
            }}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
```

- [ ] **Step 4: Create app/(protected)/page.tsx**

```typescript
import { ToastProvider } from './components/toast'
import { WheresMyMoney } from './components/wheres-my-money'
import { RecentTransactions } from './components/recent-transactions'

export const metadata = {
  title: "Where's My Money - Root OS",
}

export default function DashboardPage() {
  return (
    <ToastProvider>
      <main style={{ padding: '1.5rem', maxWidth: '800px', margin: '0 auto' }}>
        <WheresMyMoney />
        <RecentTransactions />
      </main>
    </ToastProvider>
  )
}
```

- [ ] **Step 5: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no output (WheresMyMoney and RecentTransactions don't exist yet - TypeScript will error until next task; if it errors here, add placeholder exports:
`export function WheresMyMoney() { return null }` / `export function RecentTransactions() { return null }` in each file temporarily.)

- [ ] **Step 6: Commit (with placeholder stubs)**

```bash
git add app/(protected)/layout.tsx app/(protected)/page.tsx app/(protected)/components/toast.tsx
git rm app/page.tsx
git commit -m "feat: dashboard layout, toast provider, root page scaffold"
```

---

## Task 8: Where's My Money - Transaction Entry Form

**Files:**
- Create: `app/(protected)/components/wheres-my-money.tsx`

This is a client component. It fetches accounts, categories, and tags on mount, then renders the full entry form.

- [ ] **Step 1: Create app/(protected)/components/wheres-my-money.tsx**

```typescript
'use client'

import { useState, useEffect, useRef } from 'react'
import { useToast } from './toast'
import type { Account, Category, Tag, TxType } from '@/lib/types'

const CURRENCIES = ['SGD', 'USD', 'EUR', 'GBP', 'JPY', 'MYR', 'IDR', 'THB', 'AUD', 'HKD']

function sgtNow() {
  const now = new Date()
  const sgt = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Singapore' }))
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${sgt.getFullYear()}-${pad(sgt.getMonth() + 1)}-${pad(sgt.getDate())}T${pad(sgt.getHours())}:${pad(sgt.getMinutes())}`
}

function toISOWithOffset(localDatetime: string): string {
  const date = new Date(localDatetime)
  const offset = '+08:00'
  const pad = (n: number) => String(Math.abs(n)).padStart(2, '0')
  const y = date.getFullYear()
  const mo = pad(date.getMonth() + 1)
  const d = pad(date.getDate())
  const h = pad(date.getHours())
  const mi = pad(date.getMinutes())
  return `${y}-${mo}-${d}T${h}:${mi}:00${offset}`
}

const inputStyle = (isDark = true): React.CSSProperties => ({
  background: isDark ? '#0d1117' : '#0d1117',
  border: '1px solid #30363d',
  borderRadius: '8px',
  color: '#e6edf3',
  padding: '8px 12px',
  fontSize: '14px',
  width: '100%',
  outline: 'none',
})

const selectStyle = (): React.CSSProperties => ({
  ...inputStyle(),
  cursor: 'pointer',
  appearance: 'none',
})

export function WheresMyMoney() {
  const { showToast } = useToast()

  const [type, setType] = useState<TxType>('expense')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState('SGD')
  const [fxRate, setFxRate] = useState('')
  const [fxDate, setFxDate] = useState('')
  const [accountId, setAccountId] = useState('')
  const [toAccountId, setToAccountId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [payee, setPayee] = useState('')
  const [note, setNote] = useState('')
  const [datetime, setDatetime] = useState(sgtNow)
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const [tagSearch, setTagSearch] = useState('')
  const [showNoteField, setShowNoteField] = useState(false)
  const [saving, setSaving] = useState(false)

  const [accounts, setAccounts] = useState<Account[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [payees, setPayees] = useState<string[]>([])

  const amountRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/accounts').then((r) => r.json()),
      fetch('/api/categories').then((r) => r.json()),
      fetch('/api/tags').then((r) => r.json()),
      fetch('/api/transactions/payees').then((r) => r.json()),
    ]).then(([accts, cats, tgs, pvs]) => {
      setAccounts(accts)
      setCategories(cats)
      setTags(tgs)
      setPayees(pvs)
      const saved = localStorage.getItem('wmm_last_account')
      if (saved && accts.find((a: Account) => a.id === saved)) {
        setAccountId(saved)
      } else if (accts.length > 0) {
        setAccountId(accts[0].id)
      }
    })
  }, [])

  const activeAccounts = accounts.filter((a) => a.is_active === 1)
  const filteredCategories = categories.filter((c) => c.type === (type === 'transfer' ? 'expense' : type))

  const filteredTags = tags.filter(
    (t) =>
      t.name.toLowerCase().includes(tagSearch.toLowerCase()) &&
      !selectedTagIds.includes(t.id)
  )

  function toggleTag(id: string) {
    setSelectedTagIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  async function createAndAddTag(name: string) {
    const res = await fetch('/api/tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (res.ok) {
      const newTag: Tag = await res.json()
      setTags((prev) => [...prev, newTag].sort((a, b) => a.name.localeCompare(b.name)))
      setSelectedTagIds((prev) => [...prev, newTag.id])
      setTagSearch('')
    }
  }

  function reset() {
    setAmount('')
    setCurrency('SGD')
    setFxRate('')
    setFxDate('')
    setCategoryId('')
    setPayee('')
    setNote('')
    setDatetime(sgtNow())
    setSelectedTagIds([])
    setTagSearch('')
    setShowNoteField(false)
    amountRef.current?.focus()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!amount || !accountId) return
    setSaving(true)

    const amountNum = parseFloat(amount)
    const payload: Record<string, unknown> = {
      type,
      amount: amountNum,
      currency,
      account_id: accountId,
      datetime: toISOWithOffset(datetime),
      tag_ids: selectedTagIds,
    }

    if (type === 'transfer') payload.to_account_id = toAccountId
    if (type !== 'transfer' && categoryId) payload.category_id = categoryId
    if (payee) payload.payee = payee
    if (note) payload.note = note
    if (currency !== 'SGD') {
      if (fxRate) payload.fx_rate = parseFloat(fxRate)
      if (fxDate) payload.fx_date = fxDate
    }

    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        localStorage.setItem('wmm_last_account', accountId)
        showToast('Transaction saved', 'success')
        reset()
        window.dispatchEvent(new Event('transaction-saved'))
      } else {
        const data = await res.json()
        showToast(data.error ?? 'Failed to save', 'error')
      }
    } catch {
      showToast('Network error', 'error')
    } finally {
      setSaving(false)
    }
  }

  const pillBtn = (active: boolean): React.CSSProperties => ({
    padding: '6px 16px',
    borderRadius: '20px',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    border: active ? '1px solid #f0b429' : '1px solid #30363d',
    background: active ? '#f0b42920' : 'transparent',
    color: active ? '#f0b429' : '#8b949e',
    transition: 'all 0.15s',
  })

  return (
    <section style={{ marginBottom: '2rem' }}>
      <div
        style={{
          background: '#161b22',
          border: '1px solid #30363d',
          borderRadius: '12px',
          padding: '1.5rem',
        }}
      >
        <h2 style={{ color: '#e6edf3', fontSize: '15px', fontWeight: 600, margin: '0 0 1.25rem' }}>
          Where's My Money
        </h2>

        <form onSubmit={handleSubmit}>
          {/* Type toggle */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '1.25rem' }}>
            {(['expense', 'income', 'transfer'] as TxType[]).map((t) => (
              <button key={t} type="button" onClick={() => setType(t)} style={pillBtn(type === t)}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          {/* Amount + Currency row */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            <div style={{ flex: 1 }}>
              <input
                ref={amountRef}
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                style={{
                  ...inputStyle(),
                  fontSize: '24px',
                  fontWeight: 600,
                  padding: '10px 14px',
                  letterSpacing: '-0.5px',
                }}
              />
            </div>
            <div style={{ width: '100px' }}>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} style={selectStyle()}>
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* FX fields (non-SGD) */}
          {currency !== 'SGD' && (
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              <div style={{ flex: 1 }}>
                <input
                  type="number" step="0.0001" placeholder="FX Rate (1 SGD = ?)"
                  value={fxRate} onChange={(e) => setFxRate(e.target.value)}
                  style={inputStyle()}
                />
              </div>
              <div style={{ flex: 1 }}>
                <input
                  type="date" placeholder="FX Date"
                  value={fxDate} onChange={(e) => setFxDate(e.target.value)}
                  style={inputStyle()}
                />
              </div>
              {fxRate && amount && (
                <div style={{ display: 'flex', alignItems: 'center', color: '#8b949e', fontSize: '13px', whiteSpace: 'nowrap' }}>
                  = SGD {(parseFloat(amount) * parseFloat(fxRate)).toFixed(2)}
                </div>
              )}
            </div>
          )}

          {/* Account / To Account row */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            <div style={{ flex: 1 }}>
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)} required style={selectStyle()}>
                <option value="">Account</option>
                {activeAccounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
            {type === 'transfer' && (
              <div style={{ flex: 1 }}>
                <select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)} required style={selectStyle()}>
                  <option value="">To Account</option>
                  {activeAccounts.filter((a) => a.id !== accountId).map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Category (hidden for transfer) */}
          {type !== 'transfer' && (
            <div style={{ marginBottom: '12px' }}>
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} style={selectStyle()}>
                <option value="">Category (optional)</option>
                {filteredCategories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Payee */}
          <div style={{ marginBottom: '12px' }}>
            <input
              type="text" placeholder="Payee (optional)" value={payee}
              onChange={(e) => setPayee(e.target.value)}
              list="payees-list" autoComplete="off"
              style={inputStyle()}
            />
            <datalist id="payees-list">
              {payees.map((p) => <option key={p} value={p} />)}
            </datalist>
          </div>

          {/* Tags */}
          <div style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: selectedTagIds.length > 0 ? '8px' : '0' }}>
              {selectedTagIds.map((tid) => {
                const tag = tags.find((t) => t.id === tid)
                if (!tag) return null
                return (
                  <span
                    key={tid}
                    onClick={() => toggleTag(tid)}
                    style={{
                      background: '#f0b42920', border: '1px solid #f0b42960',
                      borderRadius: '12px', padding: '2px 10px', fontSize: '12px',
                      color: '#f0b429', cursor: 'pointer',
                    }}
                  >
                    {tag.name} ×
                  </span>
                )
              })}
            </div>
            <div style={{ position: 'relative' }}>
              <input
                type="text" placeholder="Add tags..." value={tagSearch}
                onChange={(e) => setTagSearch(e.target.value)}
                style={inputStyle()}
              />
              {tagSearch && (
                <div
                  style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                    background: '#1c2128', border: '1px solid #30363d', borderRadius: '8px',
                    marginTop: '4px', maxHeight: '180px', overflowY: 'auto',
                  }}
                >
                  {filteredTags.slice(0, 8).map((t) => (
                    <div
                      key={t.id}
                      onClick={() => { toggleTag(t.id); setTagSearch('') }}
                      style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '13px', color: '#e6edf3' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#30363d')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      {t.name}
                    </div>
                  ))}
                  {!filteredTags.some((t) => t.name.toLowerCase() === tagSearch.toLowerCase()) && (
                    <div
                      onClick={() => createAndAddTag(tagSearch)}
                      style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '13px', color: '#f0b429' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#30363d')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      + Create "{tagSearch}"
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Note (expandable) */}
          {!showNoteField ? (
            <button
              type="button"
              onClick={() => setShowNoteField(true)}
              style={{ background: 'none', border: 'none', color: '#8b949e', fontSize: '13px', cursor: 'pointer', marginBottom: '12px', padding: 0 }}
            >
              + Add note
            </button>
          ) : (
            <div style={{ marginBottom: '12px' }}>
              <textarea
                placeholder="Note (optional)" value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2} autoFocus
                style={{ ...inputStyle(), resize: 'vertical', fontFamily: 'inherit' }}
              />
            </div>
          )}

          {/* DateTime */}
          <div style={{ marginBottom: '1.25rem' }}>
            <input
              type="datetime-local" value={datetime}
              onChange={(e) => setDatetime(e.target.value)}
              style={inputStyle()}
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={saving || !amount || !accountId}
            style={{
              width: '100%',
              padding: '10px',
              borderRadius: '8px',
              border: 'none',
              fontSize: '14px',
              fontWeight: 600,
              cursor: saving || !amount || !accountId ? 'not-allowed' : 'pointer',
              background: saving || !amount || !accountId ? '#21262d' : '#f0b429',
              color: saving || !amount || !accountId ? '#484f58' : '#0d1117',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.15s',
            }}
          >
            {saving ? (
              <>
                <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25"/>
                  <path d="M12 2a10 10 0 0110 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
                </svg>
                Saving...
              </>
            ) : 'Save transaction'}
          </button>
        </form>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add app/(protected)/components/wheres-my-money.tsx
git commit -m "feat: Where's My Money transaction entry form"
```

---

## Task 9: Recent Transactions List

**Files:**
- Create: `app/(protected)/components/recent-transactions.tsx`

This is a client component (needs to refresh on `transaction-saved` event and handle edit/delete).

- [ ] **Step 1: Create app/(protected)/components/recent-transactions.tsx**

```typescript
'use client'

import { useState, useEffect, useCallback } from 'react'
import type { TransactionRow } from '@/lib/types'
import { useToast } from './toast'

function formatAmount(row: TransactionRow) {
  const prefix = row.type === 'expense' ? '-' : row.type === 'income' ? '+' : ''
  const val = row.currency !== 'SGD' && row.sgd_equivalent != null
    ? `${row.currency} ${row.amount.toFixed(2)} (SGD ${(row.sgd_equivalent as number).toFixed(2)})`
    : `SGD ${row.amount.toFixed(2)}`
  return `${prefix}${val}`
}

function typeColor(type: string) {
  if (type === 'expense') return '#f85149'
  if (type === 'income') return '#3fb884'
  return '#8b949e'
}

function formatDatetime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('en-SG', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export function RecentTransactions() {
  const { showToast } = useToast()
  const [transactions, setTransactions] = useState<TransactionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/transactions?limit=20')
      const data = await res.json()
      setTransactions(data.data ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const handler = () => load()
    window.addEventListener('transaction-saved', handler)
    return () => window.removeEventListener('transaction-saved', handler)
  }, [load])

  async function deleteTransaction(id: string) {
    if (!confirm('Delete this transaction?')) return
    setDeletingId(id)
    try {
      const res = await fetch(`/api/transactions/${id}`, { method: 'DELETE' })
      if (res.ok) {
        showToast('Transaction deleted', 'success')
        setTransactions((prev) => prev.filter((t) => t.id !== id))
      } else {
        showToast('Failed to delete', 'error')
      }
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <section>
      <h2 style={{ color: '#8b949e', fontSize: '12px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 12px' }}>
        Recent Transactions
      </h2>
      <div
        style={{
          background: '#161b22',
          border: '1px solid #30363d',
          borderRadius: '12px',
          overflow: 'hidden',
        }}
      >
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#8b949e', fontSize: '14px' }}>
            Loading...
          </div>
        ) : transactions.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#8b949e', fontSize: '14px' }}>
            No transactions yet. Add one above.
          </div>
        ) : (
          transactions.map((tx, i) => (
            <div
              key={tx.id}
              style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                padding: '12px 16px',
                borderBottom: i < transactions.length - 1 ? '1px solid #21262d' : 'none',
              }}
            >
              {/* Type dot */}
              <div
                style={{
                  width: '8px', height: '8px', borderRadius: '50%',
                  background: typeColor(tx.type), flexShrink: 0,
                }}
              />

              {/* Main info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                  <span style={{ color: '#e6edf3', fontSize: '14px', fontWeight: 500 }}>
                    {tx.payee ?? tx.category_name ?? tx.account_name}
                  </span>
                  {tx.tags && tx.tags.length > 0 && (
                    <span style={{ color: '#8b949e', fontSize: '11px' }}>
                      {tx.tags.map((t) => t.name).join(', ')}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '2px' }}>
                  <span style={{ color: '#484f58', fontSize: '12px' }}>
                    {formatDatetime(tx.datetime)}
                  </span>
                  {tx.account_name && (
                    <span style={{ color: '#484f58', fontSize: '12px' }}>
                      {tx.type === 'transfer'
                        ? `${tx.account_name} - ${tx.to_account_name ?? ''}`
                        : tx.account_name}
                    </span>
                  )}
                  {tx.note && (
                    <span style={{ color: '#8b949e', fontSize: '12px', fontStyle: 'italic' }}>
                      {tx.note.length > 40 ? tx.note.slice(0, 40) + '...' : tx.note}
                    </span>
                  )}
                </div>
              </div>

              {/* Amount */}
              <span
                style={{
                  fontSize: '14px', fontWeight: 600, flexShrink: 0,
                  color: typeColor(tx.type),
                }}
              >
                {formatAmount(tx)}
              </span>

              {/* Delete */}
              <button
                onClick={() => deleteTransaction(tx.id)}
                disabled={deletingId === tx.id}
                style={{
                  background: 'none', border: 'none',
                  color: deletingId === tx.id ? '#484f58' : '#8b949e',
                  cursor: deletingId === tx.id ? 'not-allowed' : 'pointer',
                  padding: '4px', fontSize: '16px', lineHeight: 1,
                  flexShrink: 0,
                }}
                title="Delete"
              >
                {deletingId === tx.id ? '...' : '×'}
              </button>
            </div>
          ))
        )}
      </div>
    </section>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add app/(protected)/components/recent-transactions.tsx
git commit -m "feat: recent transactions list with delete"
```

---

## Task 10: Wire up, final TypeScript check, push

- [ ] **Step 1: Update app/(protected)/dashboard/page.tsx (optional cleanup)**

The old `/dashboard` page can be repurposed as a redirect to `/`:

```typescript
import { redirect } from 'next/navigation'
export default function DashboardPage() { redirect('/') }
```

- [ ] **Step 2: Final TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Test migration + seed on fresh state**

```bash
rm -f local.db
npm run migrate
npm run seed
```

Expected: both commands complete without error.

- [ ] **Step 4: Update .env.local with local.db note**

Add comment in `.env.local`:
```
# Local dev: if TURSO_DATABASE_URL is unset, falls back to file:local.db
# Run: npm run migrate && npm run seed
```

- [ ] **Step 5: Final commit + push**

```bash
git add -A
git commit -m "feat: wire up dashboard, cleanup old dashboard page"
git push origin main
```

---

## Self-Review

**Spec coverage check:**
- [x] Accounts table + all columns
- [x] Categories table
- [x] Tags table
- [x] Transactions table (all columns incl. fx_rate, fx_date, sgd_equivalent, full datetime)
- [x] transaction_tags junction table
- [x] Indexes on datetime, account_id, category_id, type
- [x] Migration script
- [x] Seed: all 14 accounts (including 6674 as is_active=0)
- [x] Seed: all 17 categories (10 expense + 7 income)
- [x] Seed: all 15 tags
- [x] Accounts API: GET, POST, PATCH, DELETE (soft)
- [x] Categories API: GET (filter by type), POST, PATCH, DELETE
- [x] Tags API: GET, POST, PATCH, DELETE
- [x] Transactions API: GET (paginated, filtered), POST, PATCH, DELETE
- [x] Transfer validation (both accounts exist + active)
- [x] `params` as Promise (`await params`) in all dynamic route handlers
- [x] Where's My Money panel at `app/(protected)/page.tsx`
- [x] Amount field large + prominent
- [x] Type toggle: Expense / Income / Transfer
- [x] Account dropdown with localStorage memory
- [x] To Account dropdown (Transfer only)
- [x] Category dropdown (filtered by type, hidden for Transfer)
- [x] Tags multi-select with inline create
- [x] Payee autocomplete via datalist
- [x] Note field (expandable)
- [x] DateTime picker defaulting to SGT now
- [x] Currency selector + FX rate + FX date fields (non-SGD)
- [x] Save button with loading state
- [x] Toast notifications
- [x] Recent transactions list (last 20)
- [x] Delete from recent list
- [x] Dark navy theme consistent with login
- [x] Commits after each milestone
