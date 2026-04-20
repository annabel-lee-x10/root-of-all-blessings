# Expense Dashboard Drill-Down Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add clickable category bars in the expense dashboard that drill down to tag-level breakdowns, with a back button, loading skeleton, and transfers excluded — backed by a new `drilldown` query param on `/api/dashboard`.

**Architecture:** Three-file change — add `seedTransactionTag` test helper, extend the API route to handle `?drilldown=<category>` returning tag totals, then update `ExpenseDashboard` with drilldown state, clickable rows, and a tag breakdown panel. TDD throughout.

**Tech Stack:** Next.js App Router, React (inline styles), SQLite via `@/lib/db`, Vitest + Testing Library, `better-sqlite3` for test DB.

---

## File Map

| File | Change |
|---|---|
| `tests/helpers.ts` | Add `seedTransactionTag(txId, tagId)` export |
| `tests/api/dashboard.test.ts` | Add 6 drilldown API tests |
| `app/api/dashboard/route.ts` | Handle `drilldown` param — return tag breakdown |
| `tests/components/expense-dashboard.test.tsx` | Add 6 drilldown UI tests |
| `app/(protected)/components/expense-dashboard.tsx` | Add drilldown state, clickable rows, tag panel |

---

## Task 1: Add `seedTransactionTag` test helper

**Files:**
- Modify: `tests/helpers.ts`

- [ ] **Step 1: Add helper function at end of file**

In `tests/helpers.ts`, add after the `seedTransaction` export:

```ts
export function seedTransactionTag(transactionId: string, tagId: string) {
  testDb.prepare(
    'INSERT INTO transaction_tags (transaction_id, tag_id) VALUES (?, ?)'
  ).run(transactionId, tagId)
}
```

- [ ] **Step 2: Run existing tests to confirm no regressions**

```bash
npx vitest run tests/api/dashboard.test.ts
```

Expected: all 7 existing tests PASS

- [ ] **Step 3: Commit**

```bash
git add tests/helpers.ts
git commit -m "test: add seedTransactionTag helper"
```

---

## Task 2: Write failing API tests for drilldown

**Files:**
- Modify: `tests/api/dashboard.test.ts`

- [ ] **Step 1: Add imports and new describe block**

At the top of `tests/api/dashboard.test.ts`, update the import line to include `seedTransactionTag` and `seedTag`:

```ts
import { initTestDb, clearTestDb, resetTestDb, req, seedAccount, seedCategory, seedTag, seedTransaction, seedTransactionTag } from '../helpers'
```

Then append this entire describe block after the closing `})` of the existing `describe('GET /api/dashboard', ...)`:

```ts
describe('GET /api/dashboard (drilldown)', () => {
  it('returns tag breakdown for a category', async () => {
    seedTag('tag1', 'Dining Out')
    seedTag('tag2', 'Groceries')
    seedTransaction('tx1', 'acc1', { type: 'expense', amount: 50, categoryId: 'cat1', datetime: '2026-04-19T10:00:00+08:00' })
    seedTransaction('tx2', 'acc1', { type: 'expense', amount: 30, categoryId: 'cat1', datetime: '2026-04-19T12:00:00+08:00' })
    seedTransactionTag('tx1', 'tag1')
    seedTransactionTag('tx2', 'tag2')
    const { GET } = await import('@/app/api/dashboard/route')
    const res = await GET(req('/api/dashboard?range=custom&start=2026-04-19T00:00:00%2B08:00&end=2026-04-19T23:59:59%2B08:00&drilldown=Food'))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.category_name).toBe('Food')
    expect(data.total).toBeCloseTo(80)
    expect(data.tag_breakdown).toHaveLength(2)
    expect(data.tag_breakdown[0].tag_name).toBe('Dining Out')
    expect(data.tag_breakdown[0].total).toBeCloseTo(50)
    expect(data.tag_breakdown[0].pct).toBeCloseTo(62.5)
  })

  it('groups multiple transactions under the same tag', async () => {
    seedTag('tag1', 'Dining Out')
    seedTransaction('tx1', 'acc1', { type: 'expense', amount: 20, categoryId: 'cat1', datetime: '2026-04-19T10:00:00+08:00' })
    seedTransaction('tx2', 'acc1', { type: 'expense', amount: 30, categoryId: 'cat1', datetime: '2026-04-19T12:00:00+08:00' })
    seedTransactionTag('tx1', 'tag1')
    seedTransactionTag('tx2', 'tag1')
    const { GET } = await import('@/app/api/dashboard/route')
    const res = await GET(req('/api/dashboard?range=custom&start=2026-04-19T00:00:00%2B08:00&end=2026-04-19T23:59:59%2B08:00&drilldown=Food'))
    const data = await res.json()
    expect(data.tag_breakdown).toHaveLength(1)
    expect(data.tag_breakdown[0].tag_name).toBe('Dining Out')
    expect(data.tag_breakdown[0].total).toBeCloseTo(50)
  })

  it('shows untagged transactions as "(untagged)"', async () => {
    seedTransaction('tx1', 'acc1', { type: 'expense', amount: 40, categoryId: 'cat1', datetime: '2026-04-19T10:00:00+08:00' })
    // no seedTransactionTag call — tx1 is untagged
    const { GET } = await import('@/app/api/dashboard/route')
    const res = await GET(req('/api/dashboard?range=custom&start=2026-04-19T00:00:00%2B08:00&end=2026-04-19T23:59:59%2B08:00&drilldown=Food'))
    const data = await res.json()
    expect(data.tag_breakdown).toHaveLength(1)
    expect(data.tag_breakdown[0].tag_name).toBe('(untagged)')
    expect(data.tag_breakdown[0].total).toBeCloseTo(40)
    expect(data.tag_breakdown[0].pct).toBeCloseTo(100)
  })

  it('excludes transfers from drilldown totals', async () => {
    seedAccount('acc2', 'Cash', 'cash')
    seedTransaction('tx1', 'acc1', { type: 'transfer', amount: 100, toAccountId: 'acc2', datetime: '2026-04-19T10:00:00+08:00' })
    const { GET } = await import('@/app/api/dashboard/route')
    const res = await GET(req('/api/dashboard?range=custom&start=2026-04-19T00:00:00%2B08:00&end=2026-04-19T23:59:59%2B08:00&drilldown=Food'))
    const data = await res.json()
    expect(data.total).toBe(0)
    expect(data.tag_breakdown).toHaveLength(0)
  })

  it('respects date range — excludes transactions outside range', async () => {
    seedTransaction('tx1', 'acc1', { type: 'expense', amount: 50, categoryId: 'cat1', datetime: '2026-01-01T10:00:00+08:00' })
    const { GET } = await import('@/app/api/dashboard/route')
    const res = await GET(req('/api/dashboard?range=custom&start=2026-04-19T00:00:00%2B08:00&end=2026-04-19T23:59:59%2B08:00&drilldown=Food'))
    const data = await res.json()
    expect(data.total).toBe(0)
    expect(data.tag_breakdown).toHaveLength(0)
  })

  it('returns total 0 and empty breakdown when category has no spend in range', async () => {
    // no transactions seeded
    const { GET } = await import('@/app/api/dashboard/route')
    const res = await GET(req('/api/dashboard?range=custom&start=2026-04-19T00:00:00%2B08:00&end=2026-04-19T23:59:59%2B08:00&drilldown=Food'))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.category_name).toBe('Food')
    expect(data.total).toBe(0)
    expect(data.tag_breakdown).toEqual([])
  })
})
```

- [ ] **Step 2: Run new tests to verify they fail**

```bash
npx vitest run tests/api/dashboard.test.ts
```

Expected: the 6 new tests FAIL (drilldown param not yet handled), the existing 7 PASS

---

## Task 3: Implement drilldown in API route

**Files:**
- Modify: `app/api/dashboard/route.ts`

- [ ] **Step 1: Add drilldown handler block**

In `app/api/dashboard/route.ts`, add a drilldown early-return block after the `getRangeDates` call. Replace the function from line 37 onwards with this complete new version:

```ts
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams
  const range = p.get('range') ?? 'monthly'

  if (!VALID_RANGES.includes(range as Range)) {
    return Response.json({ error: 'range must be daily, 7day, monthly, or custom' }, { status: 400 })
  }

  const [startDate, endDate, daysInRange] = getRangeDates(
    range as Range,
    p.get('start'),
    p.get('end'),
  )

  const drilldown = p.get('drilldown')
  if (drilldown) {
    const [totalResult, tagResult] = await Promise.all([
      db.execute({
        sql: `SELECT COALESCE(SUM(CASE WHEN t.currency = 'SGD' THEN t.amount ELSE COALESCE(t.sgd_equivalent, t.amount) END), 0) as total
              FROM transactions t
              LEFT JOIN categories c ON t.category_id = c.id
              WHERE t.type = 'expense' AND t.datetime >= ? AND t.datetime <= ? AND c.name = ?`,
        args: [startDate, endDate, drilldown],
      }),
      db.execute({
        sql: `SELECT COALESCE(tg.name, '(untagged)') as tag_name,
                     COALESCE(SUM(CASE WHEN t.currency = 'SGD' THEN t.amount ELSE COALESCE(t.sgd_equivalent, t.amount) END), 0) as total
              FROM transactions t
              LEFT JOIN categories c ON t.category_id = c.id
              LEFT JOIN transaction_tags tt ON t.id = tt.transaction_id
              LEFT JOIN tags tg ON tt.tag_id = tg.id
              WHERE t.type = 'expense' AND t.datetime >= ? AND t.datetime <= ? AND c.name = ?
              GROUP BY tg.id, tg.name
              ORDER BY (tg.id IS NULL), total DESC`,
        args: [startDate, endDate, drilldown],
      }),
    ])

    const categoryTotal = Number(totalResult.rows[0].total)
    const tagBreakdown = tagResult.rows.map((r) => ({
      tag_name: r.tag_name as string,
      total: Number(r.total),
      pct: categoryTotal > 0 ? Math.round((Number(r.total) / categoryTotal) * 1000) / 10 : 0,
    }))

    return Response.json({
      category_name: drilldown,
      total: categoryTotal,
      tag_breakdown: tagBreakdown,
    })
  }

  const [expenseResult, incomeResult, catResult] = await Promise.all([
    db.execute({
      sql: `SELECT COALESCE(SUM(CASE WHEN currency = 'SGD' THEN amount ELSE COALESCE(sgd_equivalent, amount) END), 0) as total
            FROM transactions
            WHERE type = 'expense' AND datetime >= ? AND datetime <= ?`,
      args: [startDate, endDate],
    }),
    db.execute({
      sql: `SELECT COALESCE(SUM(CASE WHEN currency = 'SGD' THEN amount ELSE COALESCE(sgd_equivalent, amount) END), 0) as total
            FROM transactions
            WHERE type = 'income' AND datetime >= ? AND datetime <= ?`,
      args: [startDate, endDate],
    }),
    db.execute({
      sql: `SELECT c.name as category_name,
                   COALESCE(SUM(CASE WHEN t.currency = 'SGD' THEN t.amount ELSE COALESCE(t.sgd_equivalent, t.amount) END), 0) as total
            FROM transactions t
            LEFT JOIN categories c ON t.category_id = c.id
            WHERE t.type = 'expense' AND t.datetime >= ? AND t.datetime <= ?
            GROUP BY t.category_id, c.name
            ORDER BY total DESC`,
      args: [startDate, endDate],
    }),
  ])

  const totalSpend = Number(expenseResult.rows[0].total)
  const totalIncome = Number(incomeResult.rows[0].total)

  const categoryBreakdown = catResult.rows.map((r) => ({
    category_name: (r.category_name as string | null) ?? 'Uncategorised',
    total: Number(r.total),
    pct: totalSpend > 0 ? Math.round((Number(r.total) / totalSpend) * 1000) / 10 : 0,
  }))

  return Response.json({
    total_spend: totalSpend,
    total_income: totalIncome,
    daily_average: daysInRange > 0 ? Math.round((totalSpend / daysInRange) * 100) / 100 : 0,
    category_breakdown: categoryBreakdown,
    days_in_range: daysInRange,
    budget_remaining: null,
    range,
    start_date: startDate,
    end_date: endDate,
  })
}
```

- [ ] **Step 2: Run API tests to verify all pass**

```bash
npx vitest run tests/api/dashboard.test.ts
```

Expected: all 13 tests PASS

- [ ] **Step 3: Commit**

