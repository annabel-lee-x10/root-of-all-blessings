# Category Accordion Drill-Down Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static category breakdown bars in the expense dashboard with an inline accordion — clicking a category expands a tag sub-breakdown below it with zero-latency (data preloaded).

**Architecture:** Two extra SQL queries (tagged + untagged per category) run in the same `Promise.all` as existing dashboard queries; results are merged into `category_breakdown[].tag_breakdown`. The React component gains `expandedCategory: string | null` state; each category bar becomes a `<button aria-expanded>` that toggles a CSS `max-height` accordion panel.

**Tech Stack:** Next.js App Router, React (inline styles only), SQLite/Turso (`db.execute`), Vitest + `@testing-library/react`.

---

### Task 1: Add `seedTransactionTag` to test helpers

**Files:**
- Modify: `tests/helpers.ts`

- [ ] **Step 1: Add export after `seedTag`**

In `tests/helpers.ts`, after the `seedTag` function, add:

```typescript
export function seedTransactionTag(transactionId: string, tagId: string) {
  testDb.prepare('INSERT INTO transaction_tags (transaction_id, tag_id) VALUES (?, ?)').run(transactionId, tagId)
}
```

- [ ] **Step 2: Verify no regressions**

```bash
npx vitest run tests/api/dashboard.test.ts
```
Expected: all pass

- [ ] **Step 3: Commit**

```bash
git add tests/helpers.ts
git commit -m "test: add seedTransactionTag helper"
```

---

### Task 2: Add `tag_breakdown` to dashboard API

**Files:**
- Modify: `app/api/dashboard/route.ts`
- Modify: `tests/api/dashboard.test.ts`

The GET handler adds two queries to the `Promise.all`:
1. **Tagged query** — `(category_name, tag_name, total)` for transactions that have tags (INNER JOIN on `transaction_tags`/`tags`)
2. **Untagged query** — `(category_name, 'Untagged', total)` for transactions with no tags (`NOT EXISTS`)

Post-process: build `Map<category_name, TagBreakdownEntry[]>`, sort each array by `total DESC`, attach to each `categoryBreakdown` entry.

- [ ] **Step 1: Write failing tests**

In `tests/api/dashboard.test.ts`:

Update the import line:
```typescript
import { initTestDb, clearTestDb, resetTestDb, req, seedAccount, seedCategory, seedTransaction, seedTag, seedTransactionTag } from '../helpers'
```

Add after the last `it(...)`:
```typescript
it('category_breakdown entries include tag_breakdown array', async () => {
  seedTag('tag1', 'Lunch')
  seedTag('tag2', 'Work')
  seedTransaction('tx1', 'acc1', { type: 'expense', amount: 40, categoryId: 'cat1', datetime: '2026-04-19T10:00:00+08:00' })
  seedTransaction('tx2', 'acc1', { type: 'expense', amount: 60, categoryId: 'cat1', datetime: '2026-04-19T11:00:00+08:00' })
  seedTransactionTag('tx1', 'tag1')
  seedTransactionTag('tx2', 'tag2')
  const { GET } = await import('@/app/api/dashboard/route')
  const res = await GET(req('/api/dashboard?range=custom&start=2026-04-19T00:00:00%2B08:00&end=2026-04-19T23:59:59%2B08:00'))
  const data = await res.json()
  expect(data.category_breakdown[0].tag_breakdown).toBeDefined()
  expect(Array.isArray(data.category_breakdown[0].tag_breakdown)).toBe(true)
  expect(data.category_breakdown[0].tag_breakdown).toHaveLength(2)
  const tagNames = data.category_breakdown[0].tag_breakdown.map((t: { tag_name: string }) => t.tag_name)
  expect(tagNames).toContain('Lunch')
  expect(tagNames).toContain('Work')
})

it('tag_breakdown includes Untagged entry for transactions with no tags', async () => {
  seedTransaction('tx1', 'acc1', { type: 'expense', amount: 50, categoryId: 'cat1', datetime: '2026-04-19T10:00:00+08:00' })
  const { GET } = await import('@/app/api/dashboard/route')
  const res = await GET(req('/api/dashboard?range=custom&start=2026-04-19T00:00:00%2B08:00&end=2026-04-19T23:59:59%2B08:00'))
  const data = await res.json()
  expect(data.category_breakdown[0].tag_breakdown).toHaveLength(1)
  expect(data.category_breakdown[0].tag_breakdown[0].tag_name).toBe('Untagged')
  expect(data.category_breakdown[0].tag_breakdown[0].total).toBeCloseTo(50)
})

it('existing category_breakdown test still has tag_breakdown field', async () => {
  seedTransaction('tx1', 'acc1', { type: 'expense', amount: 40, categoryId: 'cat1', datetime: '2026-04-19T10:00:00+08:00' })
  seedTransaction('tx2', 'acc1', { type: 'expense', amount: 60, categoryId: 'cat1', datetime: '2026-04-19T11:00:00+08:00' })
  const { GET } = await import('@/app/api/dashboard/route')
  const res = await GET(req('/api/dashboard?range=custom&start=2026-04-19T00:00:00%2B08:00&end=2026-04-19T23:59:59%2B08:00'))
  const data = await res.json()
  expect(data.category_breakdown[0].tag_breakdown).toEqual([{ tag_name: 'Untagged', total: 100 }])
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/api/dashboard.test.ts
```
Expected: new tests FAIL with `data.category_breakdown[0].tag_breakdown is undefined`

