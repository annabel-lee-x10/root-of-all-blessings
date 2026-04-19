# Bulk Receipt Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add bulk receipt photo upload + voice-to-text expense capture to the Where's My Money page, with draft transactions reviewable in a collapsible card at the bottom of the same page.

**Architecture:** Serial per-image API calls (one at a time from client). Each image is sent to `POST /api/receipts/process`, which calls Claude Sonnet vision, parses the bless-this output format, and creates a `status='draft'` transaction in the DB. Voice input uses the browser's Web Speech API for transcription (zero cost), then sends the text to `POST /api/receipts/voice` for Claude text-mode parsing. Drafts are reviewed in a collapsible `DraftsCard` component that's the last section on the dashboard page.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Turso (libSQL via `db.execute({ sql, args })`), Vitest + better-sqlite3 for tests, Anthropic API via raw `fetch` (no SDK), inline React styles (dark GitHub theme).

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| **Modify** | `lib/types.ts` | Add `status` to Transaction type |
| **Modify** | `tests/helpers.ts` | Add `status` column to test schema, update `seedTransaction` |
| **Modify** | `scripts/migrate.ts` | Add `transactions.status` idempotent migration |
| **Modify** | `app/api/migrate/route.ts` | Add `transactions.status` migration entry |
| **Modify** | `app/api/transactions/route.ts` | GET: exclude drafts by default; add `?status=draft` support |
| **Modify** | `app/api/transactions/[id]/route.ts` | Add `'status'` to UPDATABLE array (for approve flow) |
| **Create** | `app/api/receipts/_lib.ts` | Shared: resolveAccount, resolveTagIds, insertDraftTransaction |
| **Create** | `app/api/receipts/process/route.ts` | POST: image → Claude vision → draft transaction |
| **Create** | `app/api/receipts/voice/route.ts` | POST: text transcript → Claude text → draft transaction |
| **Create** | `app/(protected)/components/receipt-dropzone.tsx` | Drop zone + per-file progress + voice mic button |
| **Create** | `app/(protected)/components/drafts-card.tsx` | Collapsible draft review, edit, approve, bulk-approve |
| **Modify** | `app/(protected)/page.tsx` | Add `<ReceiptDropzone />` and `<DraftsCard />` |
| **Create** | `tests/api/receipts.test.ts` | API unit tests for `/api/receipts/process` |
| **Create** | `tests/api/receipts-voice.test.ts` | API unit tests for `/api/receipts/voice` |

---

## Task 1: Foundation — DB status column, types, migrations

No TDD loop — this is pure structural groundwork. All subsequent tasks depend on it.

**Files:**
- Modify: `lib/types.ts`
- Modify: `tests/helpers.ts`
- Modify: `scripts/migrate.ts`
- Modify: `app/api/migrate/route.ts`

- [ ] **Step 1: Add `status` to Transaction type in `lib/types.ts`**

Add `status` after the `datetime` field:

```typescript
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
  payment_method: string | null
  datetime: string
  status: 'draft' | 'approved'   // ← ADD THIS LINE
  created_at: string
  updated_at: string
}
```

- [ ] **Step 2: Add `status` column to test schema in `tests/helpers.ts`**

In the `SCHEMA` constant, inside the `transactions` CREATE TABLE statement, add the `status` column between `payment_method` and `datetime`:

```sql
-- existing line:
payment_method TEXT,
-- ADD:
status TEXT NOT NULL DEFAULT 'approved',
-- existing line:
datetime TEXT NOT NULL,
```

The full updated CREATE TABLE for transactions looks like:
```sql
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
```

- [ ] **Step 3: Update `seedTransaction` in `tests/helpers.ts` to include `status`**

Add `status` to the opts type and the INSERT statement:

```typescript
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
    datetime?: string
    status?: 'draft' | 'approved'   // ← ADD
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
    datetime = n,
    status = 'approved',   // ← ADD
  } = opts
  testDb.prepare(
    `INSERT INTO transactions
      (id, type, amount, currency, fx_rate, fx_date, sgd_equivalent,
       account_id, to_account_id, category_id, payee, note, payment_method, status, datetime, created_at, updated_at)
     VALUES (?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, type, amount, currency, accountId, toAccountId, categoryId, payee, note, payment_method, status, datetime, n, n)
}
```

- [ ] **Step 4: Add status migration to `scripts/migrate.ts`**

In the `migrate()` function, after the existing try/catch blocks at the bottom, add:

```typescript
// Idempotent: add status column to transactions (drafts system)
try {
  await db.execute("ALTER TABLE transactions ADD COLUMN status TEXT NOT NULL DEFAULT 'approved'")
} catch {
  // Column already exists — safe to ignore
}
```

- [ ] **Step 5: Add status migration to `app/api/migrate/route.ts`**

Add a new entry to the `migrations` array:

```typescript
{
  name: 'transactions.status',
  sql: "ALTER TABLE transactions ADD COLUMN status TEXT NOT NULL DEFAULT 'approved'",
},
```

- [ ] **Step 6: Verify existing tests still pass**

```bash
cd /d/a10101100_labs/root-of-all-blessings
npx vitest run
```

Expected: all existing tests pass (the schema change is backward-compatible since DEFAULT 'approved' is used).

- [ ] **Step 7: Commit**

```bash
git add lib/types.ts tests/helpers.ts scripts/migrate.ts app/api/migrate/route.ts
git commit -m "feat: add status column to transactions for draft support"
```

---

## Task 2: Filter drafts from GET /api/transactions (TDD)

**Files:**
- Test: `tests/api/transactions.test.ts` (append new describe block)
- Modify: `app/api/transactions/route.ts`

- [ ] **Step 1: Write failing tests — append to `tests/api/transactions.test.ts`**

Append these describes after the existing `describe('POST /api/transactions', ...)` block:

```typescript
describe('GET /api/transactions — draft filtering', () => {
  it('does not return draft transactions by default', async () => {
    seedTransaction('tx-approved', 'acc1', { status: 'approved' })
    seedTransaction('tx-draft', 'acc1', { status: 'draft' })
    const { GET } = await import('@/app/api/transactions/route')
    const res = await GET(req('/api/transactions'))
    const data = await res.json()
    expect(data.total).toBe(1)
    expect(data.data[0].id).toBe('tx-approved')
  })

  it('returns only drafts when ?status=draft', async () => {
    seedTransaction('tx-approved', 'acc1', { status: 'approved' })
    seedTransaction('tx-draft', 'acc1', { status: 'draft' })
    const { GET } = await import('@/app/api/transactions/route')
    const res = await GET(req('/api/transactions?status=draft'))
    const data = await res.json()
    expect(data.total).toBe(1)
    expect(data.data[0].id).toBe('tx-draft')
  })

  it('total reflects the filter, not all transactions', async () => {
    for (let i = 0; i < 3; i++) seedTransaction(`tx-a${i}`, 'acc1', { status: 'approved' })
    for (let i = 0; i < 2; i++) seedTransaction(`tx-d${i}`, 'acc1', { status: 'draft' })
    const { GET } = await import('@/app/api/transactions/route')
    const res = await GET(req('/api/transactions'))
    const data = await res.json()
    expect(data.total).toBe(3)
  })
})
```

- [ ] **Step 2: Run to verify new tests fail**

```bash
npx vitest run tests/api/transactions.test.ts
```

Expected: 3 new failures — drafts appear in the default list because the filter doesn't exist yet.

- [ ] **Step 3: Implement draft filtering in `app/api/transactions/route.ts`**

In the `GET` handler, add status filtering. Find the section that builds `where`/`args` (after parsing query params `type`, `account_id`, etc.) and add:

```typescript
const status = p.get('status')  // 'draft' or null (default = approved)
```

Then inside the `where` / `args` build section, add this after the existing filter blocks:

```typescript
if (status === 'draft') {
  where.push("t.status = 'draft'")
} else {
  // Default: exclude drafts (also handles rows without status column during migration window)
  where.push("(t.status IS NULL OR t.status = 'approved')")
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/api/transactions.test.ts
```

Expected: all tests pass including the 3 new ones.

- [ ] **Step 5: Commit**

```bash
git add app/api/transactions/route.ts tests/api/transactions.test.ts
git commit -m "feat: filter drafts from default transaction list; add ?status=draft support"
```

---

## Task 3: PATCH /api/transactions/[id] — support status field (TDD)

**Files:**
- Test: `tests/api/transactions.test.ts` (append)
- Modify: `app/api/transactions/[id]/route.ts`

- [ ] **Step 1: Write failing test — append to `tests/api/transactions.test.ts`**

```typescript
describe('PATCH /api/transactions/[id] — status', () => {
  it('can approve a draft by setting status=approved', async () => {
    seedTransaction('tx-draft', 'acc1', { status: 'draft' })
    const { PATCH } = await import('@/app/api/transactions/[id]/route')
    const res = await PATCH(
      req('/api/transactions/tx-draft', 'PATCH', { status: 'approved' }),
      { params: Promise.resolve({ id: 'tx-draft' }) }
    )
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.status).toBe('approved')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run tests/api/transactions.test.ts
```

Expected: 1 failure — `status` is not in UPDATABLE so the field is ignored; `data.status` is still `'draft'`.

- [ ] **Step 3: Add `'status'` to UPDATABLE in `app/api/transactions/[id]/route.ts`**

Change the `UPDATABLE` constant from:

```typescript
const UPDATABLE = ['type','amount','currency','fx_rate','fx_date','sgd_equivalent',
                   'account_id','to_account_id','category_id','payee','note','payment_method','datetime']
```

To:

```typescript
const UPDATABLE = ['type','amount','currency','fx_rate','fx_date','sgd_equivalent',
                   'account_id','to_account_id','category_id','payee','note','payment_method','datetime','status']
```

- [ ] **Step 4: Run to verify it passes**

```bash
npx vitest run tests/api/transactions.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/api/transactions/[id]/route.ts tests/api/transactions.test.ts
git commit -m "feat: allow PATCH to update transaction status (draft → approved)"
```

---

## Task 4: Receipt image processing API (TDD)

**Files:**
- Create: `tests/api/receipts.test.ts`
- Create: `app/api/receipts/_lib.ts`
- Create: `app/api/receipts/process/route.ts`

- [ ] **Step 1: Create `tests/api/receipts.test.ts`**

```typescript
// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import { verifySession } from '@/lib/session'
import {
  initTestDb, clearTestDb, resetTestDb, req,
  seedAccount, seedCategory, seedTag,
} from '../helpers'

vi.mock('@/lib/session', () => ({
  verifySession: vi.fn().mockResolvedValue(true),
  verifySessionToken: vi.fn().mockResolvedValue(true),
}))

// Minimal valid 1×1 PNG in base64 (~68 bytes decoded — well within 5 MB limit)
const VALID_IMAGE_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

const MOCK_CLAUDE_RESPONSE = {
  content: [{
    type: 'text',
    text: [
      'Amount: 23.50',
      'Currency: SGD',
      'Merchant/Payee: NTUC FairPrice',
      'Date: 2026-04-19',
      'Category: Food',
      'Tags: groceries, essentials, supermarket',
      'Description: Weekly groceries run.',
      'Payment Method: credit card',
    ].join('\n'),
  }],
}

beforeAll(() => initTestDb())
afterAll(() => clearTestDb())

beforeEach(() => {
  resetTestDb()
  seedAccount('acc1', 'DBS', 'bank')
  seedCategory('cat1', 'Food', 'expense')
  process.env.ANTHROPIC_API_KEY = 'test-key'
  vi.mocked(verifySession).mockResolvedValue(true)
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => MOCK_CLAUDE_RESPONSE,
  } as Response))
})

afterEach(() => {
  vi.restoreAllMocks()
  delete process.env.ANTHROPIC_API_KEY
})

describe('POST /api/receipts/process', () => {
  it('returns 401 when no session', async () => {
    vi.mocked(verifySession).mockResolvedValueOnce(false)
    const { POST } = await import('@/app/api/receipts/process/route')
    const res = await POST(req('/api/receipts/process', 'POST', {
      imageBase64: VALID_IMAGE_BASE64,
      mediaType: 'image/png',
      accountId: 'acc1',
    }))
    expect(res.status).toBe(401)
  })

  it('returns 503 when ANTHROPIC_API_KEY is not set', async () => {
    delete process.env.ANTHROPIC_API_KEY
    const { POST } = await import('@/app/api/receipts/process/route')
    const res = await POST(req('/api/receipts/process', 'POST', {
      imageBase64: VALID_IMAGE_BASE64,
      mediaType: 'image/png',
      accountId: 'acc1',
    }))
    expect(res.status).toBe(503)
  })

  it('returns 400 when imageBase64 is missing', async () => {
    const { POST } = await import('@/app/api/receipts/process/route')
    const res = await POST(req('/api/receipts/process', 'POST', {
      mediaType: 'image/jpeg',
      accountId: 'acc1',
    }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toMatch(/imageBase64/i)
  })

  it('returns 400 when mediaType is not an image', async () => {
    const { POST } = await import('@/app/api/receipts/process/route')
    const res = await POST(req('/api/receipts/process', 'POST', {
      imageBase64: VALID_IMAGE_BASE64,
      mediaType: 'application/pdf',
      accountId: 'acc1',
    }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toMatch(/mediaType/i)
  })

  it('creates a draft transaction with parsed fields', async () => {
    const { POST } = await import('@/app/api/receipts/process/route')
    const res = await POST(req('/api/receipts/process', 'POST', {
      imageBase64: VALID_IMAGE_BASE64,
      mediaType: 'image/png',
      accountId: 'acc1',
    }))
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.draft).toBeDefined()
    expect(data.draft.status).toBe('draft')
    expect(data.draft.amount).toBe(23.5)
    expect(data.draft.payee).toBe('NTUC FairPrice')
    expect(data.draft.category_name).toBe('Food')
    expect(data.draft.payment_method).toBe('credit card')
    expect(data.draft.account_id).toBe('acc1')
  })

  it('auto-creates tags from Claude output', async () => {
    const { POST } = await import('@/app/api/receipts/process/route')
    await POST(req('/api/receipts/process', 'POST', {
      imageBase64: VALID_IMAGE_BASE64,
      mediaType: 'image/png',
      accountId: 'acc1',
    }))
    const { GET } = await import('@/app/api/tags/route')
    const tagsRes = await GET(req('/api/tags'))
    const tags = (await tagsRes.json()) as Array<{ name: string }>
    expect(tags.map((t) => t.name)).toEqual(
      expect.arrayContaining(['groceries', 'essentials', 'supermarket'])
    )
  })

  it('reuses existing tags instead of creating duplicates', async () => {
    seedTag('tag-existing', 'groceries')
    const { POST } = await import('@/app/api/receipts/process/route')
    await POST(req('/api/receipts/process', 'POST', {
      imageBase64: VALID_IMAGE_BASE64,
      mediaType: 'image/png',
      accountId: 'acc1',
    }))
    const { GET } = await import('@/app/api/tags/route')
    const tagsRes = await GET(req('/api/tags'))
    const tags = (await tagsRes.json()) as Array<{ name: string }>
    expect(tags.filter((t) => t.name === 'groceries')).toHaveLength(1)
  })

  it('leaves category_id null when no category match', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ type: 'text', text: 'Amount: 10\nMerchant/Payee: GameShop\nCategory: Electronics' }],
      }),
    } as Response))
    const { POST } = await import('@/app/api/receipts/process/route')
    const res = await POST(req('/api/receipts/process', 'POST', {
      imageBase64: VALID_IMAGE_BASE64,
      mediaType: 'image/png',
      accountId: 'acc1',
    }))
    const data = await res.json()
    expect(data.draft.category_id).toBeNull()
  })

  it('falls back to first active account when accountId not provided', async () => {
    const { POST } = await import('@/app/api/receipts/process/route')
    const res = await POST(req('/api/receipts/process', 'POST', {
      imageBase64: VALID_IMAGE_BASE64,
      mediaType: 'image/png',
    }))
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.draft.account_id).toBe('acc1')
  })

  it('returns 500 when Anthropic API call fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'overloaded' }),
    } as Response))
    const { POST } = await import('@/app/api/receipts/process/route')
    const res = await POST(req('/api/receipts/process', 'POST', {
      imageBase64: VALID_IMAGE_BASE64,
      mediaType: 'image/png',
      accountId: 'acc1',
    }))
    expect(res.status).toBe(500)
  })
})
```

- [ ] **Step 2: Run to verify all tests fail (module not found)**

```bash
npx vitest run tests/api/receipts.test.ts
```

Expected: tests fail because `@/app/api/receipts/process/route` does not exist yet.

- [ ] **Step 3: Create the shared helper `app/api/receipts/_lib.ts`**

```typescript
import { db } from '@/lib/db'
import type { TransactionRow } from '@/lib/types'