```bash
git add app/api/dashboard/route.ts tests/api/dashboard.test.ts
git commit -m "feat: add drilldown query param to /api/dashboard"
```

---

## Task 4: Write failing component tests for drilldown

**Files:**
- Modify: `tests/components/expense-dashboard.test.tsx`

- [ ] **Step 1: Add drilldown mock data and new describe block**

Append the following to the end of `tests/components/expense-dashboard.test.tsx`, before the final closing line:

```tsx
const mockDrilldownData = {
  category_name: 'Food',
  total: 800,
  tag_breakdown: [
    { tag_name: 'Dining Out', total: 500, pct: 62.5 },
    { tag_name: '(untagged)', total: 300, pct: 37.5 },
  ],
}

function mockDrilldownFetch() {
  vi.mocked(fetch).mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve(mockDrilldownData),
  } as Response)
}

describe('ExpenseDashboard drilldown', () => {
  it('category rows have role="button"', async () => {
    const { ExpenseDashboard } = await import('@/app/(protected)/components/expense-dashboard')
    render(<ExpenseDashboard />)
    await waitFor(() => expect(screen.getByText('Food')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Food' })).toBeInTheDocument()
  })

  it('clicking a category fetches drilldown with drilldown param', async () => {
    const { ExpenseDashboard } = await import('@/app/(protected)/components/expense-dashboard')
    render(<ExpenseDashboard />)
    await waitFor(() => expect(screen.getByText('Food')).toBeInTheDocument())
    mockDrilldownFetch()
    fireEvent.click(screen.getByRole('button', { name: 'Food' }))
    await waitFor(() => {
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(expect.stringContaining('drilldown=Food'))
    })
  })

  it('drilldown fetch includes current range param', async () => {
    const { ExpenseDashboard } = await import('@/app/(protected)/components/expense-dashboard')
    render(<ExpenseDashboard />)
    await waitFor(() => expect(screen.getByText('Food')).toBeInTheDocument())
    mockDrilldownFetch()
    fireEvent.click(screen.getByRole('button', { name: 'Food' }))
    await waitFor(() => {
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        expect.stringContaining('range=monthly')
      )
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        expect.stringContaining('drilldown=Food')
      )
    })
  })

  it('shows tag names in drilldown panel after fetch', async () => {
    const { ExpenseDashboard } = await import('@/app/(protected)/components/expense-dashboard')
    render(<ExpenseDashboard />)
    await waitFor(() => expect(screen.getByText('Food')).toBeInTheDocument())
    mockDrilldownFetch()
    fireEvent.click(screen.getByRole('button', { name: 'Food' }))
    await waitFor(() => {
      expect(screen.getByText('Dining Out')).toBeInTheDocument()
      expect(screen.getByText('(untagged)')).toBeInTheDocument()
    })
  })

  it('shows loading skeleton while drilldown fetch is in progress', async () => {
    const { ExpenseDashboard } = await import('@/app/(protected)/components/expense-dashboard')
    render(<ExpenseDashboard />)
    await waitFor(() => expect(screen.getByText('Food')).toBeInTheDocument())
    // mock a fetch that never resolves
    vi.mocked(fetch).mockReturnValueOnce(new Promise(() => {}) as Promise<Response>)
    fireEvent.click(screen.getByRole('button', { name: 'Food' }))
    expect(screen.getByTestId('drilldown-loading')).toBeInTheDocument()
  })

  it('back button restores category overview', async () => {
    const { ExpenseDashboard } = await import('@/app/(protected)/components/expense-dashboard')
    render(<ExpenseDashboard />)
    await waitFor(() => expect(screen.getByText('Food')).toBeInTheDocument())
    mockDrilldownFetch()
    fireEvent.click(screen.getByRole('button', { name: 'Food' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Food' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument()
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/components/expense-dashboard.test.tsx
```

Expected: the 6 new drilldown tests FAIL, the existing 9 tests PASS

---

## Task 5: Implement drilldown UI in ExpenseDashboard

**Files:**
- Modify: `app/(protected)/components/expense-dashboard.tsx`

- [ ] **Step 1: Replace the full file with the updated implementation**

Replace `app/(protected)/components/expense-dashboard.tsx` entirely with:

```tsx
'use client'

import { useState, useEffect, useCallback } from 'react'

type Range = 'daily' | '7day' | 'monthly' | 'custom'

interface CategoryEntry {
  category_name: string
  total: number
  pct: number
}

interface DashboardData {
  total_spend: number
  total_income: number
  daily_average: number
  category_breakdown: CategoryEntry[]
  days_in_range: number
  budget_remaining: number | null
  range: string
  start_date: string
  end_date: string
}

interface TagEntry {
  tag_name: string
  total: number
  pct: number
}

interface DrilldownData {
  category_name: string
  total: number
  tag_breakdown: TagEntry[]
}

const RANGES: { id: Range; label: string }[] = [
  { id: 'daily', label: 'Daily' },
  { id: '7day', label: '7-day' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'custom', label: 'Custom' },
]

function fmt(n: number) {
  return n.toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const card: React.CSSProperties = {
  background: '#1c2128',
  border: '1px solid #30363d',
  borderRadius: '10px',
  padding: '1rem',
}

const labelStyle: React.CSSProperties = {
  color: '#8b949e',
  fontSize: '11px',
  fontWeight: 600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  marginBottom: '4px',
}

const valueStyle: React.CSSProperties = {
  color: '#e6edf3',
  fontSize: '22px',
  fontWeight: 700,
  letterSpacing: '-0.5px',
}

export function ExpenseDashboard() {
  const [range, setRange] = useState<Range>('monthly')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [drilldown, setDrilldown] = useState<string | null>(null)
  const [drilldownData, setDrilldownData] = useState<DrilldownData | null>(null)
  const [drilldownLoading, setDrilldownLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      let url = `/api/dashboard?range=${range}`
      if (range === 'custom' && customStart && customEnd) {
        url += `&start=${encodeURIComponent(customStart + 'T00:00:00+08:00')}&end=${encodeURIComponent(customEnd + 'T23:59:59+08:00')}`
      }
      const res = await fetch(url)
      if (!res.ok) throw new Error('Failed')
      setData(await res.json())
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [range, customStart, customEnd])

  const openDrilldown = useCallback(async (categoryName: string) => {
    setDrilldown(categoryName)
    setDrilldownLoading(true)
    setDrilldownData(null)
    try {
      let url = `/api/dashboard?range=${range}&drilldown=${encodeURIComponent(categoryName)}`
      if (range === 'custom' && customStart && customEnd) {
        url += `&start=${encodeURIComponent(customStart + 'T00:00:00+08:00')}&end=${encodeURIComponent(customEnd + 'T23:59:59+08:00')}`
      }
      const res = await fetch(url)
      if (!res.ok) throw new Error('Failed')
      setDrilldownData(await res.json())
    } catch {
      setDrilldown(null)
    } finally {
      setDrilldownLoading(false)
    }
  }, [range, customStart, customEnd])

  const closeDrilldown = useCallback(() => {
    setDrilldown(null)
    setDrilldownData(null)
  }, [])

  useEffect(() => {
    if (range === 'custom' && (!customStart || !customEnd)) return
    load()
  }, [load, range, customStart, customEnd])

  useEffect(() => {
    const handler = () => load()
    window.addEventListener('transaction-saved', handler)
    return () => window.removeEventListener('transaction-saved', handler)
  }, [load])

  return (
    <section style={{ marginBottom: '2rem' }}>
      <div
        style={{
          background: '#161b22',
          border: '1px solid #30363d',
          borderRadius: '12px',
          padding: '1.25rem 1.5rem',
        }}
      >
        {/* Header + range selector */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '8px' }}>
          <h2 style={{ color: '#8b949e', fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', margin: 0 }}>
            Expense Dashboard
          </h2>
          <div style={{ display: 'flex', gap: '4px' }}>
            {RANGES.map((r) => (
              <button
                key={r.id}
                role="button"
                aria-pressed={range === r.id ? 'true' : 'false'}
                onClick={() => { setRange(r.id); setDrilldown(null); setDrilldownData(null) }}
                style={{
                  padding: '4px 10px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  border: range === r.id ? '1px solid #f0b429' : '1px solid #30363d',
                  background: range === r.id ? 'rgba(240,180,41,0.12)' : 'transparent',
                  color: range === r.id ? '#f0b429' : '#8b949e',
                }}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* Custom date pickers */}
        {range === 'custom' && (
          <div style={{ display: 'flex', gap: '8px', marginBottom: '1rem' }}>
            <div style={{ flex: 1 }}>
              <label htmlFor="dash-start" style={{ ...labelStyle, display: 'block', marginBottom: '4px' }}>Start date</label>
              <input
                id="dash-start"
                aria-label="Start date"
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                style={{
                  background: '#0d1117', border: '1px solid #30363d', borderRadius: '6px',
                  color: '#e6edf3', padding: '6px 10px', fontSize: '13px', width: '100%',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label htmlFor="dash-end" style={{ ...labelStyle, display: 'block', marginBottom: '4px' }}>End date</label>
              <input
                id="dash-end"
                aria-label="End date"
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                style={{
                  background: '#0d1117', border: '1px solid #30363d', borderRadius: '6px',
                  color: '#e6edf3', padding: '6px 10px', fontSize: '13px', width: '100%',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>
        )}

        {error && (
          <p style={{ color: '#f85149', fontSize: '13px', textAlign: 'center', padding: '1rem 0' }}>
            Failed to load dashboard data — please refresh
          </p>
        )}

        {!error && (
          <>
            {/* Widgets row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', marginBottom: '1rem' }}>
              <div style={card}>
                <div style={labelStyle}>Total Spend</div>
                <div style={{ ...valueStyle, color: loading ? '#484f58' : '#f85149' }}>
                  {loading ? '…' : fmt(data?.total_spend ?? 0)}
                </div>
                <div style={{ color: '#484f58', fontSize: '11px', marginTop: '2px' }}>SGD</div>
              </div>

              <div style={card}>
                <div style={labelStyle}>Income</div>
                <div style={{ ...valueStyle, color: loading ? '#484f58' : '#3fb884' }}>
                  {loading ? '…' : fmt(data?.total_income ?? 0)}
                </div>
                <div style={{ color: '#484f58', fontSize: '11px', marginTop: '2px' }}>SGD</div>
              </div>

              <div style={card}>
                <div style={labelStyle}>Daily Avg</div>
                <div style={{ ...valueStyle, color: loading ? '#484f58' : '#e6edf3' }}>
                  {loading ? '…' : fmt(data?.daily_average ?? 0)}
                </div>
                <div style={{ color: '#484f58', fontSize: '11px', marginTop: '2px' }}>SGD / day</div>
              </div>

              <div style={card}>
                <div style={labelStyle}>Budget</div>
                <div style={{ ...valueStyle, color: '#484f58', fontSize: '18px' }}>
                  {loading ? '…' : (data?.budget_remaining != null ? fmt(data.budget_remaining) : '—')}
                </div>
                <div style={{ color: '#484f58', fontSize: '11px', marginTop: '2px' }}>not configured</div>
              </div>
            </div>

            {/* Category breakdown — hidden when drilldown is active */}
            {!drilldown && !loading && data && data.category_breakdown.length > 0 && (
              <div>
                <div style={{ ...labelStyle, marginBottom: '8px' }}>Category Breakdown</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {data.category_breakdown.slice(0, 6).map((cat) => (
                    <div
                      key={cat.category_name}
                      role="button"
                      tabIndex={0}
                      aria-label={cat.category_name}
                      onClick={() => openDrilldown(cat.category_name)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') openDrilldown(cat.category_name) }}
                      style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', borderRadius: '6px', padding: '3px 4px', margin: '-3px -4px' }}
                    >
                      <span style={{ color: '#e6edf3', fontSize: '13px', minWidth: '100px' }}>{cat.category_name}</span>
                      <div style={{ flex: 1, background: '#21262d', borderRadius: '4px', height: '6px', overflow: 'hidden' }}>
                        <div style={{ width: `${Math.min(100, cat.pct)}%`, height: '100%', background: '#f0b429', borderRadius: '4px' }} />
                      </div>
                      <span style={{ color: '#8b949e', fontSize: '12px', minWidth: '48px', textAlign: 'right' }}>
                        {fmt(cat.total)}
                      </span>
                      <span style={{ color: '#484f58', fontSize: '11px', minWidth: '38px', textAlign: 'right' }}>
                        {cat.pct.toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Drilldown panel */}
            {drilldown && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <button
                    role="button"
                    aria-label="Back"
                    onClick={closeDrilldown}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#8b949e', fontSize: '13px', padding: '2px 0', display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    ← Back
                  </button>
                  <span style={{ color: '#e6edf3', fontSize: '13px', fontWeight: 600 }}>
                    {drilldown}{drilldownData ? ` · ${fmt(drilldownData.total)}` : ''}
                  </span>
                </div>

                {drilldownLoading && (
                  <div data-testid="drilldown-loading" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {[60, 40, 30].map((w) => (
                      <div key={w} style={{ display: 'flex', alignItems: 'center', gap: '10px', opacity: 0.5 }}>
                        <div style={{ minWidth: '100px', height: '12px', background: '#21262d', borderRadius: '4px' }} />
                        <div style={{ flex: 1, background: '#21262d', borderRadius: '4px', height: '6px' }}>
                          <div style={{ width: `${w}%`, height: '100%', background: '#30363d', borderRadius: '4px' }} />
                        </div>
                        <div style={{ width: '48px', height: '12px', background: '#21262d', borderRadius: '4px' }} />
                      </div>
                    ))}
                  </div>
                )}

                {!drilldownLoading && drilldownData && drilldownData.tag_breakdown.length === 0 && (
                  <p style={{ color: '#8b949e', fontSize: '13px', textAlign: 'center', padding: '0.5rem 0' }}>No tags found</p>
                )}

                {!drilldownLoading && drilldownData && drilldownData.tag_breakdown.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {drilldownData.tag_breakdown.map((tag) => (
                      <div key={tag.tag_name} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ color: '#e6edf3', fontSize: '13px', minWidth: '100px' }}>{tag.tag_name}</span>
                        <div style={{ flex: 1, background: '#21262d', borderRadius: '4px', height: '6px', overflow: 'hidden' }}>
                          <div style={{ width: `${Math.min(100, tag.pct)}%`, height: '100%', background: '#79c0ff', borderRadius: '4px' }} />
                        </div>
                        <span style={{ color: '#8b949e', fontSize: '12px', minWidth: '48px', textAlign: 'right' }}>
                          {fmt(tag.total)}
                        </span>
                        <span style={{ color: '#484f58', fontSize: '11px', minWidth: '38px', textAlign: 'right' }}>
                          {tag.pct.toFixed(1)}%
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Run all tests**

```bash
npx vitest run
```

Expected: all tests PASS (no failures)

- [ ] **Step 3: Commit**

```bash
git add app/(protected)/components/expense-dashboard.tsx tests/components/expense-dashboard.test.tsx
git commit -m "feat: add interactive drill-down to expense dashboard category bars"
```

---

## Task 6: Open PR to main

- [ ] **Step 1: Push branch**

```bash
git push -u origin claude/wonderful-wescoff-e6e4ae
```

- [ ] **Step 2: Create pull request**

```bash
gh pr create --title "feat: expense dashboard category drill-down" --body "$(cat <<'EOF'
## Summary
- Adds `?drilldown=<category>` param to `GET /api/dashboard` — returns tag-level breakdown for a category (transfers excluded)
- Category breakdown rows in `ExpenseDashboard` are now clickable buttons that open a tag breakdown panel
- Back button returns to the category overview; loading skeleton shown during fetch; mobile-responsive

## Test plan
- [ ] Run `npx vitest run` — all tests pass
- [ ] Click a category row in the dashboard — tag breakdown panel appears with blue bars
- [ ] Back button returns to the category overview
- [ ] Loading skeleton visible on slow connections (throttle in DevTools)
- [ ] Switching range selector while in drilldown exits drilldown and re-fetches overview

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review Notes

- **Spec coverage:** All 6 spec requirements covered — API drilldown param ✓, tag breakdown with untagged ✓, transfers excluded ✓, back button ✓, loading state ✓, mobile responsive (inherits flex layout) ✓
- **Placeholder scan:** No TBDs or TODOs
- **Type consistency:** `DrilldownData.tag_breakdown` → `TagEntry[]` used consistently; `openDrilldown(categoryName: string)` matches all call sites; `data-testid="drilldown-loading"` matches test query
- **seedTransactionTag** defined in Task 1 before used in Task 2