- [ ] **Step 3: Implement tag_breakdown in route.ts**

Replace `app/api/dashboard/route.ts` entirely with:

```typescript
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'

const VALID_RANGES = ['daily', '7day', 'monthly', 'custom'] as const
type Range = (typeof VALID_RANGES)[number]

function getRangeDates(range: Range, start?: string | null, end?: string | null): [string, string, number] {
  const sgt = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Singapore' }))
  const pad = (n: number) => String(n).padStart(2, '0')
  const todayDate = `${sgt.getFullYear()}-${pad(sgt.getMonth() + 1)}-${pad(sgt.getDate())}`

  if (range === 'daily') {
    return [`${todayDate}T00:00:00+08:00`, `${todayDate}T23:59:59+08:00`, 1]
  }
  if (range === '7day') {
    const d = new Date(sgt)
    d.setDate(d.getDate() - 6)
    const s = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    return [`${s}T00:00:00+08:00`, `${todayDate}T23:59:59+08:00`, 7]
  }
  if (range === 'monthly') {
    const s = `${sgt.getFullYear()}-${pad(sgt.getMonth() + 1)}-01`
    const days = sgt.getDate()
    return [`${s}T00:00:00+08:00`, `${todayDate}T23:59:59+08:00`, days]
  }
  // custom
  const s = start ?? `${todayDate}T00:00:00+08:00`
  const e = end ?? `${todayDate}T23:59:59+08:00`
  const startDay = s.split('T')[0]
  const endDay = e.split('T')[0]
  const startMs = new Date(startDay + 'T00:00:00Z').getTime()
  const endMs = new Date(endDay + 'T00:00:00Z').getTime()
  const days = Math.max(1, Math.round((endMs - startMs) / 86400000) + 1)
  return [s, e, days]
}

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

  const [expenseResult, incomeResult, catResult, taggedResult, untaggedResult] = await Promise.all([
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
    db.execute({
      sql: `SELECT c.name as category_name, tg.name as tag_name,
                   COALESCE(SUM(CASE WHEN tx.currency = 'SGD' THEN tx.amount ELSE COALESCE(tx.sgd_equivalent, tx.amount) END), 0) as total
            FROM transactions tx
            LEFT JOIN categories c ON tx.category_id = c.id
            JOIN transaction_tags tt ON tx.id = tt.transaction_id
            JOIN tags tg ON tt.tag_id = tg.id
            WHERE tx.type = 'expense' AND tx.datetime >= ? AND tx.datetime <= ?
            GROUP BY tx.category_id, c.name, tg.id, tg.name
            ORDER BY total DESC`,
      args: [startDate, endDate],
    }),
    db.execute({
      sql: `SELECT c.name as category_name, 'Untagged' as tag_name,
                   COALESCE(SUM(CASE WHEN tx.currency = 'SGD' THEN tx.amount ELSE COALESCE(tx.sgd_equivalent, tx.amount) END), 0) as total
            FROM transactions tx
            LEFT JOIN categories c ON tx.category_id = c.id
            WHERE tx.type = 'expense' AND tx.datetime >= ? AND tx.datetime <= ?
              AND NOT EXISTS (SELECT 1 FROM transaction_tags tt WHERE tt.transaction_id = tx.id)
            GROUP BY tx.category_id, c.name
            HAVING total > 0`,
      args: [startDate, endDate],
    }),
  ])

  const totalSpend = Number(expenseResult.rows[0].total)
  const totalIncome = Number(incomeResult.rows[0].total)

  const tagMap = new Map<string, { tag_name: string; total: number }[]>()
  for (const r of [...taggedResult.rows, ...untaggedResult.rows]) {
    const catName = (r.category_name as string | null) ?? 'Uncategorised'
    const arr = tagMap.get(catName) ?? []
    arr.push({ tag_name: r.tag_name as string, total: Number(r.total) })
    tagMap.set(catName, arr)
  }
  for (const arr of tagMap.values()) {
    arr.sort((a, b) => b.total - a.total)
  }

  const categoryBreakdown = catResult.rows.map((r) => {
    const catName = (r.category_name as string | null) ?? 'Uncategorised'
    return {
      category_name: catName,
      total: Number(r.total),
      pct: totalSpend > 0 ? Math.round((Number(r.total) / totalSpend) * 1000) / 10 : 0,
      tag_breakdown: tagMap.get(catName) ?? [],
    }
  })

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

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/api/dashboard.test.ts
```
Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add app/api/dashboard/route.ts tests/api/dashboard.test.ts
git commit -m "feat: add preloaded tag_breakdown to dashboard API category entries"
```

---

### Task 3: Accordion UI in expense-dashboard.tsx

**Files:**
- Modify: `app/(protected)/components/expense-dashboard.tsx`
- Modify: `tests/components/expense-dashboard.test.tsx`

Changes:
- Add `TagBreakdownEntry` interface; add `tag_breakdown` to `CategoryEntry`
- Add `expandedCategory: string | null` state
- Convert category bar rows to `<button role="button" aria-expanded>` with toggle handler
- Render accordion panel with `max-height` CSS transition below each bar
- Sub-bars: indented, blue `#388bfd` progress fill vs gold `#f0b429` for categories