export async function resolveAccount(accountId?: string): Promise<string | null> {
  if (accountId) {
    const check = await db.execute({
      sql: 'SELECT id FROM accounts WHERE id = ? AND is_active = 1',
      args: [accountId],
    })
    if (check.rows.length > 0) return accountId
  }
  const fallback = await db.execute({
    sql: 'SELECT id FROM accounts WHERE is_active = 1 ORDER BY updated_at DESC LIMIT 1',
    args: [],
  })
  if (fallback.rows.length === 0) return null
  return fallback.rows[0].id as string
}

export async function resolveTagIds(tagNames: string[]): Promise<string[]> {
  const ids: string[] = []
  for (const name of tagNames) {
    const existing = await db.execute({
      sql: 'SELECT id FROM tags WHERE LOWER(name) = LOWER(?)',
      args: [name],
    })
    if (existing.rows.length > 0) {
      ids.push(existing.rows[0].id as string)
    } else {
      const newId = crypto.randomUUID()
      await db.execute({
        sql: 'INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?)',
        args: [newId, name, new Date().toISOString()],
      })
      ids.push(newId)
    }
  }
  return ids
}

export async function insertDraftTransaction(opts: {
  accountId: string
  categoryId: string | null
  payee: string | null
  note: string | null
  paymentMethod: string | null
  amount: number
  currency: string
  datetime: string
  tagIds: string[]
}): Promise<TransactionRow> {
  const id = crypto.randomUUID()
  const n = new Date().toISOString()
  await db.execute({
    sql: `INSERT INTO transactions
            (id, type, amount, currency, fx_rate, fx_date, sgd_equivalent,
             account_id, to_account_id, category_id, payee, note, payment_method,
             status, datetime, created_at, updated_at)
          VALUES (?, 'expense', ?, ?, NULL, NULL, NULL, ?, NULL, ?, ?, ?, ?, 'draft', ?, ?, ?)`,
    args: [
      id,
      opts.amount,
      opts.currency,
      opts.accountId,
      opts.categoryId,
      opts.payee,
      opts.note,
      opts.paymentMethod,
      opts.datetime,
      n, n,
    ],
  })
  for (const tagId of opts.tagIds) {
    await db.execute({
      sql: 'INSERT OR IGNORE INTO transaction_tags (transaction_id, tag_id) VALUES (?, ?)',
      args: [id, tagId],
    })
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
  const tagRows = await db.execute({
    sql: `SELECT tt.tag_id as id, tg.name
          FROM transaction_tags tt
          JOIN tags tg ON tt.tag_id = tg.id
          WHERE tt.transaction_id = ?`,
    args: [id],
  })
  return {
    ...row.rows[0],
    tags: tagRows.rows.map((r) => ({ id: r.id as string, name: r.name as string, created_at: '' })),
  } as unknown as TransactionRow
}
```

- [ ] **Step 4: Create `app/api/receipts/process/route.ts`**

```typescript
import { NextRequest } from 'next/server'
import { verifySession } from '@/lib/session'
import { db } from '@/lib/db'
import { parseBlessThis } from '@/lib/parse-bless-this'
import { resolveAccount, resolveTagIds, insertDraftTransaction } from '../_lib'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const MAX_IMAGE_BYTES = 5 * 1024 * 1024 // 5 MB

const RECEIPT_PROMPT = `You are a receipt parser for a personal finance app. Extract all available expense information from this receipt image.

Output EXACTLY in this format (omit lines you cannot determine):
Amount: [total amount, numbers only]
Currency: [3-letter code, default SGD]
Merchant/Payee: [store or vendor name]
Date: [YYYY-MM-DD]
Time: [HH:MM 24h]
Category: [one of: Food, Transport, Housing, Bills, Health, Entertainment, Subscriptions, Education, Pet, Other]
Tags: [3-5 lowercase comma-separated contextual tags]
Description: [1-2 sentence description of the purchase context]
Payment Method: [cash/credit card/debit card/e-wallet]
Notes: [any extra detail]

Rules:
- Amount is the grand total (GST-inclusive if shown)
- Category inferred from merchant type and line items
- Tags: use item types, time of day, merchant type, spend amount as signals
- If a field cannot be determined, omit that line entirely`

export async function POST(request: NextRequest) {
  const valid = await verifySession()
  if (!valid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return Response.json({ error: 'Receipt processing not configured' }, { status: 503 })

  let body: { imageBase64?: string; mediaType?: string; merchantLookup?: boolean; accountId?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { imageBase64, mediaType, merchantLookup = false, accountId } = body

  if (!imageBase64) return Response.json({ error: 'imageBase64 is required' }, { status: 400 })
  if (!mediaType || !mediaType.startsWith('image/')) {
    return Response.json({ error: 'mediaType must be an image/* type' }, { status: 400 })
  }

  const byteLength = Buffer.from(imageBase64, 'base64').length
  if (byteLength > MAX_IMAGE_BYTES) {
    return Response.json({ error: 'Image exceeds 5 MB limit' }, { status: 400 })
  }

  const resolvedAccountId = await resolveAccount(accountId)
  if (!resolvedAccountId) return Response.json({ error: 'No active account found' }, { status: 400 })

  const anthropicRes = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
          { type: 'text', text: RECEIPT_PROMPT },
        ],
      }],
    }),
  })

  if (!anthropicRes.ok) return Response.json({ error: 'Receipt processing failed' }, { status: 500 })

  const anthropicData = await anthropicRes.json()
  const rawText: string = anthropicData.content?.[0]?.text ?? ''
  const parsed = parseBlessThis(rawText)

  // Optional merchant lookup: second Claude text call
  let merchantNote = ''
  if (merchantLookup && parsed.payee) {
    try {
      const lookupRes = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 256,
          messages: [{
            role: 'user',
            content: `Describe "${parsed.payee}" in 1-2 sentences: what kind of place is it, what's the vibe, where is it typically found? Be concise and conversational. If you don't know, respond only with: UNKNOWN`,
          }],
        }),
      })
      if (lookupRes.ok) {
        const lookupData = await lookupRes.json()
        const lookupText: string = lookupData.content?.[0]?.text ?? ''
        if (!lookupText.toUpperCase().includes('UNKNOWN')) {
          merchantNote = lookupText.trim()
        }
      }
    } catch { /* non-fatal: skip merchant lookup on error */ }
  }

  // Match category by name
  const catResult = await db.execute({
    sql: 'SELECT id, name FROM categories WHERE type = ?',
    args: ['expense'],
  })
  let categoryId: string | null = null
  if (parsed.category) {
    const match = catResult.rows.find(
      (c) => (c.name as string).toLowerCase() === parsed.category!.toLowerCase()
    )
    if (match) categoryId = match.id as string
  }

  const tagIds = parsed.tags ? await resolveTagIds(parsed.tags) : []

  // Build note: merchant description + parsed notes
  const noteText = [merchantNote, parsed.notes].filter(Boolean).join(' ') || null

  // Build datetime from parsed date + time (default to now in SGT)
  let datetime = new Date().toISOString()
  if (parsed.date) {
    const timePart = parsed.time ?? '00:00'
    datetime = `${parsed.date}T${timePart}:00+08:00`
  }

  const draft = await insertDraftTransaction({
    accountId: resolvedAccountId,
    categoryId,
    payee: parsed.payee ?? null,
    note: noteText,
    paymentMethod: parsed.payment_method ?? null,
    amount: parsed.amount ?? 0,
    currency: parsed.currency ?? 'SGD',
    datetime,
    tagIds,
  })

  return Response.json({ draft }, { status: 201 })
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run tests/api/receipts.test.ts
```

Expected: all 9 tests pass.

- [ ] **Step 6: Commit**

```bash
git add app/api/receipts/_lib.ts app/api/receipts/process/route.ts tests/api/receipts.test.ts
git commit -m "feat: add receipt image processing API — Claude vision → draft transaction"
```

---

## Task 5: Receipt voice API (TDD)

**Files:**
- Create: `tests/api/receipts-voice.test.ts`
- Create: `app/api/receipts/voice/route.ts`

- [ ] **Step 1: Create `tests/api/receipts-voice.test.ts`**

```typescript
// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import { verifySession } from '@/lib/session'
import {
  initTestDb, clearTestDb, resetTestDb, req,
  seedAccount, seedCategory,
} from '../helpers'

