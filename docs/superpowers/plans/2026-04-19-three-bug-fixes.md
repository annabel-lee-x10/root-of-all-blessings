# Three Bug Fixes: Receipt/Draft/Manual Transaction Type Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three bugs so that expense/income type is correctly inferred from receipt OCR, draft card edits, and manual/voice/paste entry.

**Architecture:** All three bugs share a common root: `BlessThisData` has no `type` field and `insertDraftTransaction` hardcodes `'expense'`. Fix the shared foundation first, then fix each surface: receipt route, draft card form, and paste/voice form.

**Tech Stack:** Next.js App Router, TypeScript, React inline styles, Vitest + @testing-library/react, better-sqlite3 (tests)

---

## Files

- Modify: `lib/parse-bless-this.ts` — add `type` field + parsing (Bugs 1 & 3)
- Modify: `app/api/receipts/_lib.ts` — add `type` param to `insertDraftTransaction`
- Modify: `app/api/receipts/process/route.ts` — update prompt + pass type + fix category lookup
- Modify: `app/(protected)/components/drafts-card.tsx` — add type selector, fix category filter, fix amount display
- Modify: `app/(protected)/components/wheres-my-money.tsx` — call `setType()` in `applyPasteData`
- Modify: `BUGS.md` — add BUG-008, BUG-009, BUG-010
- Create: `tests/regression/bug-008-receipt-type.test.ts`
- Create: `tests/regression/bug-009-draft-category-filter.test.tsx`
- Create: `tests/regression/bug-010-paste-type.test.tsx`

---

### Task 1: Add `type` to `BlessThisData` and `parseBlessThis`

**Files:**
- Modify: `lib/parse-bless-this.ts`
- Test: `tests/regression/bug-010-paste-type.test.tsx` (partial — just the parser unit tests)

- [ ] **Step 1: Write the failing unit test**

Create `tests/regression/bug-010-paste-type.test.tsx`:

```typescript
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'

describe('parseBlessThis — type field (BUG-010)', () => {
  it('parses Type: income', async () => {
    const { parseBlessThis } = await import('@/lib/parse-bless-this')
    const result = parseBlessThis('Amount: 760\nType: income\nMerchant/Payee: Mission Control')
    expect(result.type).toBe('income')
  })

  it('parses Type: expense', async () => {
    const { parseBlessThis } = await import('@/lib/parse-bless-this')
    const result = parseBlessThis('Amount: 23.50\nType: expense')
    expect(result.type).toBe('expense')
  })

  it('returns undefined type when Type line is absent', async () => {
    const { parseBlessThis } = await import('@/lib/parse-bless-this')
    const result = parseBlessThis('Amount: 50\nMerchant/Payee: NTUC')
    expect(result.type).toBeUndefined()
  })

  it('ignores unknown type values', async () => {
    const { parseBlessThis } = await import('@/lib/parse-bless-this')
    const result = parseBlessThis('Type: bogus\nAmount: 10')
    expect(result.type).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```
npx vitest run tests/regression/bug-010-paste-type.test.tsx
```
Expected: FAIL — `result.type` is undefined for 'income' case (no type field on BlessThisData)

- [ ] **Step 3: Add `type` to `BlessThisData` and parse it**

In `lib/parse-bless-this.ts`, make these changes:

Add import at top:
```typescript
import type { TxType } from './types'
```

Add `type` field to `BlessThisData` interface (after `notes`):
```typescript
export interface BlessThisData {
  amount?: number
  currency?: string
  payee?: string
  date?: string
  time?: string
  category?: string
  tags?: string[]
  payment_method?: string
  account?: string
  notes?: string
  type?: TxType
}
```

Add a `case 'type':` block to the switch statement (after `case 'notes':`):
```typescript
      case 'type': {
        const v = value.toLowerCase()
        if (v === 'income' || v === 'expense' || v === 'transfer') result.type = v as TxType
        break
      }
```

- [ ] **Step 4: Run tests to verify they pass**

```
npx vitest run tests/regression/bug-010-paste-type.test.tsx
```
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/parse-bless-this.ts tests/regression/bug-010-paste-type.test.tsx
git commit -m "feat: add type field to BlessThisData and parseBlessThis"
```

