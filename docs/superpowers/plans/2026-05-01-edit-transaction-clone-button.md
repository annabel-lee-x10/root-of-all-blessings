# Edit Transaction Clone Button — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Clone button to the inline Edit Transaction form on the Transactions page that copies current form-field values into a brand-new draft transaction (status='draft') without modifying the original row.

**Architecture:** Two surface changes:
1. New API endpoint `POST /api/transactions/clone` — accepts the same body shape as the `PATCH /api/transactions/[id]` UPDATABLE list, plus `tag_ids`. It validates `account_id`, inserts a new transaction with `status='draft'`, copies tag links, returns the hydrated row. It does **not** touch the OCR receipts pipeline (`app/api/receipts/process` and `app/api/receipts/_lib.ts` stay untouched). Reuses the same `transactions` table the OCR drafts pipeline writes to, so cloned drafts naturally appear in the same drafts list.
2. UI changes in `app/(protected)/transactions/page.tsx` — button row reordered to `[Cancel] [Clone] [Save changes]` (left→right) and a `cloneTransaction(id)` handler that POSTs current `editForm` state to the new endpoint, shows a toast with a "View drafts" action that links to `/dashboard`, and leaves the edit form open.

**Tech Stack:** Next.js 16 App Router, React 19, Vitest (node + jsdom), better-sqlite3 in-memory test DB, Turso/libSQL in prod.

---

## File Structure

**Create:**
- `app/api/transactions/clone/route.ts` — new API route, ~60 lines.
- `tests/api/transactions-clone.test.ts` — endpoint tests, node env.
- `tests/components/transactions-page-clone.test.tsx` — UI tests, jsdom env.

**Modify:**
- `app/(protected)/transactions/page.tsx` — add `cloningId` state, `cloneTransaction()` handler, reorder + add buttons in JSX (around lines 794–803).

**Untouched (per scope):**
- `app/api/receipts/process/route.ts`
- `app/api/receipts/_lib.ts`
- `app/(protected)/components/drafts-card.tsx` — its drafts already auto-include any cloned rows because it filters by `status='draft'`.
- `app/(protected)/components/recent-transactions.tsx` — out of scope (limited edit UI without all fields).

---

## Task 1: New `POST /api/transactions/clone` Endpoint (API + tests)

**Files:**
- Create: `app/api/transactions/clone/route.ts`
- Create: `tests/api/transactions-clone.test.ts`

**Endpoint contract:**

Request body (same field names as the PATCH UPDATABLE list, plus `tag_ids`):
```ts
{
  type: 'expense' | 'income' | 'transfer'
  amount: number
  currency: string
  fx_rate: number | null
  fx_date: string | null
  sgd_equivalent: number | null
  account_id: string                  // required
  to_account_id: string | null
  category_id: string | null
  payee: string | null
  note: string | null
  payment_method: string | null
  datetime: string                    // ISO 8601
  tag_ids: string[]
}
```

Response 201:
```ts
{ ...TransactionRow, status: 'draft', tags: [{id, name}] }
```

Response 400 on missing required fields (`account_id`, `amount`, `datetime`, `type`).

- [ ] **Step 1.1: Write the failing API tests**