vi.mock('@/lib/session', () => ({
  verifySession: vi.fn().mockResolvedValue(true),
  verifySessionToken: vi.fn().mockResolvedValue(true),
}))

const MOCK_CLAUDE_RESPONSE = {
  content: [{
    type: 'text',
    text: [
      'Amount: 5.50',
      'Currency: SGD',
      'Merchant/Payee: Kopitiam',
      'Date: 2026-04-19',
      'Category: Food',
      'Tags: lunch, hawker, local',
      'Description: Quick lunch at the hawker centre.',
    ].join('\n'),
  }],
}

beforeAll(() => initTestDb())
afterAll(() => clearTestDb())

beforeEach(() => {
  resetTestDb()
  seedAccount('acc1', 'DBS', 'bank')
  seedCategory('cat1', 'Food', 'expense')
  process.env.ANTHROPIC_API_KEY = 'test-key'
  vi.mocked(verifySession).mockResolvedValue(true)
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => MOCK_CLAUDE_RESPONSE,
  } as Response))
})

afterEach(() => {
  vi.restoreAllMocks()
  delete process.env.ANTHROPIC_API_KEY
})

describe('POST /api/receipts/voice', () => {
  it('returns 401 when no session', async () => {
    vi.mocked(verifySession).mockResolvedValueOnce(false)
    const { POST } = await import('@/app/api/receipts/voice/route')
    const res = await POST(req('/api/receipts/voice', 'POST', {
      text: 'lunch at kopitiam 5.50',
      accountId: 'acc1',
    }))
    expect(res.status).toBe(401)
  })

  it('returns 503 when ANTHROPIC_API_KEY is not set', async () => {
    delete process.env.ANTHROPIC_API_KEY
    const { POST } = await import('@/app/api/receipts/voice/route')
    const res = await POST(req('/api/receipts/voice', 'POST', {
      text: 'lunch 5.50',
      accountId: 'acc1',
    }))
    expect(res.status).toBe(503)
  })

  it('returns 400 when text is missing', async () => {
    const { POST } = await import('@/app/api/receipts/voice/route')
    const res = await POST(req('/api/receipts/voice', 'POST', { accountId: 'acc1' }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toMatch(/text/i)
  })

  it('returns 400 when text is empty string', async () => {
    const { POST } = await import('@/app/api/receipts/voice/route')
    const res = await POST(req('/api/receipts/voice', 'POST', { text: '   ', accountId: 'acc1' }))
    expect(res.status).toBe(400)
  })

  it('creates a draft transaction from voice transcript', async () => {
    const { POST } = await import('@/app/api/receipts/voice/route')
    const res = await POST(req('/api/receipts/voice', 'POST', {
      text: 'lunch at kopitiam 5.50',
      accountId: 'acc1',
    }))
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.draft).toBeDefined()
    expect(data.draft.status).toBe('draft')
    expect(data.draft.amount).toBe(5.5)
    expect(data.draft.payee).toBe('Kopitiam')
    expect(data.draft.account_id).toBe('acc1')
  })

  it('falls back to first active account when accountId not provided', async () => {
    const { POST } = await import('@/app/api/receipts/voice/route')
    const res = await POST(req('/api/receipts/voice', 'POST', {
      text: 'coffee 4 bucks',
    }))
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.draft.account_id).toBe('acc1')
  })
})
```

- [ ] **Step 2: Run to verify tests fail (module not found)**

```bash
npx vitest run tests/api/receipts-voice.test.ts
```

Expected: fail — route does not exist yet.

- [ ] **Step 3: Create `app/api/receipts/voice/route.ts`**

```typescript
import { NextRequest } from 'next/server'
import { verifySession } from '@/lib/session'
import { db } from '@/lib/db'
import { parseBlessThis } from '@/lib/parse-bless-this'
import { resolveAccount, resolveTagIds, insertDraftTransaction } from '../_lib'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'

function buildVoicePrompt(text: string): string {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' })
  return `You are an expense parser for a personal finance app. The user described an expense in natural language (possibly transcribed from voice). Extract all available information.

Output EXACTLY in this format (omit lines you cannot determine):
Amount: [amount, numbers only]
Currency: [3-letter code, default SGD]
Merchant/Payee: [merchant or payee name]
Date: [YYYY-MM-DD, default today: ${today}]
Category: [one of: Food, Transport, Housing, Bills, Health, Entertainment, Subscriptions, Education, Pet, Other]
Tags: [3-5 lowercase comma-separated contextual tags]
Description: [1-2 sentence description]
Payment Method: [cash/credit card/debit card/e-wallet]

User input: "${text}"`
}