---

### Task 2: Fix `insertDraftTransaction` to accept and use `type`

**Files:**
- Modify: `app/api/receipts/_lib.ts`

- [ ] **Step 1: Add `type` to the opts interface and SQL**

In `app/api/receipts/_lib.ts`, change the `insertDraftTransaction` function opts interface to include `type`:

```typescript
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
  type?: TxType
}): Promise<TransactionRow> {
```

Add the import at the top of `_lib.ts`:
```typescript
import type { TransactionRow, TxType } from '@/lib/types'
```
(The existing import is `import type { TransactionRow } from '@/lib/types'` — add `TxType` to it.)

Change the SQL INSERT from hardcoded `'expense'` to use opts.type:

```typescript
  await db.execute({
    sql: `INSERT INTO transactions
            (id, type, amount, currency, fx_rate, fx_date, sgd_equivalent,
             account_id, to_account_id, category_id, payee, note, payment_method,
             status, datetime, created_at, updated_at)
          VALUES (?, ?, ?, ?, NULL, NULL, NULL, ?, NULL, ?, ?, ?, ?, 'draft', ?, ?, ?)`,
    args: [
      id,
      opts.type ?? 'expense',
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
```

- [ ] **Step 2: Verify build still passes**

```
npx tsc --noEmit
```
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add app/api/receipts/_lib.ts
git commit -m "feat: insertDraftTransaction accepts optional type param (default expense)"
```

---

### Task 3: Fix receipt OCR prompt, category lookup, and pass type

**Files:**
- Modify: `app/api/receipts/process/route.ts`
- Test: `tests/regression/bug-008-receipt-type.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/regression/bug-008-receipt-type.test.ts`:

```typescript
// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { initTestDb, clearTestDb, resetTestDb, req, seedAccount, seedCategory } from '../helpers'

beforeAll(() => initTestDb())
afterAll(() => clearTestDb())
beforeEach(() => {
  resetTestDb()
  seedAccount('acc1', 'DBS', 'bank')
  seedCategory('cat1', 'Food', 'expense')
  seedCategory('cat2', 'Salary', 'income')
})

