# Drill-Down Category Chart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Expense Dashboard category bars clickable to drill down into tag breakdown for each category.

**Architecture:** Add `category_id` to the dashboard API response; create a new `GET /api/dashboard/category-tags` endpoint that returns tag totals (plus an "Untagged" bucket) for a given category + date range; upgrade the category bar rows in `ExpenseDashboard` from `<div>` to `<button>` and manage a `drilldown` state that swaps the chart between category view and tag view.

**Tech Stack:** Next.js 16.2.4 App Router, React 19, TypeScript strict, Turso/libSQL (better-sqlite3 in tests), Vitest + @testing-library/react

---

### Task 1: Add `seedTransactionTag` to test helpers

**Files:**
- Modify: `tests/helpers.ts`

- [ ] **Step 1: Add the helper function**

In `tests/helpers.ts`, after the `seedTransaction` function at the bottom of the file, add:

```typescript
export function seedTransactionTag(transactionId: string, tagId: string) {
  testDb
    .prepare('INSERT OR IGNORE INTO transaction_tags (transaction_id, tag_id) VALUES (?, ?)')
    .run(transactionId, tagId)
}
```

- [ ] **Step 2: Commit**

```bash
git add tests/helpers.ts
git commit -m "test: add seedTransactionTag helper"
```

---

### Task 2: Extend dashboard API to expose `category_id`

**Files:**
- Modify: `app/api/dashboard/route.ts`
- Modify: `tests/api/dashboard.test.ts`

- [ ] **Step 1: Write failing test**

In `tests/api/dashboard.test.ts`, add this test inside the existing `describe('GET /api/dashboard')` block, after the last `it(...)`:

```typescript
  it('category_breakdown includes category_id', async () => {
    seedTransaction('tx1', 'acc1', { type: 'expense', amount: 40, categoryId: 'cat1', datetime: '2026-04-19T10:00:00+08:00' })
    const { GET } = await import('@/app/api/dashboard/route')
    const res = await GET(req('/api/dashboard?range=custom&start=2026-04-19T00:00:00%2B08:00&end=2026-04-19T23:59:59%2B08:00'))
    const data = await res.json()
    expect(data.category_breakdown[0].category_id).toBe('cat1')
  })
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx vitest run tests/api/dashboard.test.ts
```

Expected: all existing tests PASS, new test FAILS with `expected undefined to be 'cat1'`

- [ ] **Step 3: Update the SQL query in `app/api/dashboard/route.ts`**

Replace the `catResult` query (third entry in `Promise.all`) from:

```typescript
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
```

to:

```typescript
    db.execute({
      sql: `SELECT t.category_id,
                   c.name as category_name,
                   COALESCE(SUM(CASE WHEN t.currency = 'SGD' THEN t.amount ELSE COALESCE(t.sgd_equivalent, t.amount) END), 0) as total
            FROM transactions t
            LEFT JOIN categories c ON t.category_id = c.id
            WHERE t.type = 'expense' AND t.datetime >= ? AND t.datetime <= ?
            GROUP BY t.category_id, c.name
            ORDER BY total DESC`,
      args: [startDate, endDate],
    }),
```

And update the `categoryBreakdown` mapping from:

```typescript
  const categoryBreakdown = catResult.rows.map((r) => ({
    category_name: (r.category_name as string | null) ?? 'Uncategorised',
    total: Number(r.total),
    pct: totalSpend > 0 ? Math.round((Number(r.total) / totalSpend) * 1000) / 10 : 0,
  }))
```

to:

```typescript
  const categoryBreakdown = catResult.rows.map((r) => ({
    category_id: (r.category_id as string | null) ?? null,
    category_name: (r.category_name as string | null) ?? 'Uncategorised',
    total: Number(r.total),
    pct: totalSpend > 0 ? Math.round((Number(r.total) / totalSpend) * 1000) / 10 : 0,
  }))
```

- [ ] **Step 4: Run tests to confirm all pass**