Create `tests/api/transactions-clone.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import {
  initTestDb, clearTestDb, resetTestDb, req,
  seedAccount, seedCategory, seedTag, seedTransaction, seedTransactionTag,
} from '../helpers'
import { db } from '@/lib/db'

beforeAll(() => initTestDb())
afterAll(() => clearTestDb())
beforeEach(() => {
  resetTestDb()
  seedAccount('acc1', 'DBS', 'bank')
  seedAccount('acc2', 'Cash', 'cash')
  seedCategory('cat1', 'Food', 'expense')
  seedTag('tag1', 'lunch')
})

describe('POST /api/transactions/clone', () => {
  it('creates a new draft from supplied form fields', async () => {
    const { POST } = await import('@/app/api/transactions/clone/route')
    const body = {
      type: 'expense',
      amount: 12.5,
      currency: 'SGD',
      fx_rate: null,
      fx_date: null,
      sgd_equivalent: null,
      account_id: 'acc1',
      to_account_id: null,
      category_id: 'cat1',
      payee: 'Hawker',
      note: 'lunch',
      payment_method: 'bank',
      datetime: '2026-04-01T10:00:00.000+08:00',
      tag_ids: ['tag1'],
    }
    const res = await POST(req('/api/transactions/clone', 'POST', body))
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.id).toBeTruthy()
    expect(data.status).toBe('draft')
    expect(data.amount).toBe(12.5)
    expect(data.payee).toBe('Hawker')
    expect(data.account_name).toBe('DBS')
    expect(data.category_name).toBe('Food')
    expect(data.tags).toEqual([{ id: 'tag1', name: 'lunch', created_at: '' }])
  })

  it('preserves the original row unchanged when cloned', async () => {
    seedTransaction('orig1', 'acc1', {
      type: 'expense', amount: 99, payee: 'Original',
      categoryId: 'cat1', status: 'approved',
      datetime: '2026-04-01T10:00:00.000+08:00',
    })
    seedTransactionTag('orig1', 'tag1')
    const before = await db.execute({ sql: 'SELECT * FROM transactions WHERE id = ?', args: ['orig1'] })
    const beforeTags = await db.execute({
      sql: 'SELECT tag_id FROM transaction_tags WHERE transaction_id = ?', args: ['orig1'],
    })

    const { POST } = await import('@/app/api/transactions/clone/route')
    await POST(req('/api/transactions/clone', 'POST', {
      type: 'expense', amount: 99, currency: 'SGD',
      fx_rate: null, fx_date: null, sgd_equivalent: null,
      account_id: 'acc1', to_account_id: null, category_id: 'cat1',
      payee: 'Original', note: null, payment_method: 'bank',
      datetime: '2026-04-01T10:00:00.000+08:00', tag_ids: ['tag1'],
    }))

    const after = await db.execute({ sql: 'SELECT * FROM transactions WHERE id = ?', args: ['orig1'] })
    const afterTags = await db.execute({
      sql: 'SELECT tag_id FROM transaction_tags WHERE transaction_id = ?', args: ['orig1'],
    })
    expect(after.rows[0]).toEqual(before.rows[0])
    expect(afterTags.rows).toEqual(beforeTags.rows)
  })

  it('produces a row that appears in /api/transactions?status=draft', async () => {
    const { POST: cloneP } = await import('@/app/api/transactions/clone/route')
    await cloneP(req('/api/transactions/clone', 'POST', {
      type: 'expense', amount: 5, currency: 'SGD',
      fx_rate: null, fx_date: null, sgd_equivalent: null,
      account_id: 'acc1', to_account_id: null, category_id: null,
      payee: 'X', note: null, payment_method: null,
      datetime: '2026-04-01T10:00:00.000+08:00', tag_ids: [],
    }))
    const { GET } = await import('@/app/api/transactions/route')
    const res = await GET(req('/api/transactions?status=draft'))
    const data = await res.json()
    expect(data.data).toHaveLength(1)
    expect(data.data[0].status).toBe('draft')
    expect(data.data[0].payee).toBe('X')
  })

  it('returns 400 when required fields are missing', async () => {
    const { POST } = await import('@/app/api/transactions/clone/route')
    const res = await POST(req('/api/transactions/clone', 'POST', {
      currency: 'SGD',
    }))
    expect(res.status).toBe(400)
  })

  it('preserves transfer type and to_account_id', async () => {
    const { POST } = await import('@/app/api/transactions/clone/route')
    const res = await POST(req('/api/transactions/clone', 'POST', {
      type: 'transfer', amount: 50, currency: 'SGD',
      fx_rate: null, fx_date: null, sgd_equivalent: null,
      account_id: 'acc1', to_account_id: 'acc2', category_id: null,
      payee: null, note: null, payment_method: 'bank',
      datetime: '2026-04-01T10:00:00.000+08:00', tag_ids: [],
    }))
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.type).toBe('transfer')
    expect(data.to_account_id).toBe('acc2')
    expect(data.to_account_name).toBe('Cash')
    expect(data.status).toBe('draft')
  })

  it('preserves fx fields for non-SGD currencies', async () => {
    const { POST } = await import('@/app/api/transactions/clone/route')
    const res = await POST(req('/api/transactions/clone', 'POST', {
      type: 'expense', amount: 10, currency: 'USD',
      fx_rate: 1.35, fx_date: '2026-04-01', sgd_equivalent: 13.5,
      account_id: 'acc1', to_account_id: null, category_id: null,
      payee: null, note: null, payment_method: 'bank',
      datetime: '2026-04-01T10:00:00.000+08:00', tag_ids: [],
    }))
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.currency).toBe('USD')
    expect(data.fx_rate).toBe(1.35)
    expect(data.fx_date).toBe('2026-04-01')
    expect(data.sgd_equivalent).toBe(13.5)
  })
})
```