export async function POST(request: NextRequest) {
  const valid = await verifySession()
  if (!valid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return Response.json({ error: 'Receipt processing not configured' }, { status: 503 })

  let body: { text?: string; accountId?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { text, accountId } = body
  if (!text || !text.trim()) return Response.json({ error: 'text is required' }, { status: 400 })

  const resolvedAccountId = await resolveAccount(accountId)
  if (!resolvedAccountId) return Response.json({ error: 'No active account found' }, { status: 400 })

  const anthropicRes = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      messages: [{ role: 'user', content: buildVoicePrompt(text) }],
    }),
  })

  if (!anthropicRes.ok) return Response.json({ error: 'Processing failed' }, { status: 500 })

  const anthropicData = await anthropicRes.json()
  const rawText: string = anthropicData.content?.[0]?.text ?? ''
  const parsed = parseBlessThis(rawText)

  const catResult = await db.execute({
    sql: 'SELECT id, name FROM categories WHERE type = ?',
    args: ['expense'],
  })
  let categoryId: string | null = null
  if (parsed.category) {
    const match = catResult.rows.find(
      (c) => (c.name as string).toLowerCase() === parsed.category!.toLowerCase()
    )
    if (match) categoryId = match.id as string
  }

  const tagIds = parsed.tags ? await resolveTagIds(parsed.tags) : []

  let datetime = new Date().toISOString()
  if (parsed.date) {
    const timePart = parsed.time ?? '00:00'
    datetime = `${parsed.date}T${timePart}:00+08:00`
  }

  const draft = await insertDraftTransaction({
    accountId: resolvedAccountId,
    categoryId,
    payee: parsed.payee ?? null,
    note: parsed.notes ?? null,
    paymentMethod: parsed.payment_method ?? null,
    amount: parsed.amount ?? 0,
    currency: parsed.currency ?? 'SGD',
    datetime,
    tagIds,
  })

  return Response.json({ draft }, { status: 201 })
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/api/receipts-voice.test.ts
```

Expected: all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/api/receipts/voice/route.ts tests/api/receipts-voice.test.ts
git commit -m "feat: add voice transcript processing API — Claude text-mode → draft transaction"
```

---

## Task 6: ReceiptDropzone component

**Files:**
- Create: `app/(protected)/components/receipt-dropzone.tsx`

No dedicated unit tests for this component (behavior is covered by API tests; Web Speech API is not available in jsdom). Manual testing during Task 8.

- [ ] **Step 1: Create `app/(protected)/components/receipt-dropzone.tsx`**

```typescript
'use client'

import { useState, useRef, useCallback } from 'react'
import type { TransactionRow } from '@/lib/types'
import { useToast } from './toast'

type FileStatus = 'waiting' | 'uploading' | 'done' | 'error'
type VoiceStatus = 'idle' | 'recording' | 'processing' | 'done' | 'error'

interface FileItem {
  id: string
  file: File
  status: FileStatus
  previewUrl: string
  error?: string
}

function getStoredAccountId(): string {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem('wmm_last_account') ?? ''
}

export function ReceiptDropzone() {
  const { showToast } = useToast()
  const [files, setFiles] = useState<FileItem[]>([])
  const [merchantLookup, setMerchantLookup] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>('idle')
  const [voiceTranscript, setVoiceTranscript] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)

  function addFiles(newFiles: File[]) {
    const imageFiles = newFiles.filter((f) => f.type.startsWith('image/'))
    const remaining = 10 - files.filter((f) => f.status !== 'error').length
    const toAdd = imageFiles.slice(0, remaining)
    const items: FileItem[] = toAdd.map((f) => ({
      id: crypto.randomUUID(),
      file: f,
      status: 'waiting',
      previewUrl: URL.createObjectURL(f),
    }))
    setFiles((prev) => [...prev, ...items])
  }

  function removeFile(id: string) {
    setFiles((prev) => {
      const item = prev.find((f) => f.id === id)
      if (item) URL.revokeObjectURL(item.previewUrl)
      return prev.filter((f) => f.id !== id)
    })
  }

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve((reader.result as string).split(',')[1])
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  async function processFiles() {
    const pending = files.filter((f) => f.status === 'waiting')
    if (pending.length === 0) return
    setUploading(true)
    const accountId = getStoredAccountId()
    for (const item of pending) {
      setFiles((prev) => prev.map((f) => (f.id === item.id ? { ...f, status: 'uploading' } : f)))
      try {
        const imageBase64 = await fileToBase64(item.file)
        const res = await fetch('/api/receipts/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64, mediaType: item.file.type, merchantLookup, accountId }),
        })
        const data = await res.json()
        if (res.ok && data.draft) {
          setFiles((prev) => prev.map((f) => (f.id === item.id ? { ...f, status: 'done' } : f)))
          window.dispatchEvent(new CustomEvent('drafts-updated'))
        } else {
          setFiles((prev) =>
            prev.map((f) =>
              f.id === item.id ? { ...f, status: 'error', error: data.error ?? 'Processing failed' } : f
            )
          )
        }
      } catch {
        setFiles((prev) =>
          prev.map((f) => (f.id === item.id ? { ...f, status: 'error', error: 'Network error' } : f))
        )
      }
    }
    setUploading(false)
  }

  const processVoice = useCallback(
    async (text: string) => {
      setVoiceStatus('processing')
      const accountId = getStoredAccountId()
      try {
        const res = await fetch('/api/receipts/voice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, accountId }),
        })
        const data = await res.json()
        if (res.ok && data.draft) {
          setVoiceStatus('done')
          window.dispatchEvent(new CustomEvent('drafts-updated'))
          showToast('Voice entry captured as draft', 'success')
          setTimeout(() => {
            setVoiceStatus('idle')
            setVoiceTranscript('')
          }, 2000)
        } else {
          setVoiceStatus('error')
          showToast(data.error ?? 'Processing failed', 'error')
          setTimeout(() => setVoiceStatus('idle'), 2000)
        }
      } catch {
        setVoiceStatus('error')
        showToast('Network error', 'error')
        setTimeout(() => setVoiceStatus('idle'), 2000)
      }
    },
    [showToast]
  )

  function startRecording() {
    const SR =
      window.SpeechRecognition ??
      (window as Window & { webkitSpeechRecognition?: typeof SpeechRecognition }).webkitSpeechRecognition
    if (!SR) {
      showToast('Voice input not supported in this browser', 'error')
      return
    }
    const recognition = new SR()
    recognition.lang = 'en-SG'
    recognition.interimResults = false
    recognition.maxAlternatives = 1
    let finalTranscript = ''

    recognition.onstart = () => setVoiceStatus('recording')
    recognition.onresult = (e: SpeechRecognitionEvent) => {
      finalTranscript = e.results[0][0].transcript
      setVoiceTranscript(finalTranscript)
    }
    recognition.onend = () => {
      if (finalTranscript) {
        processVoice(finalTranscript)
      } else {
        setVoiceStatus('idle')
      }
    }
    recognition.onerror = () => {
      setVoiceStatus('error')
      setTimeout(() => setVoiceStatus('idle'), 2000)
    }
    recognitionRef.current = recognition
    recognition.start()
  }

  function stopRecording() {
    recognitionRef.current?.stop()
  }

  const hasPending = files.some((f) => f.status === 'waiting')
  const allDone = files.length > 0 && files.every((f) => f.status === 'done')
  const pendingCount = files.filter((f) => f.status === 'waiting').length

  const voiceBorderColor =
    voiceStatus === 'recording' ? '#f85149' : voiceStatus === 'done' ? '#3fb884' : '#30363d'
  const voiceBg =
    voiceStatus === 'recording' ? 'rgba(248,81,73,0.15)' : 'transparent'
  const voiceColor =
    voiceStatus === 'recording' ? '#f85149' : voiceStatus === 'done' ? '#3fb884' : '#8b949e'

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
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '1rem',
            flexWrap: 'wrap',
            gap: '8px',
          }}
        >
          <h2 style={{ color: '#e6edf3', fontSize: '15px', fontWeight: 600, margin: 0 }}>
            Upload Receipts
          </h2>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            <input
              type="checkbox"
              checked={merchantLookup}
              onChange={(e) => setMerchantLookup(e.target.checked)}
              style={{ accentColor: '#f0b429', width: '14px', height: '14px' }}
            />
            <span style={{ color: '#8b949e', fontSize: '12px' }}>
              Merchant lookup
              {merchantLookup && <span style={{ color: '#f0b429' }}> (adds ~5s)</span>}
            </span>
          </label>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(Array.from(e.dataTransfer.files)) }}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter') fileInputRef.current?.click() }}
          style={{
            border: `2px dashed ${dragOver ? '#f0b429' : '#30363d'}`,
            borderRadius: '10px',
            padding: '2rem 1rem',
            textAlign: 'center',
            cursor: 'pointer',
            background: dragOver ? 'rgba(240,180,41,0.05)' : 'transparent',
            transition: 'all 0.15s',
            minHeight: '120px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            marginBottom: files.length > 0 ? '1rem' : '1rem',
          }}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke={dragOver ? '#f0b429' : '#8b949e'}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <span style={{ color: '#8b949e', fontSize: '13px' }}>
            {files.length === 0
              ? 'Drop receipt photos here or tap to browse'
              : `${files.length}/10 receipts added`}
          </span>
          <span style={{ color: '#484f58', fontSize: '11px' }}>
            JPEG · PNG · HEIC · Max 5 MB each
          </span>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => {
              if (e.target.files) addFiles(Array.from(e.target.files))
              e.target.value = ''
            }}
            style={{ display: 'none' }}
          />
        </div>

        {/* File list */}
        {files.length > 0 && (
          <div
            style={{ marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '6px' }}
          >
            {files.map((item) => (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  background: '#0d1117',
                  borderRadius: '8px',
                  padding: '8px 12px',
                  border: '1px solid #21262d',
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.previewUrl}
                  alt=""
                  style={{
                    width: '36px',
                    height: '36px',
                    objectFit: 'cover',
                    borderRadius: '4px',
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    flex: 1,
                    color: '#e6edf3',
                    fontSize: '12px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {item.file.name}
                </span>
                {item.status === 'waiting' && (
                  <span style={{ color: '#484f58', fontSize: '11px', flexShrink: 0 }}>Waiting</span>
                )}
                {item.status === 'uploading' && (
                  <svg
                    style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }}
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle cx="12" cy="12" r="10" stroke="#f0b429" strokeWidth="3" opacity="0.25" />
                    <path
                      d="M12 2a10 10 0 0110 10"
                      stroke="#f0b429"
                      strokeWidth="3"
                      strokeLinecap="round"
                    />
                  </svg>
                )}
                {item.status === 'done' && (
                  <span style={{ color: '#3fb884', fontSize: '11px', flexShrink: 0 }}>
                    ✓ Draft created
                  </span>
                )}
                {item.status === 'error' && (
                  <span style={{ color: '#f85149', fontSize: '11px', flexShrink: 0 }}>
                    {item.error ?? 'Failed'}
                  </span>
                )}
                {(item.status === 'waiting' || item.status === 'error') && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); removeFile(item.id) }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#484f58',
                      cursor: 'pointer',
                      padding: '2px 4px',
                      flexShrink: 0,
                      fontSize: '16px',
                      lineHeight: 1,
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Bottom action bar */}
        <div
          style={{
            display: 'flex',
            gap: '8px',
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          {/* Voice mic button — always visible */}
          <button
            type="button"
            onClick={voiceStatus === 'recording' ? stopRecording : startRecording}
            disabled={voiceStatus === 'processing' || uploading}
            title={
              voiceStatus === 'recording'
                ? 'Tap to stop recording'
                : 'Tap to log an expense by voice'
            }
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              border: `2px solid ${voiceBorderColor}`,
              background: voiceBg,
              color: voiceColor,
              cursor: voiceStatus === 'processing' || uploading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              transition: 'all 0.15s',
            }}
          >
            {voiceStatus === 'processing' ? (
              <svg
                style={{ animation: 'spin 1s linear infinite' }}
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
                <path
                  d="M12 2a10 10 0 0110 10"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              </svg>
            ) : (
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            )}
          </button>

          {/* Upload button — only when files added */}
          {files.length > 0 ? (
            <button
              type="button"
              onClick={processFiles}
              disabled={!hasPending || uploading}
              style={{
                flex: 1,
                padding: '13px',
                borderRadius: '8px',
                border: 'none',
                fontSize: '14px',
                fontWeight: 600,
                cursor: hasPending && !uploading ? 'pointer' : 'not-allowed',
                background: hasPending && !uploading ? '#f0b429' : '#21262d',
                color: hasPending && !uploading ? '#0d1117' : '#484f58',
                transition: 'all 0.15s',
                minHeight: '48px',
              }}
            >
              {uploading
                ? 'Processing...'
                : allDone
                ? 'All processed ✓'
                : `Process ${pendingCount} receipt${pendingCount !== 1 ? 's' : ''}`}
            </button>
          ) : (
            <span style={{ color: '#484f58', fontSize: '12px', flex: 1 }}>
              {voiceStatus === 'recording'
                ? '● Recording... tap mic to stop'
                : voiceStatus === 'processing'
                ? 'Processing voice input...'
                : 'Tap mic to log an expense by voice'}
            </span>
          )}
        </div>

        {/* Voice transcript preview */}
        {voiceTranscript && voiceStatus !== 'idle' && (
          <div
            style={{
              marginTop: '8px',
              padding: '8px 12px',
              background: '#0d1117',
              borderRadius: '6px',
              border: '1px solid #30363d',
            }}
          >
            <span style={{ color: '#8b949e', fontSize: '12px', fontStyle: 'italic' }}>
              &ldquo;{voiceTranscript}&rdquo;
            </span>
          </div>
        )}
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </section>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add "app/(protected)/components/receipt-dropzone.tsx"
git commit -m "feat: add ReceiptDropzone component with drag-drop and voice input"
```