function mockAnthropicResponse(text: string) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ content: [{ text }] }),
  }))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('POST /api/receipts/process — type field (BUG-008)', () => {
  it('creates income draft when OCR returns Type: income', async () => {
    mockAnthropicResponse('Amount: 760\nType: income\nMerchant/Payee: Mission Control\nDate: 2026-04-19\nCategory: Salary')
    process.env.ANTHROPIC_API_KEY = 'test-key'
    const { POST } = await import('@/app/api/receipts/process/route')
    const res = await POST(req('/api/receipts/process', 'POST', {
      imageBase64: Buffer.from('fake').toString('base64'),
      mediaType: 'image/jpeg',
      accountId: 'acc1',
    }))
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.draft.type).toBe('income')
  })

  it('creates expense draft by default when no Type line', async () => {
    mockAnthropicResponse('Amount: 23.50\nMerchant/Payee: NTUC\nDate: 2026-04-19\nCategory: Food')
    process.env.ANTHROPIC_API_KEY = 'test-key'
    const { POST } = await import('@/app/api/receipts/process/route')
    const res = await POST(req('/api/receipts/process', 'POST', {
      imageBase64: Buffer.from('fake').toString('base64'),
      mediaType: 'image/jpeg',
      accountId: 'acc1',
    }))
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.draft.type).toBe('expense')
  })

  it('matches income category when type is income', async () => {
    mockAnthropicResponse('Amount: 5000\nType: income\nMerchant/Payee: Employer\nDate: 2026-04-19\nCategory: Salary')
    process.env.ANTHROPIC_API_KEY = 'test-key'
    const { POST } = await import('@/app/api/receipts/process/route')
    const res = await POST(req('/api/receipts/process', 'POST', {
      imageBase64: Buffer.from('fake').toString('base64'),
      mediaType: 'image/jpeg',
      accountId: 'acc1',
    }))
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.draft.category_name).toBe('Salary')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```
npx vitest run tests/regression/bug-008-receipt-type.test.ts
```
Expected: FAIL — `data.draft.type` is 'expense' even for income case

- [ ] **Step 3: Update `RECEIPT_PROMPT` in route.ts**

In `app/api/receipts/process/route.ts`, update `RECEIPT_PROMPT` to add the `Type` field and inference rules:

```typescript
const RECEIPT_PROMPT = `You are a receipt parser for a personal finance app. Extract all available expense information from this receipt image.

Output EXACTLY in this format (omit lines you cannot determine):
Type: [expense or income]
Amount: [total amount, numbers only]
Currency: [3-letter code, default SGD]
Merchant/Payee: [store or vendor name]
Date: [YYYY-MM-DD]
Time: [HH:MM 24h]
Category: [one of: Food, Transport, Housing, Bills, Health, Entertainment, Subscriptions, Education, Pet, Other, Salary]
Tags: [3-5 lowercase comma-separated contextual tags]
Description: [1-2 sentence description of the purchase context]
Payment Method: [cash/credit card/debit card/e-wallet]

Rules:
- Type is income if the document shows money received: sold, sale, resale, repayment, refund, reimbursement, received, earned, freelance, salary, got paid, cashback received, dividend; otherwise expense
- Amount is the grand total (GST-inclusive if shown)
- Category inferred from merchant type and line items
- Tags: use item types, time of day, merchant type, spend amount as signals
- If a field cannot be determined, omit that line entirely`
```

- [ ] **Step 4: Fix category lookup to use parsed type**

In `app/api/receipts/process/route.ts`, update the category lookup section (lines ~114-125) to use parsed type:

```typescript
  const parsedType = parsed.type ?? 'expense'

  // Match category by name
  const catResult = await db.execute({
    sql: 'SELECT id, name FROM categories WHERE type = ?',
    args: [parsedType],
  })
  let categoryId: string | null = null
  if (parsed.category) {
    const match = catResult.rows.find(
      (c) => (c.name as string).toLowerCase() === parsed.category!.toLowerCase()
    )
    if (match) categoryId = match.id as string
  }
```

- [ ] **Step 5: Pass type to insertDraftTransaction**

Update the `insertDraftTransaction` call (lines ~145-155):

```typescript
  const draft = await insertDraftTransaction({
    accountId: resolvedAccountId,
    categoryId,
    payee: parsed.payee ?? null,
    note: noteText,
    paymentMethod: parsed.payment_method ?? null,
    amount: parsed.amount,
    currency: parsed.currency ?? 'SGD',
    datetime,
    tagIds,
    type: parsedType,
  })
```

- [ ] **Step 6: Run tests to verify they pass**

```
npx vitest run tests/regression/bug-008-receipt-type.test.ts
```
Expected: PASS (3 tests)

- [ ] **Step 7: Commit**

```bash
git add app/api/receipts/process/route.ts app/api/receipts/_lib.ts tests/regression/bug-008-receipt-type.test.ts
git commit -m "fix(BUG-008): receipt OCR infers transaction type from prompt output"
```

---

### Task 4: Fix draft card edit form

**Files:**
- Modify: `app/(protected)/components/drafts-card.tsx`
- Test: `tests/regression/bug-009-draft-category-filter.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/regression/bug-009-draft-category-filter.test.tsx`:

```typescript
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'

const mockAccounts = [{ id: 'acc1', name: 'DBS', type: 'bank', currency: 'SGD', is_active: 1 }]
const mockCategories = [
  { id: 'cat1', name: 'Food', type: 'expense' },
  { id: 'cat2', name: 'Salary', type: 'income' },
]
const mockTags: unknown[] = []
const mockIncomeDraft = {
  id: 'tx1',
  type: 'income',
  amount: 760,
  currency: 'SGD',
  account_id: 'acc1',
  to_account_id: null,
  category_id: 'cat2',
  category_name: 'Salary',
  payee: 'Mission Control',
  note: null,
  payment_method: null,
  datetime: '2026-04-19T10:00:00.000Z',
  status: 'draft',
  tags: [],
  account_name: 'DBS',
  to_account_name: null,
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
    if (url.includes('/api/accounts')) return Promise.resolve({ ok: true, json: () => Promise.resolve(mockAccounts) })
    if (url.includes('/api/categories')) return Promise.resolve({ ok: true, json: () => Promise.resolve(mockCategories) })
    if (url.includes('/api/tags')) return Promise.resolve({ ok: true, json: () => Promise.resolve(mockTags) })
    if (url.includes('/api/transactions?status=draft')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [mockIncomeDraft] }) })
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('DraftsCard edit form (BUG-009)', () => {
  it('shows income category options when editing an income draft', async () => {
    const { DraftsCard } = await import('@/app/(protected)/components/drafts-card')
    render(<DraftsCard />)
    // Open the drafts panel
    const header = screen.getByRole('button', { name: /drafts/i })
    fireEvent.click(header)
    await waitFor(() => expect(screen.getByText('Mission Control')).toBeInTheDocument())
    // Click edit
    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    await waitFor(() => expect(screen.getByLabelText(/type/i)).toBeInTheDocument())
    // Category dropdown should include Salary (income category) but not Food (expense category)
    expect(screen.getByRole('option', { name: 'Salary' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Food' })).not.toBeInTheDocument()
  })

  it('income draft row displays amount as positive green, not red with minus', async () => {
    const { DraftsCard } = await import('@/app/(protected)/components/drafts-card')
    render(<DraftsCard />)
    const header = screen.getByRole('button', { name: /drafts/i })
    fireEvent.click(header)
    await waitFor(() => expect(screen.getByText('Mission Control')).toBeInTheDocument())
    // Amount display should be +760.00, not -760.00
    expect(screen.queryByText(/-760/)).not.toBeInTheDocument()
    expect(screen.getByText(/760\.00/)).toBeInTheDocument()
  })

  it('type selector is visible in edit form', async () => {
    const { DraftsCard } = await import('@/app/(protected)/components/drafts-card')
    render(<DraftsCard />)
    const header = screen.getByRole('button', { name: /drafts/i })
    fireEvent.click(header)
    await waitFor(() => expect(screen.getByText('Mission Control')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    await waitFor(() => expect(screen.getByLabelText(/type/i)).toBeInTheDocument())
    const typeSelect = screen.getByLabelText(/type/i)
    expect(typeSelect).toHaveValue('income')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```
npx vitest run tests/regression/bug-009-draft-category-filter.test.tsx
```
Expected: FAIL — type selector not in form, Salary category not shown for income drafts

- [ ] **Step 3: Add type selector and fix category filter in drafts-card.tsx**

In `app/(protected)/components/drafts-card.tsx`:

**3a. Remove the `expenseCategories` line** (line 213):
```typescript
  const expenseCategories = categories.filter((c) => c.type === 'expense')
```
Delete this line entirely. We'll compute categories dynamically in the form.

**3b. Add type selector as first field in the edit form grid** (insert before the Amount div at line 407):

```tsx
                      <div>
                        <label htmlFor={`edit-type-${tx.id}`} style={{ color: '#8b949e', fontSize: '11px', display: 'block', marginBottom: '3px' }}>Type</label>
                        <select
                          id={`edit-type-${tx.id}`}
                          aria-label="Type"
                          style={SELECT}
                          value={editForm.type}
                          onChange={(e) => ef('type', e.target.value as TxType)}
                        >
                          <option value="expense">Expense</option>
                          <option value="income">Income</option>
                          <option value="transfer">Transfer</option>
                        </select>
                      </div>
```

**3c. Fix the category dropdown** to use `editForm.type` instead of `expenseCategories`:

Replace:
```tsx
                          {expenseCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
```
With:
```tsx
                          {categories.filter((c) => c.type === editForm.type).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
```

**3d. Fix the row amount display** (line 356-358) to show income in green without minus:

Replace:
```tsx
                  <span style={{ color: '#f85149', fontSize: '13px', fontWeight: 600, flexShrink: 0 }}>
                    -{tx.currency} {(tx.amount as number).toFixed(2)}
                  </span>
```
With:
```tsx
                  <span style={{
                    color: tx.type === 'income' ? '#3fb884' : '#f85149',
                    fontSize: '13px', fontWeight: 600, flexShrink: 0
                  }}>
                    {tx.type === 'income' ? '+' : '-'}{tx.currency} {(tx.amount as number).toFixed(2)}
                  </span>
```

- [ ] **Step 4: Run tests to verify they pass**

```
npx vitest run tests/regression/bug-009-draft-category-filter.test.tsx
```
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add app/(protected)/components/drafts-card.tsx tests/regression/bug-009-draft-category-filter.test.tsx
git commit -m "fix(BUG-009): draft edit form shows type selector and filters categories by type"
```

---

### Task 5: Fix `applyPasteData` to call `setType()`

**Files:**
- Modify: `app/(protected)/components/wheres-my-money.tsx`
- Test: `tests/regression/bug-010-paste-type.test.tsx` (extend with form tests)

- [ ] **Step 1: Add form integration tests to bug-010 regression file**

Append to `tests/regression/bug-010-paste-type.test.tsx`:

```typescript
import { vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'

const mockAccounts = [{ id: 'acc1', name: 'DBS', type: 'bank', currency: 'SGD', is_active: 1 }]
const mockCategories = [
  { id: 'cat1', name: 'Food', type: 'expense' },
  { id: 'cat2', name: 'Salary', type: 'income' },
]

function setupFetchMock() {
  vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
    if (url.includes('/api/accounts')) return Promise.resolve({ ok: true, json: () => Promise.resolve(mockAccounts) })
    if (url.includes('/api/categories')) return Promise.resolve({ ok: true, json: () => Promise.resolve(mockCategories) })
    if (url.includes('/api/tags')) return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
  }))
}

describe('WheresMyMoney — paste applies type (BUG-010)', () => {
  beforeEach(setupFetchMock)
  afterEach(() => vi.unstubAllGlobals())

  it('sets type to income when paste text contains Type: income', async () => {
    const { WheresMyMoney } = await import('@/app/(protected)/components/wheres-my-money')
    render(<WheresMyMoney />)
    await waitFor(() => expect(screen.getByRole('button', { name: /expense/i })).toBeInTheDocument())
    // Open paste panel
    fireEvent.click(screen.getByRole('button', { name: /paste/i }))
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'Amount: 760\nType: income\nMerchant/Payee: Mission Control' } })
    fireEvent.click(screen.getByRole('button', { name: /apply/i }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /income/i })).toHaveAttribute('aria-pressed', 'true')
    })
  })

  it('leaves type as expense when paste text has no Type line', async () => {
    const { WheresMyMoney } = await import('@/app/(protected)/components/wheres-my-money')
    render(<WheresMyMoney />)
    await waitFor(() => expect(screen.getByRole('button', { name: /expense/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /paste/i }))
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'Amount: 23.50\nMerchant/Payee: NTUC' } })
    fireEvent.click(screen.getByRole('button', { name: /apply/i }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /expense/i })).toHaveAttribute('aria-pressed', 'true')
    })
  })
})
```

- [ ] **Step 2: Run test to verify the new tests fail**

```
npx vitest run tests/regression/bug-010-paste-type.test.tsx
```
Expected: parser tests pass; form tests FAIL (type stays expense even for income paste)

- [ ] **Step 3: Fix `applyPasteData` in wheres-my-money.tsx**

In `app/(protected)/components/wheres-my-money.tsx`, in the `applyPasteData` function (after `if (data.notes)` block), add:

```typescript
    if (data.type) setType(data.type)
```

Insert it immediately after `if (data.payment_method) setPaymentMethod(data.payment_method)` (around line 151), so it reads:

```typescript
    if (data.amount) setAmount(String(data.amount))
    if (data.currency) setCurrency(data.currency)
    if (data.payee) setPayee(data.payee)
    if (data.payment_method) setPaymentMethod(data.payment_method)
    if (data.type) setType(data.type)
    if (data.notes) { setNote(data.notes); setShowNoteField(true) }
```

- [ ] **Step 4: Run tests to verify they pass**

```
npx vitest run tests/regression/bug-010-paste-type.test.tsx
```
Expected: PASS (all 6 tests)

- [ ] **Step 5: Commit**

```bash
git add app/(protected)/components/wheres-my-money.tsx tests/regression/bug-010-paste-type.test.tsx
git commit -m "fix(BUG-010): paste/voice applies transaction type from parsed data"
```

---

### Task 6: Update BUGS.md

**Files:**
- Modify: `BUGS.md`

- [ ] **Step 1: Append BUG-008, BUG-009, BUG-010 entries to BUGS.md**

Add after the last existing entry:

```markdown
## BUG-008 — Receipt OCR always creates expense drafts (FIXED)

**Symptom:** Uploading a receipt for income (e.g. "Sold a bag") always created a draft with `type=expense`.
**Root cause:** `RECEIPT_PROMPT` had no `Type` field; `parseBlessThis` had no type parsing; `insertDraftTransaction` hardcoded `'expense'`.
**Fix:** Added `Type: expense|income` to OCR prompt with inference rules; added `type` field to `BlessThisData`; updated `insertDraftTransaction` to accept `type` param; updated category lookup to filter by parsed type.
**Regression test:** `tests/regression/bug-008-receipt-type.test.ts`

## BUG-009 — Draft card edit form missing type selector; category filter hardcoded to expense (FIXED)

**Symptom:** Editing a draft showed no type selector. Category dropdown always showed expense categories even for income drafts. Income draft amounts showed red with minus sign.
**Root cause:** `EditForm.type` state existed but no `<select>` rendered it; `expenseCategories` constant was hardcoded; amount display had no type check.
**Fix:** Added type `<select>` as first edit form field; replaced `expenseCategories` with `categories.filter((c) => c.type === editForm.type)`; made amount display green/+ for income.
**Regression test:** `tests/regression/bug-009-draft-category-filter.test.tsx`

## BUG-010 — Paste/voice entry ignores transaction type (FIXED)

**Symptom:** Pasting or dictating "Sold a bag for $760" always set the form to `type=expense`.
**Root cause:** `BlessThisData` had no `type` field; `applyPasteData` never called `setType()`.
**Fix:** Added `type?: TxType` to `BlessThisData`; added `case 'type':` to parser switch; added `if (data.type) setType(data.type)` in `applyPasteData`.
**Regression test:** `tests/regression/bug-010-paste-type.test.tsx`
```

- [ ] **Step 2: Commit**

```bash
git add BUGS.md
git commit -m "docs: add BUG-008/009/010 entries to BUGS.md"
```

---

### Task 7: Full test run and build

- [ ] **Step 1: Run all tests**

```
npx vitest run
```
Expected: All tests pass (no failures)

- [ ] **Step 2: Run build**

```
npm run build
```
Expected: Exits 0, no TypeScript errors

- [ ] **Step 3: Fix any failures before proceeding**

If tests or build fail, fix the issue and re-run before moving on.

---

### Task 8: Create PR to main

- [ ] **Step 1: Push branch**

```bash
git push -u origin claude/dazzling-allen-d55fa2
```

- [ ] **Step 2: Create PR**

```bash
gh pr create --title "fix: infer transaction type in receipt OCR, draft edit form, and paste/voice entry" --body "$(cat <<'EOF'
## Summary
- **BUG-008**: Receipt OCR now infers `expense` vs `income` from prompt output; category lookup respects the parsed type; `insertDraftTransaction` accepts a `type` param
- **BUG-009**: Draft card edit form now has a Type selector; category dropdown filters by the selected type; income draft rows show green `+` amount instead of red `-`
- **BUG-010**: Paste/voice entry now sets the transaction type toggle when the parsed text contains a `Type:` field

## Test plan
- [ ] All existing tests still pass (`npx vitest run`)
- [ ] Three new regression test files cover each bug
- [ ] `npm run build` exits 0 with no TS errors
- [ ] Manual: upload a "sold item" receipt image — draft should have `type=income`
- [ ] Manual: paste "Amount: 760\nType: income\nMerchant/Payee: Mission Control" — Income pill should be highlighted
- [ ] Manual: open a draft with type=income and click Edit — Type shows "Income", category dropdown shows income categories

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