- [ ] **Step 1.2: Run the tests to verify they fail**

Run: `npx vitest run tests/api/transactions-clone.test.ts`
Expected: FAIL — "Cannot find module '@/app/api/transactions/clone/route'"

- [ ] **Step 1.3: Implement the clone endpoint**

Create `app/api/transactions/clone/route.ts`:

```ts
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import type { TransactionRow } from '@/lib/types'

interface CloneBody {
  type?: 'expense' | 'income' | 'transfer'
  amount?: number
  currency?: string
  fx_rate?: number | null
  fx_date?: string | null
  sgd_equivalent?: number | null
  account_id?: string
  to_account_id?: string | null
  category_id?: string | null
  payee?: string | null
  note?: string | null
  payment_method?: string | null
  datetime?: string
  tag_ids?: string[]
}

export async function POST(request: NextRequest) {
  let body: CloneBody
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.type || !['expense', 'income', 'transfer'].includes(body.type)) {
    return Response.json({ error: 'type is required' }, { status: 400 })
  }
  if (typeof body.amount !== 'number') {
    return Response.json({ error: 'amount is required' }, { status: 400 })
  }
  if (!body.account_id) {
    return Response.json({ error: 'account_id is required' }, { status: 400 })
  }
  if (!body.datetime) {
    return Response.json({ error: 'datetime is required' }, { status: 400 })
  }

  const id = crypto.randomUUID()
  const n = new Date().toISOString()

  await db.execute({
    sql: `INSERT INTO transactions
            (id, type, amount, currency, fx_rate, fx_date, sgd_equivalent,
             account_id, to_account_id, category_id, payee, note, payment_method,
             status, datetime, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)`,
    args: [
      id,
      body.type,
      body.amount,
      body.currency ?? 'SGD',
      body.fx_rate ?? null,
      body.fx_date ?? null,
      body.sgd_equivalent ?? null,
      body.account_id,
      body.to_account_id ?? null,
      body.category_id ?? null,
      body.payee ?? null,
      body.note ?? null,
      body.payment_method ?? null,
      body.datetime,
      n, n,
    ],
  })

  for (const tagId of body.tag_ids ?? []) {
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

  const result = {
    ...row.rows[0],
    tags: tagRows.rows.map((r) => ({ id: r.id as string, name: r.name as string, created_at: '' })),
  } as unknown as TransactionRow

  return Response.json(result, { status: 201 })
}
```

- [ ] **Step 1.4: Run tests to verify pass**

Run: `npx vitest run tests/api/transactions-clone.test.ts`
Expected: all 6 tests PASS.

- [ ] **Step 1.5: Commit**

```bash
git add app/api/transactions/clone/route.ts tests/api/transactions-clone.test.ts
git commit -m "feat(transactions): add POST /api/transactions/clone endpoint for cloning to draft"
```

---

## Task 2: Clone Button + Handler in Transactions Page (UI + tests)

**Files:**
- Modify: `app/(protected)/transactions/page.tsx`
- Create: `tests/components/transactions-page-clone.test.tsx`

- [ ] **Step 2.1: Write the failing UI tests**