---

## Task 7: DraftsCard component

**Files:**
- Create: `app/(protected)/components/drafts-card.tsx`

- [ ] **Step 1: Create `app/(protected)/components/drafts-card.tsx`**

```typescript
'use client'

import { useState, useEffect, useCallback } from 'react'
import type { TransactionRow, Account, Category, Tag, TxType } from '@/lib/types'
import { useToast } from './toast'

interface EditForm {
  type: TxType
  amount: string
  currency: string
  account_id: string
  category_id: string
  payee: string
  note: string
  payment_method: string
  datetime: string
  tag_ids: string[]
}

const CURRENCIES = ['SGD', 'USD', 'EUR', 'GBP', 'JPY', 'MYR', 'IDR', 'THB', 'AUD', 'HKD']

const BTN: React.CSSProperties = {
  border: 'none', borderRadius: '6px', cursor: 'pointer',
  fontSize: '12px', fontWeight: 500, padding: '6px 12px',
}
const BTN_PRI: React.CSSProperties = { ...BTN, background: '#f0b429', color: '#0d1117' }
const BTN_SEC: React.CSSProperties = { ...BTN, background: '#21262d', color: '#e6edf3', border: '1px solid #30363d' }
const BTN_DNG: React.CSSProperties = { ...BTN, background: 'transparent', color: '#f85149', border: '1px solid #f8514940' }
const BTN_GRN: React.CSSProperties = { ...BTN, background: '#3fb88420', color: '#3fb884', border: '1px solid #3fb88440' }

const INPUT: React.CSSProperties = {
  background: '#0d1117', border: '1px solid #30363d', borderRadius: '6px',
  color: '#e6edf3', fontSize: '13px', padding: '6px 10px', outline: 'none', width: '100%',
}
const SELECT: React.CSSProperties = { ...INPUT, cursor: 'pointer' }

function toInputDt(iso: string) {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

function fromInputDt(val: string) {
  return `${val}:00.000+08:00`
}

function txToForm(tx: TransactionRow): EditForm {
  return {
    type: tx.type,
    amount: String(tx.amount),
    currency: tx.currency,
    account_id: tx.account_id,
    category_id: tx.category_id ?? '',
    payee: tx.payee ?? '',
    note: tx.note ?? '',
    payment_method: tx.payment_method ?? '',
    datetime: toInputDt(tx.datetime),
    tag_ids: tx.tags.map((t) => t.id),
  }
}

export function DraftsCard() {
  const { showToast } = useToast()
  const [open, setOpen] = useState(false)
  const [drafts, setDrafts] = useState<TransactionRow[]>([])
  const [loading, setLoading] = useState(false)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [tags, setTags] = useState<Tag[]>([])

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<EditForm | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const [approvingAll, setApprovingAll] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const loadDrafts = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/transactions?status=draft&limit=100')
      const data = await res.json()
      setDrafts(data.data ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    Promise.all([
      fetch('/api/accounts').then((r) => r.json()),
      fetch('/api/categories').then((r) => r.json()),
      fetch('/api/tags').then((r) => r.json()),
    ]).then(([accts, cats, tgs]) => {
      setAccounts(accts)
      setCategories(cats)
      setTags(tgs)
    })
    loadDrafts()
  }, [loadDrafts])

  useEffect(() => {
    const handler = () => loadDrafts()
    window.addEventListener('drafts-updated', handler)
    return () => window.removeEventListener('drafts-updated', handler)
  }, [loadDrafts])

  function ef(key: keyof EditForm, value: string | string[]) {
    setEditForm((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  async function saveEdit(id: string) {
    if (!editForm) return
    setSavingId(id)
    try {
      const amt = parseFloat(editForm.amount)
      const body = {
        type: editForm.type,
        amount: amt,
        currency: editForm.currency,
        account_id: editForm.account_id,
        category_id: editForm.category_id || null,
        payee: editForm.payee || null,
        note: editForm.note || null,
        payment_method: editForm.payment_method || null,
        datetime: fromInputDt(editForm.datetime),
        tag_ids: editForm.tag_ids,
      }
      const res = await fetch(`/api/transactions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        showToast('Draft updated', 'success')
        setEditingId(null)
        setEditForm(null)
        loadDrafts()
      } else {
        showToast('Failed to save', 'error')
      }
    } finally {
      setSavingId(null)
    }
  }

  async function approveDraft(id: string) {
    setApprovingId(id)
    try {
      const res = await fetch(`/api/transactions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved' }),
      })
      if (res.ok) {
        showToast('Transaction approved', 'success')
        setDrafts((prev) => prev.filter((d) => d.id !== id))
        if (editingId === id) { setEditingId(null); setEditForm(null) }
      } else {
        showToast('Failed to approve', 'error')
      }
    } finally {
      setApprovingId(null)
    }
  }

  async function approveAll() {
    if (drafts.length === 0) return
    setApprovingAll(true)
    try {
      const results = await Promise.all(
        drafts.map((d) =>
          fetch(`/api/transactions/${d.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'approved' }),
          })
        )
      )
      const allOk = results.every((r) => r.ok)
      if (allOk) {
        showToast(`${drafts.length} transactions approved`, 'success')
        setDrafts([])
        setEditingId(null)
        setEditForm(null)
      } else {
        showToast('Some approvals failed — refresh to check', 'error')
        loadDrafts()
      }
    } finally {
      setApprovingAll(false)
    }
  }

  async function deleteDraft(id: string) {
    if (!confirm('Delete this draft?')) return
    setDeletingId(id)
    try {
      const res = await fetch(`/api/transactions/${id}`, { method: 'DELETE' })
      if (res.ok) {
        showToast('Draft deleted', 'success')
        setDrafts((prev) => prev.filter((d) => d.id !== id))
        if (editingId === id) { setEditingId(null); setEditForm(null) }
      } else {
        showToast('Failed to delete', 'error')
      }
    } finally {
      setDeletingId(null)
    }
  }

  const activeAccounts = accounts.filter((a) => a.is_active)
  const expenseCategories = categories.filter((c) => c.type === 'expense')

  return (
    <section style={{ marginBottom: '2rem' }}>
      <div
        style={{
          background: '#161b22',
          border: '1px solid #30363d',
          borderRadius: '12px',
          overflow: 'hidden',
        }}
      >
        {/* Collapsible header */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '1rem 1.5rem',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h2 style={{ color: '#e6edf3', fontSize: '15px', fontWeight: 600, margin: 0 }}>
              Drafts
            </h2>
            {drafts.length > 0 && (
              <span
                style={{
                  background: '#f0b42920',
                  border: '1px solid #f0b42960',
                  borderRadius: '12px',
                  padding: '1px 8px',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#f0b429',
                }}
              >
                {loading ? '…' : drafts.length}
              </span>
            )}
            {!open && drafts.length === 0 && !loading && (
              <span style={{ color: '#484f58', fontSize: '12px' }}>No pending drafts</span>
            )}
          </div>
          <span style={{ color: '#8b949e', fontSize: '12px' }}>{open ? '▲' : '▼'}</span>
        </button>

        {/* Expanded body */}
        {open && (
          <div style={{ borderTop: '1px solid #30363d' }}>
            {/* Bulk approve bar */}
            {drafts.length > 1 && (
              <div
                style={{
                  padding: '10px 1.5rem',
                  borderBottom: '1px solid #21262d',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '8px',
                }}
              >
                <span style={{ color: '#8b949e', fontSize: '12px' }}>
                  {drafts.length} drafts pending review
                </span>
                <button
                  type="button"
                  onClick={approveAll}
                  disabled={approvingAll}
                  style={{ ...BTN_GRN, opacity: approvingAll ? 0.6 : 1 }}
                >
                  {approvingAll ? 'Approving...' : `Approve all ${drafts.length}`}
                </button>
              </div>
            )}

            {/* Empty state */}
            {!loading && drafts.length === 0 && (
              <div
                style={{
                  padding: '3rem',
                  textAlign: 'center',
                  color: '#8b949e',
                  fontSize: '14px',
                }}
              >
                No drafts. Upload receipts above to get started.
              </div>
            )}

            {/* Draft list */}
            {drafts.map((tx, i) => (
              <div key={tx.id}>
                {/* Row */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '10px 1.5rem',
                    borderBottom:
                      i < drafts.length - 1 || editingId === tx.id ? '1px solid #21262d' : 'none',
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: '#e6edf3', fontSize: '13px', fontWeight: 500 }}>
                      {tx.payee ?? tx.category_name ?? '(unnamed)'}
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        gap: '8px',
                        marginTop: '2px',
                        flexWrap: 'wrap',
                      }}
                    >
                      <span style={{ color: '#484f58', fontSize: '12px' }}>
                        {new Date(tx.datetime).toLocaleDateString('en-SG', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                      {tx.category_name && (
                        <span style={{ color: '#484f58', fontSize: '12px' }}>
                          {tx.category_name}
                        </span>
                      )}
                      {tx.tags.length > 0 && (
                        <span style={{ color: '#484f58', fontSize: '11px' }}>
                          {tx.tags.map((t) => `#${t.name}`).join(' ')}
                        </span>
                      )}
                    </div>
                  </div>
                  <span style={{ color: '#f85149', fontSize: '13px', fontWeight: 600, flexShrink: 0 }}>
                    -{tx.currency} {(tx.amount as number).toFixed(2)}
                  </span>
                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '4px', flexShrink: 0, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => {
                        if (editingId === tx.id) { setEditingId(null); setEditForm(null) }
                        else { setEditingId(tx.id); setEditForm(txToForm(tx)) }
                      }}
                      style={BTN_SEC}
                    >
                      {editingId === tx.id ? 'Cancel' : 'Edit'}
                    </button>
                    <button
                      type="button"
                      onClick={() => approveDraft(tx.id)}
                      disabled={approvingId === tx.id}
                      style={{ ...BTN_GRN, opacity: approvingId === tx.id ? 0.6 : 1 }}
                    >
                      {approvingId === tx.id ? '...' : 'Approve'}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteDraft(tx.id)}
                      disabled={deletingId === tx.id}
                      style={BTN_DNG}
                    >
                      {deletingId === tx.id ? '...' : '×'}
                    </button>
                  </div>
                </div>

                {/* Inline edit form */}
                {editingId === tx.id && editForm && (
                  <div
                    style={{
                      padding: '1rem 1.5rem',
                      background: '#0d1117',
                      borderBottom: i < drafts.length - 1 ? '1px solid #21262d' : 'none',
                    }}
                  >
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                        gap: '8px',
                        marginBottom: '8px',
                      }}
                    >
                      <div>
                        <label style={{ color: '#8b949e', fontSize: '11px', display: 'block', marginBottom: '3px' }}>Amount</label>
                        <input type="number" step="0.01" style={INPUT} value={editForm.amount} onChange={(e) => ef('amount', e.target.value)} />
                      </div>
                      <div>
                        <label style={{ color: '#8b949e', fontSize: '11px', display: 'block', marginBottom: '3px' }}>Currency</label>
                        <select style={SELECT} value={editForm.currency} onChange={(e) => ef('currency', e.target.value)}>
                          {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={{ color: '#8b949e', fontSize: '11px', display: 'block', marginBottom: '3px' }}>Account</label>
                        <select style={SELECT} value={editForm.account_id} onChange={(e) => ef('account_id', e.target.value)}>
                          {activeAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={{ color: '#8b949e', fontSize: '11px', display: 'block', marginBottom: '3px' }}>Category</label>
                        <select style={SELECT} value={editForm.category_id} onChange={(e) => ef('category_id', e.target.value)}>
                          <option value="">None</option>
                          {expenseCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={{ color: '#8b949e', fontSize: '11px', display: 'block', marginBottom: '3px' }}>Payee</label>
                        <input style={INPUT} value={editForm.payee} onChange={(e) => ef('payee', e.target.value)} placeholder="Payee" />
                      </div>
                      <div>
                        <label style={{ color: '#8b949e', fontSize: '11px', display: 'block', marginBottom: '3px' }}>Payment Method</label>
                        <select style={SELECT} value={editForm.payment_method} onChange={(e) => ef('payment_method', e.target.value)}>
                          <option value="">None</option>
                          <option value="cash">Cash</option>
                          <option value="credit card">Credit card</option>
                          <option value="debit card">Debit card</option>
                          <option value="e-wallet">E-wallet</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ color: '#8b949e', fontSize: '11px', display: 'block', marginBottom: '3px' }}>Date / Time</label>
                        <input type="datetime-local" style={INPUT} value={editForm.datetime} onChange={(e) => ef('datetime', e.target.value)} />
                      </div>
                    </div>

                    <div style={{ marginBottom: '8px' }}>
                      <label style={{ color: '#8b949e', fontSize: '11px', display: 'block', marginBottom: '3px' }}>Note</label>
                      <textarea
                        style={{ ...INPUT, resize: 'vertical', minHeight: '52px', fontFamily: 'inherit' }}
                        value={editForm.note}
                        onChange={(e) => ef('note', e.target.value)}
                        placeholder="Note"
                      />
                    </div>

                    {tags.length > 0 && (
                      <div style={{ marginBottom: '10px' }}>
                        <label style={{ color: '#8b949e', fontSize: '11px', display: 'block', marginBottom: '6px' }}>Tags</label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {tags.map((tag) => {
                            const selected = editForm.tag_ids.includes(tag.id)
                            return (
                              <button
                                key={tag.id}
                                type="button"
                                onClick={() =>
                                  ef(
                                    'tag_ids',
                                    selected
                                      ? editForm.tag_ids.filter((id) => id !== tag.id)
                                      : [...editForm.tag_ids, tag.id]
                                  )
                                }
                                style={{
                                  ...BTN,
                                  padding: '3px 10px',
                                  fontSize: '12px',
                                  background: selected ? '#f0b42920' : '#21262d',
                                  color: selected ? '#f0b429' : '#8b949e',
                                  border: `1px solid ${selected ? '#f0b42960' : '#30363d'}`,
                                }}
                              >
                                {tag.name}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* Form action buttons — full width on mobile */}
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => saveEdit(tx.id)}
                        disabled={savingId === tx.id}
                        style={{
                          ...BTN_PRI,
                          flex: 1,
                          minWidth: '100px',
                          padding: '10px',
                          opacity: savingId === tx.id ? 0.6 : 1,
                        }}
                      >
                        {savingId === tx.id ? 'Saving...' : 'Save changes'}
                      </button>
                      <button
                        type="button"
                        onClick={() => approveDraft(tx.id)}
                        disabled={approvingId === tx.id}
                        style={{
                          ...BTN_GRN,
                          flex: 1,
                          minWidth: '100px',
                          padding: '10px',
                          opacity: approvingId === tx.id ? 0.6 : 1,
                        }}
                      >
                        {approvingId === tx.id ? 'Approving...' : 'Approve'}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setEditingId(null); setEditForm(null) }}
                        style={{ ...BTN_SEC, padding: '10px' }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add "app/(protected)/components/drafts-card.tsx"
git commit -m "feat: add DraftsCard component — collapsible draft review, edit, approve"
```

---

## Task 8: Wire dashboard page + full test run

**Files:**
- Modify: `app/(protected)/page.tsx`

- [ ] **Step 1: Update `app/(protected)/page.tsx`**

Replace the full file contents:

```typescript
import { WheresMyMoney } from './components/wheres-my-money'
import { ReceiptDropzone } from './components/receipt-dropzone'
import { ExpenseDashboard } from './components/expense-dashboard'
import { RecentTransactions } from './components/recent-transactions'
import { DraftsCard } from './components/drafts-card'

export const metadata = {
  title: "Where's My Money - Root OS",
}

export default function DashboardPage() {
  return (
    <main style={{ padding: '1.5rem', maxWidth: '800px', margin: '0 auto' }}>
      <WheresMyMoney />
      <ReceiptDropzone />
      <ExpenseDashboard />
      <RecentTransactions />
      <DraftsCard />
    </main>
  )
}
```

- [ ] **Step 2: Run the full test suite**

```bash
npx vitest run
```

Expected: all tests pass (0 failures). The count should be higher than before this feature was built.

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "app/(protected)/page.tsx"
git commit -m "feat: wire ReceiptDropzone and DraftsCard into dashboard page"
```

---

## Self-Review Checklist

- [x] **DB migration** — `transactions.status` added to `scripts/migrate.ts` and `/api/migrate` (Task 1)
- [x] **Transaction GET filtering** — drafts excluded by default, `?status=draft` supported (Task 2)
- [x] **Transaction PATCH status** — `'status'` added to UPDATABLE (Task 3)
- [x] **Receipt image API** — auth, validation, Claude vision, tag creation, category matching, draft insert (Task 4)
- [x] **Receipt voice API** — auth, validation, Claude text-mode, draft insert (Task 5)
- [x] **ReceiptDropzone** — drop zone, file picker, per-file progress, serial upload, merchant lookup checkbox, voice mic, Web Speech API, `drafts-updated` event (Task 6)
- [x] **DraftsCard** — collapsible, count badge, inline edit, save with loading state, individual approve, bulk approve, delete, empty state, `drafts-updated` listener (Task 7)
- [x] **Page wired** — `ReceiptDropzone` between WMM and ExpenseDashboard; `DraftsCard` last (Task 8)
- [x] **Mobile-first** — all components use flex/wrap layouts, 48px touch targets for mic/upload buttons, full-width action buttons in edit forms
- [x] **Account resolution** — client reads `localStorage.getItem('wmm_last_account')`, sends as `accountId`; server falls back to first active account if missing
- [x] **No account picker UI** — nowhere in the UI
- [x] **Tests before implementation** — TDD order maintained for Tasks 2–5