- [ ] **Step 1: Write failing tests**

In `tests/components/expense-dashboard.test.tsx`:

Replace the `mockDashboardData` constant with:
```typescript
const mockDashboardData = {
  total_spend: 1234.56,
  total_income: 5000,
  daily_average: 88.18,
  category_breakdown: [
    {
      category_name: 'Food',
      total: 800,
      pct: 64.8,
      tag_breakdown: [
        { tag_name: 'Lunch', total: 500 },
        { tag_name: 'Dinner', total: 300 },
      ],
    },
    {
      category_name: 'Transport',
      total: 434.56,
      pct: 35.2,
      tag_breakdown: [
        { tag_name: 'Untagged', total: 434.56 },
      ],
    },
  ],
  days_in_range: 14,
  budget_remaining: null,
  range: 'monthly',
  start_date: '2026-04-01T00:00:00+08:00',
  end_date: '2026-04-19T23:59:59+08:00',
}
```

Add these tests at the end of the `describe` block:
```typescript
it('category bar has aria-expanded=false by default', async () => {
  const { ExpenseDashboard } = await import('@/app/(protected)/components/expense-dashboard')
  render(<ExpenseDashboard />)
  await waitFor(() => expect(screen.getByText('Food')).toBeInTheDocument())
  const foodBtn = screen.getByRole('button', { name: /food/i })
  expect(foodBtn).toHaveAttribute('aria-expanded', 'false')
})

it('clicking a category bar expands its tag breakdown', async () => {
  const { ExpenseDashboard } = await import('@/app/(protected)/components/expense-dashboard')
  render(<ExpenseDashboard />)
  await waitFor(() => expect(screen.getByText('Food')).toBeInTheDocument())
  fireEvent.click(screen.getByRole('button', { name: /food/i }))
  expect(screen.getByRole('button', { name: /food/i })).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getByText('Lunch')).toBeInTheDocument()
  expect(screen.getByText('Dinner')).toBeInTheDocument()
})

it('clicking expanded category bar collapses it', async () => {
  const { ExpenseDashboard } = await import('@/app/(protected)/components/expense-dashboard')
  render(<ExpenseDashboard />)
  await waitFor(() => expect(screen.getByText('Food')).toBeInTheDocument())
  const foodBtn = screen.getByRole('button', { name: /food/i })
  fireEvent.click(foodBtn)
  fireEvent.click(foodBtn)
  expect(foodBtn).toHaveAttribute('aria-expanded', 'false')
})

it('clicking a different category collapses the previous one', async () => {
  const { ExpenseDashboard } = await import('@/app/(protected)/components/expense-dashboard')
  render(<ExpenseDashboard />)
  await waitFor(() => expect(screen.getByText('Food')).toBeInTheDocument())
  fireEvent.click(screen.getByRole('button', { name: /food/i }))
  expect(screen.getByRole('button', { name: /food/i })).toHaveAttribute('aria-expanded', 'true')
  fireEvent.click(screen.getByRole('button', { name: /transport/i }))
  expect(screen.getByRole('button', { name: /food/i })).toHaveAttribute('aria-expanded', 'false')
  expect(screen.getByRole('button', { name: /transport/i })).toHaveAttribute('aria-expanded', 'true')
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/components/expense-dashboard.test.tsx
```
Expected: new tests FAIL