```bash
npx vitest run tests/api/dashboard.test.ts
```

Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/dashboard/route.ts tests/api/dashboard.test.ts
git commit -m "feat: expose category_id in dashboard category_breakdown"
```

---

### Task 3: Implement `GET /api/dashboard/category-tags`

**Files:**
- Create: `tests/api/dashboard-category-tags.test.ts`
- Create: `app/api/dashboard/category-tags/route.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/api/dashboard-category-tags.test.ts`:

```typescript
// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import {
  initTestDb, clearTestDb, resetTestDb, req,
  seedAccount, seedCategory, seedTag, seedTransaction, seedTransactionTag,
} from '../helpers'

beforeAll(() => initTestDb())
afterAll(() => clearTestDb())
beforeEach(() => {
  resetTestDb()
  seedAccount('acc1', 'DBS', 'bank')
  seedCategory('cat1', 'Food', 'expense')
  seedTag('tag1', 'Lunch')
  seedTag('tag2', 'Dinner')
})

describe('GET /api/dashboard/category-tags', () => {
  it('returns empty tag_breakdown when no transactions', async () => {
    const { GET } = await import('@/app/api/dashboard/category-tags/route')
    const res = await GET(req('/api/dashboard/category-tags?category_id=cat1&start=2026-04-19T00:00:00%2B08:00&end=2026-04-19T23:59:59%2B08:00'))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.tag_breakdown).toEqual([])
    expect(data.total).toBe(0)
  })

  it('returns 400 when start or end is missing', async () => {
    const { GET } = await import('@/app/api/dashboard/category-tags/route')
    const res = await GET(req('/api/dashboard/category-tags?category_id=cat1'))
    expect(res.status).toBe(400)
  })

  it('groups tagged transactions by tag name', async () => {
    seedTransaction('tx1', 'acc1', { type: 'expense', amount: 30, categoryId: 'cat1', datetime: '2026-04-19T10:00:00+08:00' })
    seedTransaction('tx2', 'acc1', { type: 'expense', amount: 50, categoryId: 'cat1', datetime: '2026-04-19T11:00:00+08:00' })
    seedTransactionTag('tx1', 'tag1')
    seedTransactionTag('tx2', 'tag1')
    const { GET } = await import('@/app/api/dashboard/category-tags/route')
    const res = await GET(req('/api/dashboard/category-tags?category_id=cat1&start=2026-04-19T00:00:00%2B08:00&end=2026-04-19T23:59:59%2B08:00'))
    const data = await res.json()
    expect(data.tag_breakdown).toHaveLength(1)
    expect(data.tag_breakdown[0].tag_name).toBe('Lunch')
    expect(data.tag_breakdown[0].total).toBeCloseTo(80)
    expect(data.tag_breakdown[0].pct).toBeCloseTo(100)
  })

  it('includes untagged transactions as "Untagged" bucket', async () => {
    seedTransaction('tx1', 'acc1', { type: 'expense', amount: 30, categoryId: 'cat1', datetime: '2026-04-19T10:00:00+08:00' })
    seedTransaction('tx2', 'acc1', { type: 'expense', amount: 20, categoryId: 'cat1', datetime: '2026-04-19T11:00:00+08:00' })
    seedTransactionTag('tx1', 'tag1')
    // tx2 has no tags
    const { GET } = await import('@/app/api/dashboard/category-tags/route')
    const res = await GET(req('/api/dashboard/category-tags?category_id=cat1&start=2026-04-19T00:00:00%2B08:00&end=2026-04-19T23:59:59%2B08:00'))
    const data = await res.json()
    const names = data.tag_breakdown.map((e: { tag_name: string }) => e.tag_name)
    expect(names).toContain('Lunch')
    expect(names).toContain('Untagged')
    const untagged = data.tag_breakdown.find((e: { tag_name: string }) => e.tag_name === 'Untagged')
    expect(untagged.total).toBeCloseTo(20)
  })

  it('excludes transactions outside date range', async () => {
    seedTransaction('tx1', 'acc1', { type: 'expense', amount: 100, categoryId: 'cat1', datetime: '2026-04-01T10:00:00+08:00' })
    seedTransactionTag('tx1', 'tag1')
    const { GET } = await import('@/app/api/dashboard/category-tags/route')
    const res = await GET(req('/api/dashboard/category-tags?category_id=cat1&start=2026-04-19T00:00:00%2B08:00&end=2026-04-19T23:59:59%2B08:00'))
    const data = await res.json()
    expect(data.total).toBe(0)
    expect(data.tag_breakdown).toEqual([])
  })

  it('excludes transactions from other categories', async () => {
    seedCategory('cat2', 'Transport', 'expense')
    seedTransaction('tx1', 'acc1', { type: 'expense', amount: 50, categoryId: 'cat2', datetime: '2026-04-19T10:00:00+08:00' })
    seedTransactionTag('tx1', 'tag1')
    const { GET } = await import('@/app/api/dashboard/category-tags/route')
    const res = await GET(req('/api/dashboard/category-tags?category_id=cat1&start=2026-04-19T00:00:00%2B08:00&end=2026-04-19T23:59:59%2B08:00'))
    const data = await res.json()
    expect(data.total).toBe(0)
    expect(data.tag_breakdown).toEqual([])
  })

  it('total equals sum of all expense transactions in the category', async () => {
    seedTransaction('tx1', 'acc1', { type: 'expense', amount: 30, categoryId: 'cat1', datetime: '2026-04-19T10:00:00+08:00' })
    seedTransaction('tx2', 'acc1', { type: 'expense', amount: 20, categoryId: 'cat1', datetime: '2026-04-19T11:00:00+08:00' })
    seedTransactionTag('tx1', 'tag1')
    // tx2 untagged — both still count toward total
    const { GET } = await import('@/app/api/dashboard/category-tags/route')
    const res = await GET(req('/api/dashboard/category-tags?category_id=cat1&start=2026-04-19T00:00:00%2B08:00&end=2026-04-19T23:59:59%2B08:00'))
    const data = await res.json()
    expect(data.total).toBeCloseTo(50)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run tests/api/dashboard-category-tags.test.ts
```

Expected: FAIL — `Cannot find module '@/app/api/dashboard/category-tags/route'`

- [ ] **Step 3: Create the route**

Create `app/api/dashboard/category-tags/route.ts`:

```typescript
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams
  const categoryId = p.get('category_id') || null
  const start = p.get('start')
  const end = p.get('end')

  if (!start || !end) {
    return Response.json({ error: 'start and end are required' }, { status: 400 })
  }

  const categoryFilter = categoryId ? 'category_id = ?' : 'category_id IS NULL'
  const baseArgs = categoryId ? [start, end, categoryId] : [start, end]

  const [totalResult, taggedResult, untaggedResult] = await Promise.all([
    db.execute({
      sql: `SELECT COALESCE(SUM(CASE WHEN currency = 'SGD' THEN amount ELSE COALESCE(sgd_equivalent, amount) END), 0) as total
            FROM transactions
            WHERE type = 'expense' AND datetime >= ? AND datetime <= ? AND ${categoryFilter}`,
      args: baseArgs,
    }),
    db.execute({
      sql: `SELECT tg.name as tag_name,
                   COALESCE(SUM(CASE WHEN t.currency = 'SGD' THEN t.amount ELSE COALESCE(t.sgd_equivalent, t.amount) END), 0) as total
            FROM transactions t
            JOIN transaction_tags tt ON t.id = tt.transaction_id
            JOIN tags tg ON tt.tag_id = tg.id
            WHERE t.type = 'expense' AND t.datetime >= ? AND t.datetime <= ? AND t.${categoryFilter}
            GROUP BY tg.id, tg.name
            ORDER BY total DESC`,
      args: baseArgs,
    }),
    db.execute({
      sql: `SELECT COALESCE(SUM(CASE WHEN t.currency = 'SGD' THEN t.amount ELSE COALESCE(t.sgd_equivalent, t.amount) END), 0) as total
            FROM transactions t
            WHERE t.type = 'expense' AND t.datetime >= ? AND t.datetime <= ? AND t.${categoryFilter}
              AND NOT EXISTS (SELECT 1 FROM transaction_tags tt WHERE tt.transaction_id = t.id)`,
      args: baseArgs,
    }),
  ])

  const categoryTotal = Number(totalResult.rows[0].total)
  const untaggedTotal = Number(untaggedResult.rows[0].total)

  const tagBreakdown = taggedResult.rows.map((r) => ({
    tag_name: r.tag_name as string,
    total: Number(r.total),
    pct: categoryTotal > 0 ? Math.round((Number(r.total) / categoryTotal) * 1000) / 10 : 0,
  }))

  if (untaggedTotal > 0) {
    tagBreakdown.push({
      tag_name: 'Untagged',
      total: untaggedTotal,
      pct: categoryTotal > 0 ? Math.round((untaggedTotal / categoryTotal) * 1000) / 10 : 0,
    })
  }

  return Response.json({
    tag_breakdown: tagBreakdown,
    total: categoryTotal,
    start_date: start,
    end_date: end,
  })
}
```

- [ ] **Step 4: Run tests to confirm all pass**

```bash
npx vitest run tests/api/dashboard-category-tags.test.ts
```

Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/dashboard/category-tags/route.ts tests/api/dashboard-category-tags.test.ts
git commit -m "feat: add GET /api/dashboard/category-tags endpoint"
```

---

### Task 4: Add drill-down to `ExpenseDashboard` component

**Files:**
- Modify: `tests/components/expense-dashboard.test.tsx`
- Modify: `app/(protected)/components/expense-dashboard.tsx`

- [ ] **Step 1: Update mock data and add drill-down tests**

In `tests/components/expense-dashboard.test.tsx`:

1. Update `mockDashboardData` to include `category_id` fields:

```typescript
const mockDashboardData = {
  total_spend: 1234.56,
  total_income: 5000,
  daily_average: 88.18,
  category_breakdown: [
    { category_id: 'cat-food', category_name: 'Food', total: 800, pct: 64.8 },
    { category_id: 'cat-transport', category_name: 'Transport', total: 434.56, pct: 35.2 },
  ],
  days_in_range: 14,
  budget_remaining: null,
  range: 'monthly',
  start_date: '2026-04-01T00:00:00+08:00',
  end_date: '2026-04-19T23:59:59+08:00',
}
```

2. Add `mockTagData` constant after `mockDashboardData`:

```typescript
const mockTagData = {
  tag_breakdown: [
    { tag_name: 'Lunch', total: 500, pct: 62.5 },
    { tag_name: 'Dinner', total: 300, pct: 37.5 },
  ],
  total: 800,
  start_date: '2026-04-01T00:00:00+08:00',
  end_date: '2026-04-19T23:59:59+08:00',
}
```

3. Replace `mockFetchSuccess` so it routes by URL:

```typescript
function mockFetchSuccess() {
  vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
    if (url.includes('category-tags')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockTagData) })
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve(mockDashboardData) })
  }))
}
```

4. Add these tests inside the existing `describe('ExpenseDashboard')` block, after the last `it(...)`:

```typescript
  it('category bars are rendered as buttons', async () => {
    const { ExpenseDashboard } = await import('@/app/(protected)/components/expense-dashboard')
    render(<ExpenseDashboard />)
    await waitFor(() => expect(screen.getByText('Food')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /Food/i })).toBeInTheDocument()
  })

  it('clicking a category bar fetches tag breakdown and shows tag names', async () => {
    const { ExpenseDashboard } = await import('@/app/(protected)/components/expense-dashboard')
    render(<ExpenseDashboard />)
    await waitFor(() => expect(screen.getByText('Food')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /Food/i }))
    await waitFor(() => {
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(expect.stringContaining('category-tags'))
    })
    await waitFor(() => {
      expect(screen.getByText('Lunch')).toBeInTheDocument()
      expect(screen.getByText('Dinner')).toBeInTheDocument()
    })
  })

  it('shows back button when in drill-down view', async () => {
    const { ExpenseDashboard } = await import('@/app/(protected)/components/expense-dashboard')
    render(<ExpenseDashboard />)
    await waitFor(() => expect(screen.getByText('Food')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /Food/i }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument()
    })
  })

  it('back button returns to category view', async () => {
    const { ExpenseDashboard } = await import('@/app/(protected)/components/expense-dashboard')
    render(<ExpenseDashboard />)
    await waitFor(() => expect(screen.getByText('Food')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /Food/i }))
    await waitFor(() => screen.getByRole('button', { name: /back/i }))
    fireEvent.click(screen.getByRole('button', { name: /back/i }))
    await waitFor(() => {
      expect(screen.getByText('Food')).toBeInTheDocument()
      expect(screen.getByText('Transport')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /back/i })).not.toBeInTheDocument()
    })
  })

  it('drill-down header shows selected category name', async () => {
    const { ExpenseDashboard } = await import('@/app/(protected)/components/expense-dashboard')
    render(<ExpenseDashboard />)
    await waitFor(() => expect(screen.getByText('Food')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /Food/i }))
    await waitFor(() => {
      expect(screen.getByText(/Food.*Tags/i)).toBeInTheDocument()
    })
  })

  it('calls category-tags with correct category_id', async () => {
    const { ExpenseDashboard } = await import('@/app/(protected)/components/expense-dashboard')
    render(<ExpenseDashboard />)
    await waitFor(() => expect(screen.getByText('Food')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /Food/i }))
    await waitFor(() => {
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        expect.stringMatching(/category-tags.*category_id=cat-food/)
      )
    })
  })
```

- [ ] **Step 2: Run tests to confirm new tests fail**

```bash
npx vitest run tests/components/expense-dashboard.test.tsx
```

Expected: existing tests PASS, new 6 tests FAIL (category bars not buttons, no drill-down behavior)

- [ ] **Step 3: Update `CategoryEntry` type and add new types/state to component**

Replace the full content of `app/(protected)/components/expense-dashboard.tsx` with:

```typescript
'use client'

import { useState, useEffect, useCallback } from 'react'

type Range = 'daily' | '7day' | 'monthly' | 'custom'

interface CategoryEntry {
  category_id: string | null
  category_name: string
  total: number
  pct: number
}

interface TagEntry {
  tag_name: string
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

interface TagData {
  tag_breakdown: TagEntry[]
  total: number
  start_date: string
  end_date: string
}

interface DrilldownState {
  categoryId: string | null
  categoryName: string
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

  const [drilldown, setDrilldown] = useState<DrilldownState | null>(null)
  const [tagData, setTagData] = useState<TagData | null>(null)
  const [tagLoading, setTagLoading] = useState(false)

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
      setDrilldown(null)
      setTagData(null)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [range, customStart, customEnd])

  useEffect(() => {
    if (range === 'custom' && (!customStart || !customEnd)) return
    load()
  }, [load, range, customStart, customEnd])

  useEffect(() => {
    const handler = () => load()
    window.addEventListener('transaction-saved', handler)
    return () => window.removeEventListener('transaction-saved', handler)
  }, [load])

  const handleCategoryClick = useCallback(async (cat: CategoryEntry) => {
    if (!data) return
    setDrilldown({ categoryId: cat.category_id, categoryName: cat.category_name })
    setTagLoading(true)
    setTagData(null)
    try {
      const params = new URLSearchParams({ start: data.start_date, end: data.end_date })
      if (cat.category_id) params.set('category_id', cat.category_id)
      const res = await fetch(`/api/dashboard/category-tags?${params}`)
      if (!res.ok) throw new Error('Failed')
      setTagData(await res.json())
    } catch {
      // tag fetch failed — user can press Back and retry
    } finally {
      setTagLoading(false)
    }
  }, [data])

  const handleBack = useCallback(() => {
    setDrilldown(null)
    setTagData(null)
  }, [])

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
                onClick={() => setRange(r.id)}
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

            {/* Category / tag breakdown */}
            {!loading && data && (
              drilldown ? (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                    <button
                      aria-label="Back to categories"
                      onClick={handleBack}
                      style={{
                        background: 'transparent',
                        border: '1px solid #30363d',
                        borderRadius: '6px',
                        color: '#8b949e',
                        cursor: 'pointer',
                        fontSize: '12px',
                        padding: '3px 8px',
                      }}
                    >
                      ← Back
                    </button>
                    <span style={{ ...labelStyle, marginBottom: 0 }}>{drilldown.categoryName} — Tags</span>
                  </div>
                  {tagLoading && (
                    <div style={{ color: '#484f58', fontSize: '13px', textAlign: 'center', padding: '0.5rem 0' }}>…</div>
                  )}
                  {!tagLoading && tagData && tagData.tag_breakdown.length === 0 && (
                    <div style={{ color: '#484f58', fontSize: '13px', textAlign: 'center', padding: '0.5rem 0' }}>No tags found</div>
                  )}
                  {!tagLoading && tagData && tagData.tag_breakdown.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {tagData.tag_breakdown.map((tag) => (
                        <div key={tag.tag_name} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ color: '#e6edf3', fontSize: '13px', minWidth: '100px' }}>{tag.tag_name}</span>
                          <div style={{ flex: 1, background: '#21262d', borderRadius: '4px', height: '6px', overflow: 'hidden' }}>
                            <div style={{ width: `${Math.min(100, tag.pct)}%`, height: '100%', background: '#58a6ff', borderRadius: '4px' }} />
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
              ) : (
                data.category_breakdown.length > 0 && (
                  <div>
                    <div style={{ ...labelStyle, marginBottom: '8px' }}>Category Breakdown</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {data.category_breakdown.slice(0, 6).map((cat) => (
                        <button
                          key={cat.category_name}
                          aria-label={`${cat.category_name} ${fmt(cat.total)}`}
                          onClick={() => handleCategoryClick(cat)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            background: 'transparent',
                            border: 'none',
                            padding: '2px 0',
                            cursor: 'pointer',
                            width: '100%',
                            textAlign: 'left',
                          }}
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
                        </button>
                      ))}
                    </div>
                    <div style={{ color: '#484f58', fontSize: '11px', marginTop: '6px' }}>
                      Tap a category to see tag breakdown
                    </div>
                  </div>
                )
              )
            )}
          </>
        )}
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Run all component tests**

```bash
npx vitest run tests/components/expense-dashboard.test.tsx
```

Expected: all PASS

- [ ] **Step 5: Run full test suite**

```bash
npx vitest run
```

Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add app/(protected)/components/expense-dashboard.tsx tests/components/expense-dashboard.test.tsx
git commit -m "feat: interactive drill-down category chart in expense dashboard"
```

---

### Task 5: Push and open PR

- [ ] **Step 1: Push branch**

```bash
git push -u origin claude/vigorous-nightingale-06b72e
```

- [ ] **Step 2: Create PR**

```bash
gh pr create --title "feat: interactive drill-down category chart" --body "$(cat <<'EOF'
## Summary
- Category bars in Expense Dashboard are now clickable buttons
- Clicking a category drills down to show tag breakdown for that category's transactions
- Transactions with no tags appear in an "Untagged" bucket
- Back button returns to top-level category view
- New `GET /api/dashboard/category-tags` endpoint handles tag aggregation per category + date range
- Transfers excluded from chart (type=expense filter in both endpoints)

## Test plan
- [ ] All existing dashboard tests pass
- [ ] New API tests cover: empty state, tag grouping, untagged bucket, date exclusion, category exclusion, total accuracy
- [ ] Component tests cover: category bars as buttons, drill-down on click, back button, tag data display, correct endpoint called
- [ ] Manual: click a category bar → tag breakdown appears; click Back → categories return
- [ ] Mobile: test on narrow viewport

🤖 Generated with [Claude Code](https://claude.ai/claude-code)
EOF
)"
```