Create `tests/components/transactions-page-clone.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'

const showToastMock = vi.fn()
vi.mock('@/app/(protected)/components/toast', () => ({
  useToast: () => ({ showToast: showToastMock }),
}))
vi.mock('@/app/(protected)/components/confirm-dialog', () => ({
  ConfirmDialog: () => null,
}))

const ACCOUNT = {
  id: 'acc1', name: 'DBS', type: 'bank', currency: 'SGD',
  is_active: 1, created_at: '2024-01-01', updated_at: '2024-01-01',
}
const CATEGORY = {
  id: 'cat1', name: 'Food', type: 'expense', sort_order: 1, parent_id: null,
  created_at: '2024-01-01', updated_at: '2024-01-01',
}
const TX = {
  id: 'tx1', type: 'expense', amount: 12.5, currency: 'SGD',
  fx_rate: null, fx_date: null, sgd_equivalent: null,
  account_id: 'acc1', to_account_id: null, category_id: 'cat1',
  payee: 'Hawker', note: 'lunch', payment_method: 'bank',
  datetime: '2026-04-01T10:00:00+08:00', status: 'approved',
  created_at: '2026-04-01', updated_at: '2026-04-01',
  account_name: 'DBS', to_account_name: null, category_name: 'Food', tags: [],
}

function setupFetch(extra?: (url: string, init?: RequestInit) => Response | undefined) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url)
    const custom = extra?.(u, init)
    if (custom) return custom
    if (u.includes('/api/transactions/clone')) {
      return { ok: true, status: 201, json: async () => ({ ...TX, id: 'new-draft', status: 'draft' }) }
    }
    if (u.includes('/api/transactions') && !u.includes('/payees') && !u.includes('/clone')) {
      return { ok: true, json: async () => ({ data: [TX], total: 1 }) }
    }
    if (u.includes('/api/accounts')) return { ok: true, json: async () => [ACCOUNT] }
    if (u.includes('/api/categories/frequent')) return { ok: true, json: async () => [] }
    if (u.includes('/api/categories')) return { ok: true, json: async () => [CATEGORY] }
    if (u.includes('/api/tags')) return { ok: true, json: async () => [] }
    return { ok: true, json: async () => [] }
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
  showToastMock.mockReset()
})

async function openEditForm() {
  const { default: TransactionsPage } = await import('@/app/(protected)/transactions/page')
  render(<TransactionsPage />)
  await waitFor(() => expect(screen.getByText('Hawker')).toBeInTheDocument())
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
  await waitFor(() => expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument())
}

describe('Clone button on edit transaction form', () => {
  it('renders [Cancel] [Clone] [Save changes] in that DOM order', async () => {
    setupFetch()
    await openEditForm()
    const cancel = screen.getByRole('button', { name: /^cancel$/i })
    const clone = screen.getByRole('button', { name: /^clone$/i })
    const save = screen.getByRole('button', { name: /^save changes$/i })

    const buttons = Array.from(
      cancel.parentElement!.querySelectorAll('button')
    )
    const labels = buttons.map((b) => b.textContent?.trim().toLowerCase())
    expect(labels).toEqual(['cancel', 'clone', 'save changes'])
    void save
    void clone
  })

  it('POSTs current form fields to /api/transactions/clone when Clone clicked', async () => {
    const fetchMock = setupFetch()
    await openEditForm()
    fireEvent.click(screen.getByRole('button', { name: /^clone$/i }))
    await waitFor(() => {
      const cloneCall = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes('/api/transactions/clone')
      )
      expect(cloneCall).toBeTruthy()
      const init = cloneCall![1] as RequestInit
      expect(init.method).toBe('POST')
      const body = JSON.parse(init.body as string)
      expect(body.type).toBe('expense')
      expect(body.amount).toBe(12.5)
      expect(body.currency).toBe('SGD')
      expect(body.account_id).toBe('acc1')
      expect(body.payee).toBe('Hawker')
      expect(body.note).toBe('lunch')
      expect(body.category_id).toBe('cat1')
      expect(body.datetime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
      expect(Array.isArray(body.tag_ids)).toBe(true)
    })
  })

  it('does NOT call PATCH /api/transactions/[id] when Clone is clicked', async () => {
    const fetchMock = setupFetch()
    await openEditForm()
    fireEvent.click(screen.getByRole('button', { name: /^clone$/i }))
    await waitFor(() => {
      expect(fetchMock.mock.calls.find((c) =>
        String(c[0]).includes('/api/transactions/clone')
      )).toBeTruthy()
    })
    const patchCall = fetchMock.mock.calls.find((c) => {
      const init = c[1] as RequestInit | undefined
      return init?.method === 'PATCH' && String(c[0]).includes('/api/transactions/tx1')
    })
    expect(patchCall).toBeUndefined()
  })

  it('shows a success toast with a "View drafts" action on success', async () => {
    setupFetch()
    await openEditForm()
    fireEvent.click(screen.getByRole('button', { name: /^clone$/i }))
    await waitFor(() => {
      const calls = showToastMock.mock.calls
      const success = calls.find((c) => c[1] === 'success')
      expect(success).toBeTruthy()
      expect(String(success![0]).toLowerCase()).toContain('draft')
      expect(success![2]).toBeTruthy()
      expect(success![2].label.toLowerCase()).toContain('draft')
      expect(typeof success![2].onClick).toBe('function')
    })
  })

  it('shows an error toast and leaves the form open on failure', async () => {
    setupFetch((url) => {
      if (url.includes('/api/transactions/clone')) {
        return { ok: false, status: 500, json: async () => ({ error: 'fail' }) } as Response
      }
      return undefined
    })
    await openEditForm()
    fireEvent.click(screen.getByRole('button', { name: /^clone$/i }))
    await waitFor(() => {
      const calls = showToastMock.mock.calls
      expect(calls.find((c) => c[1] === 'error')).toBeTruthy()
    })
    // edit form is still open
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument()
  })

  it('keeps the edit form open after a successful clone', async () => {
    setupFetch()
    await openEditForm()
    fireEvent.click(screen.getByRole('button', { name: /^clone$/i }))
    await waitFor(() => {
      const calls = showToastMock.mock.calls
      expect(calls.find((c) => c[1] === 'success')).toBeTruthy()
    })
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^cancel$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^clone$/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2.2: Run tests to verify they fail**

Run: `npx vitest run tests/components/transactions-page-clone.test.tsx`
Expected: FAIL — Clone button not found in DOM, etc.

- [ ] **Step 2.3: Add `cloningId` state and `cloneTransaction` handler in `app/(protected)/transactions/page.tsx`**

Locate the state block around line 146–152 (after `savingId`, before `deletingId`). Add `cloningId`:

Find:
```tsx
  const [savingId, setSavingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
```

Replace with:
```tsx
  const [savingId, setSavingId] = useState<string | null>(null)
  const [cloningId, setCloningId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
```

Then add the `cloneTransaction` function immediately after `saveEdit` (right before `confirmAndDelete` around line 282). Insert:

```tsx
  async function cloneTransaction(id: string) {
    if (!editForm) return
    setCloningId(id)
    try {
      const amt = parseFloat(editForm.amount)
      const rate = editForm.fx_rate ? parseFloat(editForm.fx_rate) : null
      const body = {
        type: editForm.type,
        amount: amt,
        currency: editForm.currency,
        fx_rate: rate,
        fx_date: editForm.fx_date || null,
        sgd_equivalent: editForm.currency !== 'SGD' && rate != null ? amt * rate : null,
        account_id: editForm.account_id,
        to_account_id: editForm.to_account_id || null,
        category_id: editForm.category_id || null,
        payee: editForm.payee || null,
        note: editForm.note || null,
        payment_method: accounts.find((a) => a.id === editForm.account_id)?.type ?? null,
        datetime: fromInputDt(editForm.datetime),
        tag_ids: editForm.tag_ids,
      }
      const res = await fetch('/api/transactions/clone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        showToast('Draft created from clone', 'success', {
          label: 'View drafts',
          onClick: () => { window.location.href = '/dashboard' },
        })
      } else {
        showToast('Failed to clone', 'error')
      }
    } catch {
      showToast('Failed to clone', 'error')
    } finally {
      setCloningId(null)
    }
  }