- [ ] **Step 3: Implement accordion in expense-dashboard.tsx**

Replace `app/(protected)/components/expense-dashboard.tsx` entirely with:

```typescript
'use client'

import { useState, useEffect, useCallback } from 'react'

type Range = 'daily' | '7day' | 'monthly' | 'custom'

interface TagBreakdownEntry {
  tag_name: string
  total: number
}

interface CategoryEntry {
  category_name: string
  total: number
  pct: number
  tag_breakdown: TagBreakdownEntry[]
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
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null)

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

  useEffect(() => {
    if (range === 'custom' && (!customStart || !customEnd)) return
    load()
  }, [load, range, customStart, customEnd])

  useEffect(() => {
    const handler = () => load()
    window.addEventListener('transaction-saved', handler)
    return () => window.removeEventListener('transaction-saved', handler)
  }, [load])

  function toggleCategory(name: string) {
    setExpandedCategory((prev) => (prev === name ? null : name))
  }

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

            {/* Category breakdown */}
            {!loading && data && data.category_breakdown.length > 0 && (
              <div>
                <div style={{ ...labelStyle, marginBottom: '8px' }}>Category Breakdown</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  {data.category_breakdown.slice(0, 6).map((cat) => {
                    const isExpanded = expandedCategory === cat.category_name
                    return (
                      <div key={cat.category_name}>
                        <button
                          role="button"
                          aria-expanded={isExpanded}
                          onClick={() => toggleCategory(cat.category_name)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            width: '100%',
                            background: 'transparent',
                            border: 'none',
                            padding: '4px 0',
                            cursor: 'pointer',
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
                          <span style={{ color: '#484f58', fontSize: '10px', minWidth: '10px', display: 'inline-block', transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                            ▾
                          </span>
                        </button>

                        {/* Accordion panel */}
                        <div
                          style={{
                            overflow: 'hidden',
                            maxHeight: isExpanded ? `${cat.tag_breakdown.length * 28 + 12}px` : '0px',
                            transition: 'max-height 0.25s ease-in-out',
                            marginLeft: '110px',
                          }}
                        >
                          <div style={{ paddingBottom: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {cat.tag_breakdown.map((tag) => (
                              <div key={tag.tag_name} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <span style={{ color: '#6e7681', fontSize: '12px', minWidth: '90px' }}>{tag.tag_name}</span>
                                <div style={{ flex: 1, background: '#161b22', borderRadius: '3px', height: '4px', overflow: 'hidden' }}>
                                  <div style={{
                                    width: `${cat.total > 0 ? Math.min(100, (tag.total / cat.total) * 100) : 0}%`,
                                    height: '100%',
                                    background: '#388bfd',
                                    borderRadius: '3px',
                                  }} />
                                </div>
                                <span style={{ color: '#6e7681', fontSize: '11px', minWidth: '48px', textAlign: 'right' }}>
                                  {fmt(tag.total)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Run component tests**

```bash
npx vitest run tests/components/expense-dashboard.test.tsx
```
Expected: all pass

- [ ] **Step 5: Run all tests**

```bash
npx vitest run
```
Expected: all pass

- [ ] **Step 6: Commit**

```bash
git add app/(protected)/components/expense-dashboard.tsx tests/components/expense-dashboard.test.tsx
git commit -m "feat: inline accordion category drill-down with preloaded tag breakdown"
```

---

### Task 4: Push and create PR

- [ ] **Step 1: Push branch**

```bash
git push -u origin claude/dazzling-allen-d55fa2
```

- [ ] **Step 2: Create PR**

```bash
gh pr create --title "feat: inline accordion category drill-down" --body "$(cat <<'EOF'
## Summary
- Dashboard API now returns \`tag_breakdown\` per category (tagged + untagged, preloaded in same request)
- Category bars are clickable accordions — expands tag sub-breakdown below with CSS \`max-height\` transition
- Only one category open at a time; click same bar to collapse; click different bar to switch
- Sub-bars indented, blue (#388bfd) vs gold (#f0b429) for visual hierarchy
- Zero extra API calls on click — all data present at load time

## Test plan
- [ ] \`npx vitest run\` — all tests pass
- [ ] Manual: load dashboard, click a category bar → tag sub-rows slide in below
- [ ] Manual: click same bar again → collapses
- [ ] Manual: click a different bar → previous collapses, new one expands
- [ ] Manual: mobile viewport — no horizontal overflow, bars stack correctly

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)" --base main
```