```

- [ ] **Step 2.4: Reorder buttons + add Clone button in JSX**

Locate the button row at lines 794–803. Find:
```tsx
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => saveEdit(tx.id)}
                    disabled={savingId === tx.id}
                    style={{ ...BTN_PRI, opacity: savingId === tx.id ? 0.6 : 1 }}
                  >
                    {savingId === tx.id ? 'Saving...' : 'Save changes'}
                  </button>
                  <button onClick={cancelEdit} style={BTN_SEC}>Cancel</button>
                </div>
```

Replace with:
```tsx
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={cancelEdit} style={BTN_SEC}>Cancel</button>
                  <button
                    onClick={() => cloneTransaction(tx.id)}
                    disabled={cloningId === tx.id}
                    style={{ ...BTN_SEC, opacity: cloningId === tx.id ? 0.6 : 1 }}
                  >
                    {cloningId === tx.id ? 'Cloning...' : 'Clone'}
                  </button>
                  <button
                    onClick={() => saveEdit(tx.id)}
                    disabled={savingId === tx.id}
                    style={{ ...BTN_PRI, opacity: savingId === tx.id ? 0.6 : 1 }}
                  >
                    {savingId === tx.id ? 'Saving...' : 'Save changes'}
                  </button>
                </div>
```

- [ ] **Step 2.5: Run tests to verify pass**

Run: `npx vitest run tests/components/transactions-page-clone.test.tsx`
Expected: all 6 tests PASS.

- [ ] **Step 2.6: Commit**

```bash
git add app/(protected)/transactions/page.tsx tests/components/transactions-page-clone.test.tsx
git commit -m "feat(transactions): add Clone button to edit form, posts to /api/transactions/clone"
```

---

## Task 3: Run Full Test Suite

- [ ] **Step 3.1: Run the full Vitest suite**

Run: `npm test`
Expected: all tests pass, including the 12 new tests added across Tasks 1 & 2.

- [ ] **Step 3.2: If any pre-existing test fails, investigate**

If failures relate to the changes made: fix root cause, re-run.
If unrelated to changes: leave to user.

---

## Task 4: Push branch, open PR, wait for Vercel preview, merge

- [ ] **Step 4.1: Push branch**

```bash
git push -u origin feat/edit-transaction-clone-button
```

- [ ] **Step 4.2: Open PR**

```bash
gh pr create --title "feat(transactions): add Clone button to Edit Transaction form" \
  --body "$(cat <<'EOF'
## Summary

- Add Clone button to the inline Edit Transaction form on the Transactions page
- Reorder edit-form buttons to `[Cancel] [Clone] [Save changes]` (left → right)
- Add `POST /api/transactions/clone` endpoint that copies form-field values into a new draft transaction (`status='draft'`)
- Original row is never modified by Clone
- Cloned drafts appear in the same drafts list as OCR/voice receipts (drafts-card)

## Test plan
- [x] `tests/api/transactions-clone.test.ts` — endpoint tests (creates draft, leaves original untouched, surfaces in `?status=draft`, validates required fields, supports transfers + FX)
- [x] `tests/components/transactions-page-clone.test.tsx` — UI tests (button order, POST body shape, no PATCH on clone, toast with View drafts action, error toast keeps form open, form stays open after success)
- [x] Full Vitest suite passes
- [ ] Vercel preview green
- [ ] Manual prod check: edit any transaction, click Clone, confirm new draft appears in dashboard drafts list with copied values; original transaction unchanged

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4.3: Wait for Vercel preview**

Poll PR checks until Vercel preview is `success`:
```bash
gh pr checks --watch
```

If preview fails: read logs, fix locally, push fix.

- [ ] **Step 4.4: Merge to main**

```bash
gh pr merge --merge --delete-branch
```

(Use `--merge` for merge commit, matching repo convention from recent merges.)

---

## Task 5: Verify prod deploy + report to user

- [ ] **Step 5.1: Wait for prod deploy on main**

```bash
gh run list --branch main --limit 1
```

Or check Vercel deployment for the merge commit:
```bash
gh api repos/:owner/:repo/deployments?ref=main | head -100
```

- [ ] **Step 5.2: Confirm deploy `success`**

Wait until merge-commit deployment status is `success` (not `pending`/`error`).

- [ ] **Step 5.3: Report to user**

Print:
- PR URL
- Merge commit SHA
- Files changed (list)
- RED→GREEN test output excerpt
- Full suite pass count
- Prod deploy status
- API endpoint used: `POST /api/transactions/clone`
- User verification steps (open Transactions page → click Edit on any row → click Clone → verify toast → click View drafts → confirm new draft in drafts-card with copied values → return to Transactions page → confirm original row unchanged)
