# Searchable Category/Subcategory Picker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two-step `CategoryPicker` (parent select → child select) with a unified searchable input + dropdown that surfaces `"Food > Grocery"` on typing `"gro"`, with recent/frequent category chips at the top.

**Architecture:** A new `/api/categories/frequent` endpoint computes the user's top-5 categories in the last 30 days. The `CategoryPicker` component is rewritten to accept a single `categoryId` + `onChange(categoryId, parentCategoryId)` interface; it self-fetches frequent IDs and builds a flat searchable options list. All four callers (WheresMyMoney, DraftsCard, TransactionsPage, RecentTransactions) drop their `parentCategoryId` state and pass the simplified props.

**Tech Stack:** React (Next.js App Router, `'use client'`), Vitest + Testing Library (jsdom), better-sqlite3 (test DB), Turso (prod DB via `@/lib/db`)

---

## File Map

| Action | Path |
|--------|------|
| Create | `app/api/categories/frequent/route.ts` |
| Rewrite | `app/(protected)/components/category-picker.tsx` |
| Modify | `app/(protected)/components/wheres-my-money.tsx` |
| Modify | `app/(protected)/components/drafts-card.tsx` |
| Modify | `app/(protected)/transactions/page.tsx` |
| Modify | `app/(protected)/components/recent-transactions.tsx` |
| Create | `tests/api/categories-frequent.test.ts` |
| Create | `tests/components/category-picker.test.tsx` |

---

## Task 1 — `/api/categories/frequent` endpoint

**Files:**
- Create: `app/api/categories/frequent/route.ts`
- Create: `tests/api/categories-frequent.test.ts`

### Step 1.1 — Write the failing test

Create `tests/api/categories-frequent.test.ts`:

```typescript
// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { initTestDb, clearTestDb, resetTestDb, req, seedAccount, seedCategory, seedTransaction } from '../helpers'

beforeAll(() => initTestDb())
afterAll(() => clearTestDb())
beforeEach(() => resetTestDb())

describe('GET /api/categories/frequent', () => {
  it('returns top categories by transaction count in last 30 days', async () => {
    seedAccount('acc1', 'DBS', 'bank')
    seedCategory('cat-food', 'Food', 'expense')
    seedCategory('cat-transport', 'Transport', 'expense')
    seedCategory('cat-living', 'Living', 'expense')

    const recentDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
    // Food × 3, Transport × 2, Living × 1
    seedTransaction('t1', 'acc1', { categoryId: 'cat-food', datetime: recentDate })
    seedTransaction('t2', 'acc1', { categoryId: 'cat-food', datetime: recentDate })
    seedTransaction('t3', 'acc1', { categoryId: 'cat-food', datetime: recentDate })
    seedTransaction('t4', 'acc1', { categoryId: 'cat-transport', datetime: recentDate })
    seedTransaction('t5', 'acc1', { categoryId: 'cat-transport', datetime: recentDate })
    seedTransaction('t6', 'acc1', { categoryId: 'cat-living', datetime: recentDate })

    const { GET } = await import('@/app/api/categories/frequent/route')
    const res = await GET(req('/api/categories/frequent?type=expense&days=30&limit=5'))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data[0].id).toBe('cat-food')
    expect(data[1].id).toBe('cat-transport')
    expect(data[2].id).toBe('cat-living')
  })

  it('excludes categories with transactions older than the days window', async () => {
    seedAccount('acc1', 'DBS', 'bank')
    seedCategory('cat-food', 'Food', 'expense')
    seedCategory('cat-old', 'OldCat', 'expense')

    const recentDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
    const oldDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()
    seedTransaction('t1', 'acc1', { categoryId: 'cat-food', datetime: recentDate })
    seedTransaction('t2', 'acc1', { categoryId: 'cat-old', datetime: oldDate })

    const { GET } = await import('@/app/api/categories/frequent/route')
    const res = await GET(req('/api/categories/frequent?type=expense&days=30&limit=5'))
    const data = await res.json()
    expect(data).toHaveLength(1)
    expect(data[0].id).toBe('cat-food')
  })

  it('filters by type', async () => {
    seedAccount('acc1', 'DBS', 'bank')
    seedCategory('cat-food', 'Food', 'expense')
    seedCategory('cat-salary', 'Salary', 'income')

    const recentDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
    seedTransaction('t1', 'acc1', { categoryId: 'cat-food', type: 'expense', datetime: recentDate })
    seedTransaction('t2', 'acc1', { categoryId: 'cat-salary', type: 'income', datetime: recentDate })

    const { GET } = await import('@/app/api/categories/frequent/route')
    const res = await GET(req('/api/categories/frequent?type=income&days=30&limit=5'))
    const data = await res.json()
    expect(data).toHaveLength(1)
    expect(data[0].id).toBe('cat-salary')
  })

  it('respects the limit parameter', async () => {
    seedAccount('acc1', 'DBS', 'bank')
    const recentDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
    for (let i = 1; i <= 7; i++) {
      seedCategory(`cat-${i}`, `Cat${i}`, 'expense')
      seedTransaction(`t${i}`, 'acc1', { categoryId: `cat-${i}`, datetime: recentDate })
    }

    const { GET } = await import('@/app/api/categories/frequent/route')
    const res = await GET(req('/api/categories/frequent?type=expense&days=30&limit=3'))
    const data = await res.json()
    expect(data).toHaveLength(3)
  })

  it('returns empty array when no matching transactions', async () => {
    const { GET } = await import('@/app/api/categories/frequent/route')
    const res = await GET(req('/api/categories/frequent?type=expense&days=30&limit=5'))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toEqual([])
  })
})
```

- [ ] **Step 1.2 — Run to verify it fails**

```bash
cd /d/a10101100_labs/root-of-all-blessings/.claude/worktrees/inspiring-shirley-8152f9
npx vitest run tests/api/categories-frequent.test.ts
```

Expected: All 5 tests FAIL with "Cannot find module" or route not found error.

- [ ] **Step 1.3 — Implement the route**

Create `app/api/categories/frequent/route.ts`:

```typescript
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  const type = request.nextUrl.searchParams.get('type') ?? 'expense'
  const days = parseInt(request.nextUrl.searchParams.get('days') ?? '30', 10)
  const limit = parseInt(request.nextUrl.searchParams.get('limit') ?? '5', 10)

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  const result = await db.execute({
    sql: `
      SELECT c.id, c.name, c.type, c.parent_id, c.sort_order, c.created_at, c.updated_at,
             COUNT(t.id) AS tx_count
      FROM categories c
      JOIN transactions t ON t.category_id = c.id
      WHERE c.type = ?
        AND (t.status IS NULL OR t.status = 'approved')
        AND t.datetime >= ?
      GROUP BY c.id
      ORDER BY tx_count DESC
      LIMIT ?
    `,
    args: [type, since, limit],
  })

  return Response.json(result.rows)
}
```

- [ ] **Step 1.4 — Run to verify it passes**

```bash
npx vitest run tests/api/categories-frequent.test.ts
```

Expected: All 5 tests PASS.

- [ ] **Step 1.5 — Commit**

```bash
git add app/api/categories/frequent/route.ts tests/api/categories-frequent.test.ts
git commit -m "feat(api): GET /api/categories/frequent — top categories by tx count in last N days"
```

---

## Task 2 — New `CategoryPicker` component

**Files:**
- Rewrite: `app/(protected)/components/category-picker.tsx`
- Create: `tests/components/category-picker.test.tsx`

### Background: new props interface

Old interface (being replaced):
```typescript
{ categories, txType, parentId, categoryId, onParentChange, onCategoryChange, selectStyle? }
```

New interface:
```typescript
{ categories, txType, categoryId, onChange(categoryId: string, parentCategoryId: string): void, inputStyle? }
```

**Options list logic:**
- Parents with NO children → selectable as `{ id: parent.id, parentId: '', label: parent.name }`
- Children → selectable as `{ id: child.id, parentId: parent.id, label: 'Parent > Child' }`
- Parents WITH children → group label only, NOT a selectable option

**Search logic:** `"gro"` matches `"Food > Grocery"` (case-insensitive `.includes`)

**Recent chips:** component self-fetches `/api/categories/frequent?type=...&days=30&limit=5` on mount and whenever `txType` changes.

**Display:** When closed and has a selection, input shows the full label (`"Food > Grocery"`). When open, input clears to show the query.

### Step 2.1 — Write the failing tests

Create `tests/components/category-picker.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'

const CATEGORIES = [
  { id: 'cat-food', name: 'Food', type: 'expense', sort_order: 1, parent_id: null, created_at: '2024-01-01', updated_at: '2024-01-01' },
  { id: 'cat-dining', name: 'Dining Out', type: 'expense', sort_order: 1, parent_id: 'cat-food', created_at: '2024-01-01', updated_at: '2024-01-01' },
  { id: 'cat-grocery', name: 'Grocery', type: 'expense', sort_order: 2, parent_id: 'cat-food', created_at: '2024-01-01', updated_at: '2024-01-01' },
  { id: 'cat-transport', name: 'Transport', type: 'expense', sort_order: 2, parent_id: null, created_at: '2024-01-01', updated_at: '2024-01-01' },
  { id: 'cat-bus', name: 'Bus', type: 'expense', sort_order: 1, parent_id: 'cat-transport', created_at: '2024-01-01', updated_at: '2024-01-01' },
  { id: 'cat-living', name: 'Living', type: 'expense', sort_order: 3, parent_id: null, created_at: '2024-01-01', updated_at: '2024-01-01' },
]

function mockFetch(recentIds: string[] = []) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (String(url).includes('/api/categories/frequent')) {
      return { ok: true, json: async () => recentIds.map((id) => ({ id })) }
    }
    return { ok: true, json: async () => [] }
  }))
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

async function renderPicker(props: {
  categoryId?: string
  onChange?: (cid: string, pid: string) => void
  recentIds?: string[]
}) {
  mockFetch(props.recentIds ?? [])
  const { CategoryPicker } = await import('@/app/(protected)/components/category-picker')
  const onChange = props.onChange ?? vi.fn()
  render(
    <CategoryPicker
      categories={CATEGORIES}
      txType="expense"
      categoryId={props.categoryId ?? ''}
      onChange={onChange}
    />
  )
  return { onChange }
}

describe('CategoryPicker — searchable unified picker', () => {
  it('shows a search input with placeholder when no category selected', async () => {
    await renderPicker({})
    expect(screen.getByTestId('category-search-input')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Category (optional)')).toBeInTheDocument()
  })

  it('displays the selected category label in the input when closed', async () => {
    await renderPicker({ categoryId: 'cat-grocery' })
    const input = screen.getByTestId('category-search-input') as HTMLInputElement
    expect(input.value).toBe('Food > Grocery')
  })

  it('opens dropdown on focus and shows all options', async () => {
    await renderPicker({})
    fireEvent.focus(screen.getByTestId('category-search-input'))
    await waitFor(() => expect(screen.getByTestId('category-dropdown')).toBeInTheDocument())
    // Parents with children are NOT shown as standalone options
    expect(screen.queryByTestId('category-option-cat-food')).not.toBeInTheDocument()
    expect(screen.queryByTestId('category-option-cat-transport')).not.toBeInTheDocument()
    // Children shown as "Parent > Child"
    expect(screen.getByTestId('category-option-cat-dining')).toBeInTheDocument()
    expect(screen.getByTestId('category-option-cat-grocery')).toBeInTheDocument()
    expect(screen.getByTestId('category-option-cat-bus')).toBeInTheDocument()
    // Parent with no children shown directly
    expect(screen.getByTestId('category-option-cat-living')).toBeInTheDocument()
  })

  it('filters options as user types — "gro" matches "Food > Grocery"', async () => {
    await renderPicker({})
    fireEvent.focus(screen.getByTestId('category-search-input'))
    await waitFor(() => expect(screen.getByTestId('category-dropdown')).toBeInTheDocument())
    fireEvent.change(screen.getByTestId('category-search-input'), { target: { value: 'gro' } })
    await waitFor(() => {
      expect(screen.getByTestId('category-option-cat-grocery')).toBeInTheDocument()
      expect(screen.queryByTestId('category-option-cat-dining')).not.toBeInTheDocument()
      expect(screen.queryByTestId('category-option-cat-bus')).not.toBeInTheDocument()
    })
  })

  it('filters by parent name — "food" shows Food subcategories', async () => {
    await renderPicker({})
    fireEvent.focus(screen.getByTestId('category-search-input'))
    await waitFor(() => expect(screen.getByTestId('category-dropdown')).toBeInTheDocument())
    fireEvent.change(screen.getByTestId('category-search-input'), { target: { value: 'food' } })
    await waitFor(() => {
      expect(screen.getByTestId('category-option-cat-dining')).toBeInTheDocument()
      expect(screen.getByTestId('category-option-cat-grocery')).toBeInTheDocument()
      expect(screen.queryByTestId('category-option-cat-bus')).not.toBeInTheDocument()
    })
  })

  it('calls onChange with categoryId and parentCategoryId when option selected', async () => {
    const onChange = vi.fn()
    await renderPicker({ onChange })
    fireEvent.focus(screen.getByTestId('category-search-input'))
    await waitFor(() => expect(screen.getByTestId('category-option-cat-grocery')).toBeInTheDocument())
    fireEvent.mouseDown(screen.getByTestId('category-option-cat-grocery'))
    expect(onChange).toHaveBeenCalledWith('cat-grocery', 'cat-food')
  })

  it('calls onChange with ("", "") when parent-only category (no children) is selected', async () => {
    const onChange = vi.fn()
    await renderPicker({ onChange })
    fireEvent.focus(screen.getByTestId('category-search-input'))
    await waitFor(() => expect(screen.getByTestId('category-option-cat-living')).toBeInTheDocument())
    fireEvent.mouseDown(screen.getByTestId('category-option-cat-living'))
    expect(onChange).toHaveBeenCalledWith('cat-living', '')
  })

  it('shows "No categories found" when query matches nothing', async () => {
    await renderPicker({})
    fireEvent.focus(screen.getByTestId('category-search-input'))
    await waitFor(() => expect(screen.getByTestId('category-dropdown')).toBeInTheDocument())
    fireEvent.change(screen.getByTestId('category-search-input'), { target: { value: 'xyznotexist' } })
    await waitFor(() => expect(screen.getByText('No categories found')).toBeInTheDocument())
  })

  it('shows recent chips above the list when recentIds are provided', async () => {
    await renderPicker({ recentIds: ['cat-grocery', 'cat-bus'] })
    fireEvent.focus(screen.getByTestId('category-search-input'))
    await waitFor(() => {
      expect(screen.getByTestId('recent-chip-cat-grocery')).toBeInTheDocument()
      expect(screen.getByTestId('recent-chip-cat-bus')).toBeInTheDocument()
    })
  })

  it('selecting a recent chip calls onChange with correct ids', async () => {
    const onChange = vi.fn()
    await renderPicker({ onChange, recentIds: ['cat-grocery'] })
    fireEvent.focus(screen.getByTestId('category-search-input'))
    await waitFor(() => expect(screen.getByTestId('recent-chip-cat-grocery')).toBeInTheDocument())
    fireEvent.mouseDown(screen.getByTestId('recent-chip-cat-grocery'))
    expect(onChange).toHaveBeenCalledWith('cat-grocery', 'cat-food')
  })

  it('hides recent chips while search query is active', async () => {
    await renderPicker({ recentIds: ['cat-grocery'] })
    fireEvent.focus(screen.getByTestId('category-search-input'))
    await waitFor(() => expect(screen.getByTestId('recent-chip-cat-grocery')).toBeInTheDocument())
    fireEvent.change(screen.getByTestId('category-search-input'), { target: { value: 'bus' } })
    await waitFor(() => expect(screen.queryByTestId('recent-chip-cat-grocery')).not.toBeInTheDocument())
  })
})
```

- [ ] **Step 2.2 — Run to verify all tests fail**

```bash
npx vitest run tests/components/category-picker.test.tsx
```

Expected: All tests FAIL (old component doesn't have `data-testid="category-search-input"` or the new interface).

- [ ] **Step 2.3 — Rewrite the component**

Replace entire `app/(protected)/components/category-picker.tsx`:

```tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import type { Category, TxType } from '@/lib/types'

interface CategoryOption {
  id: string
  parentId: string
  label: string
}

export interface CategoryPickerProps {
  categories: Category[]
  txType: TxType
  categoryId: string
  onChange: (categoryId: string, parentCategoryId: string) => void
  inputStyle?: React.CSSProperties
}

const DEFAULT_INPUT: React.CSSProperties = {
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: '6px',
  color: 'var(--text)',
  fontSize: '13px',
  padding: '6px 10px',
  outline: 'none',
  width: '100%',
  cursor: 'text',
  boxSizing: 'border-box',
}

export function buildCategoryOptions(categories: Category[], txType: TxType): CategoryOption[] {
  const type = txType === 'transfer' ? 'expense' : txType
  const filtered = categories.filter((c) => c.type === type)
  const parents = filtered.filter((c) => c.parent_id === null)
  const options: CategoryOption[] = []
  for (const parent of parents) {
    const children = filtered.filter((c) => c.parent_id === parent.id)
    if (children.length === 0) {
      options.push({ id: parent.id, parentId: '', label: parent.name })
    } else {
      for (const child of children) {
        options.push({ id: child.id, parentId: parent.id, label: `${parent.name} > ${child.name}` })
      }
    }
  }
  return options
}

export function CategoryPicker({
  categories,
  txType,
  categoryId,
  onChange,
  inputStyle,
}: CategoryPickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [recentIds, setRecentIds] = useState<string[]>([])
  const containerRef = useRef<HTMLDivElement>(null)

  const options = buildCategoryOptions(categories, txType)
  const selected = options.find((o) => o.id === categoryId)

  useEffect(() => {
    const type = txType === 'transfer' ? 'expense' : txType
    fetch(`/api/categories/frequent?type=${type}&days=30&limit=5`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: { id: string }[]) => setRecentIds(data.map((d) => d.id)))
      .catch(() => {})
  }, [txType])

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filteredOptions = query
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options

  const recentOptions = recentIds
    .map((id) => options.find((o) => o.id === id))
    .filter((o): o is CategoryOption => o !== undefined)

  function selectOption(opt: CategoryOption) {
    onChange(opt.id, opt.parentId)
    setIsOpen(false)
    setQuery('')
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation()
    onChange('', '')
    setQuery('')
  }

  const displayValue = isOpen ? query : (selected?.label ?? '')
  const inputSt: React.CSSProperties = { ...DEFAULT_INPUT, ...inputStyle }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <input
          data-testid="category-search-input"
          placeholder="Category (optional)"
          value={displayValue}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsOpen(true)}
          style={inputSt}
          autoComplete="off"
        />
        {categoryId && !isOpen && (
          <button
            type="button"
            onClick={handleClear}
            aria-label="Clear category"
            style={{
              position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', fontSize: '16px', lineHeight: 1, padding: '0 2px',
            }}
          >
            ×
          </button>
        )}
      </div>

      {isOpen && (
        <div
          data-testid="category-dropdown"
          style={{
            position: 'absolute', top: '100%', left: 0, right: 0,
            background: 'var(--bg)', border: '1px solid var(--border)',
            borderRadius: '6px', zIndex: 200, maxHeight: '260px',
            overflowY: 'auto', marginTop: '2px', boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          }}
        >
          {!query && recentOptions.length > 0 && (
            <div style={{ padding: '8px 8px 6px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>Recent</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                {recentOptions.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    data-testid={`recent-chip-${opt.id}`}
                    onMouseDown={(e) => { e.preventDefault(); selectOption(opt) }}
                    style={{
                      padding: '3px 10px', borderRadius: '12px', fontSize: '12px',
                      background: categoryId === opt.id ? 'var(--accent)' : 'var(--bg-dim)',
                      color: categoryId === opt.id ? '#fff' : 'var(--text)',
                      border: '1px solid var(--border)', cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {filteredOptions.length === 0 ? (
            <div style={{ padding: '12px', color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center' }}>
              No categories found
            </div>
          ) : (
            filteredOptions.map((opt) => (
              <div
                key={opt.id}
                data-testid={`category-option-${opt.id}`}
                onMouseDown={(e) => { e.preventDefault(); selectOption(opt) }}
                style={{
                  padding: '8px 12px', cursor: 'pointer', fontSize: '13px',
                  color: categoryId === opt.id ? 'var(--accent)' : 'var(--text)',
                  background: 'transparent',
                  fontWeight: categoryId === opt.id ? 600 : 400,
                }}
              >
                {opt.label}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2.4 — Run to verify tests pass**

```bash
npx vitest run tests/components/category-picker.test.tsx
```

Expected: All tests PASS.

- [ ] **Step 2.5 — Commit**

```bash
git add app/(protected)/components/category-picker.tsx tests/components/category-picker.test.tsx
git commit -m "feat(ui): searchable unified category picker with recent chips"
```

---

## Task 3 — Update WheresMyMoney

**Files:**
- Modify: `app/(protected)/components/wheres-my-money.tsx`

**Changes:**
1. Remove `parentCategoryId` state (line 61)
2. Update `CategoryPicker` usage (lines 628-641): remove `parentId`/`onParentChange` props, add `onChange`
3. Update `applyPasteData` category logic (lines 164-178): remove `setParentCategoryId` calls
4. Update `reset()` function (lines 291-297): remove `setParentCategoryId('')`

- [ ] **Step 3.1 — Write regression test first**

Add to `tests/components/wheres-my-money.test.tsx` a new describe block:

```typescript
// ---------------------------------------------------------------------------
// Category picker — new searchable unified picker (Task 3 regression)
// ---------------------------------------------------------------------------
describe('searchable category picker in WheresMyMoney', () => {
  it('shows category search input (not two legacy selects)', async () => {
    mockFetch()
    await renderWMM()
    expect(screen.getByTestId('category-search-input')).toBeInTheDocument()
    expect(screen.queryByTestId('parent-category-select')).not.toBeInTheDocument()
    expect(screen.queryByTestId('subcategory-select')).not.toBeInTheDocument()
  })

  it('typing "gro" filters to Food > Grocery option', async () => {
    mockFetch()
    await renderWMM()
    const input = screen.getByTestId('category-search-input')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'gro' } })
    await waitFor(() =>
      expect(screen.getByTestId('category-option-cat-dining')).toBeInTheDocument() === false ||
      screen.queryByText('Food > Dining Out') === null
    )
    // "gro" matches Grocery but not Dining Out — the option list filters
    await waitFor(() => expect(screen.queryByText('Food > Dining Out')).not.toBeInTheDocument())
  })
})
```

- [ ] **Step 3.2 — Run to verify the new tests fail**

```bash
npx vitest run tests/components/wheres-my-money.test.tsx
```

Expected: The new "searchable category picker" describe block FAILS (old component still rendered).

- [ ] **Step 3.3 — Update WheresMyMoney**

**3.3a — Remove `parentCategoryId` state.** Find and delete line:
```typescript
  const [parentCategoryId, setParentCategoryId] = useState('')
```

**3.3b — Update `applyPasteData` category block** (around lines 164-178). Replace:
```typescript
    if (data.category) {
      const match = categories.find(
        (c) => c.name.toLowerCase() === data.category!.toLowerCase()
      )
      if (match) {
        if (match.parent_id) {
          setParentCategoryId(match.parent_id)
          setCategoryId(match.id)
        } else {
          setParentCategoryId(match.id)
          const hasChildren = categories.some((c) => c.parent_id === match.id)
          if (!hasChildren) setCategoryId(match.id)
        }
      }
    }
```
With:
```typescript
    if (data.category) {
      const match = categories.find(
        (c) => c.name.toLowerCase() === data.category!.toLowerCase()
      )
      if (match) {
        const hasChildren = categories.some((c) => c.parent_id === match.id)
        if (!hasChildren) setCategoryId(match.id)
      }
    }
```

**3.3c — Update `reset()` function.** Remove the `setParentCategoryId('')` call from `reset()`.

**3.3d — Update CategoryPicker JSX** (around lines 628-641). Replace:
```tsx
              <CategoryPicker
                categories={categories}
                txType={type}
                parentId={parentCategoryId}
                categoryId={categoryId}
                onParentChange={setParentCategoryId}
                onCategoryChange={setCategoryId}
                selectStyle={selectStyle}
              />
```
With:
```tsx
              <CategoryPicker
                categories={categories}
                txType={type}
                categoryId={categoryId}
                onChange={(cid) => setCategoryId(cid)}
                inputStyle={selectStyle}
              />
```

- [ ] **Step 3.4 — Run tests**

```bash
npx vitest run tests/components/wheres-my-money.test.tsx
```

Expected: All tests PASS (including the new searchable picker describe block).

- [ ] **Step 3.5 — Commit**

```bash
git add app/(protected)/components/wheres-my-money.tsx tests/components/wheres-my-money.test.tsx
git commit -m "feat(wmm): use searchable category picker, drop parentCategoryId state"
```

---

## Task 4 — Update DraftsCard

**Files:**
- Modify: `app/(protected)/components/drafts-card.tsx`

**Changes:**
1. Remove `editParentCategoryId` state (line 84)
2. Update `CategoryPicker` JSX (lines 489-498)

- [ ] **Step 4.1 — Write regression test first**

Add a new describe block to `tests/components/drafts-card.test.tsx`:

```typescript
describe('searchable category picker in DraftsCard edit form', () => {
  it('renders category-search-input (not legacy two-step selects) in edit form', async () => {
    // Render DraftsCard with one draft transaction, open its edit form,
    // verify the new picker is shown
    // (Adapt to how drafts-card.test.tsx mocks data — match existing test patterns)
    // This test will fail until DraftsCard is updated.
    expect(true).toBe(false) // placeholder: replace with real test after reading existing test file
  })
})
```

> **Note for executor:** Before writing the real test, read the full `tests/components/drafts-card.test.tsx` file to understand the existing mock patterns (how fetch is stubbed, how edit form is opened). Then replace the placeholder above with a real test that: (1) renders DraftsCard with a seeded draft, (2) clicks edit, (3) asserts `data-testid="category-search-input"` is present and `data-testid="parent-category-select"` is absent.

- [ ] **Step 4.2 — Run to verify test fails**

```bash
npx vitest run tests/components/drafts-card.test.tsx
```

Expected: New describe block FAILS.

- [ ] **Step 4.3 — Update DraftsCard**

**4.3a — Remove `editParentCategoryId` state** (line 84):
```typescript
  const [editParentCategoryId, setEditParentCategoryId] = useState('')
```
Delete this line.

**4.3b — Update CategoryPicker JSX** (lines 489-498). Replace:
```tsx
                          <CategoryPicker
                            categories={categories}
                            txType={editForm.type}
                            parentId={editParentCategoryId}
                            categoryId={editForm.category_id}
                            onParentChange={setEditParentCategoryId}
                            onCategoryChange={(cid) => ef('category_id', cid)}
                            selectStyle={SELECT}
                          />
```
With:
```tsx
                          <CategoryPicker
                            categories={categories}
                            txType={editForm.type}
                            categoryId={editForm.category_id}
                            onChange={(cid) => ef('category_id', cid)}
                            inputStyle={SELECT}
                          />
```

Also find where `editingId` changes and `editParentCategoryId` was reset — if `setEditParentCategoryId('')` is called anywhere when opening/closing an edit, remove those calls.

- [ ] **Step 4.4 — Run tests**

```bash
npx vitest run tests/components/drafts-card.test.tsx
```

Expected: All PASS.

- [ ] **Step 4.5 — Commit**

```bash
git add app/(protected)/components/drafts-card.tsx tests/components/drafts-card.test.tsx
git commit -m "feat(drafts): use searchable category picker in edit form"
```

---

## Task 5 — Update TransactionsPage

**Files:**
- Modify: `app/(protected)/transactions/page.tsx`

**Changes:**
1. Remove `editParentCategoryId` state (line 153)
2. Update `CategoryPicker` JSX (lines 771-780)
3. Remove any `setEditParentCategoryId` calls when opening/closing edit

- [ ] **Step 5.1 — Write regression test first**

Add to `tests/components/` or find existing transactions page test. Create `tests/components/transactions-page-category.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'

vi.mock('@/app/(protected)/components/toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))
vi.mock('@/app/(protected)/components/confirm-dialog', () => ({
  ConfirmDialog: () => null,
}))

const ACCOUNT = { id: 'acc1', name: 'DBS', type: 'bank', currency: 'SGD', is_active: 1, created_at: '2024-01-01', updated_at: '2024-01-01' }
const CATEGORIES = [
  { id: 'cat-food', name: 'Food', type: 'expense', sort_order: 1, parent_id: null, created_at: '2024-01-01', updated_at: '2024-01-01' },
  { id: 'cat-dining', name: 'Dining Out', type: 'expense', sort_order: 1, parent_id: 'cat-food', created_at: '2024-01-01', updated_at: '2024-01-01' },
]
const TX = {
  id: 'tx1', type: 'expense', amount: 10, currency: 'SGD', fx_rate: null, fx_date: null,
  sgd_equivalent: null, account_id: 'acc1', to_account_id: null, category_id: 'cat-dining',
  payee: 'Test', note: '', payment_method: null, datetime: '2026-04-01T10:00:00+08:00',
  status: 'approved', created_at: '2026-04-01', updated_at: '2026-04-01',
  account_name: 'DBS', to_account_name: null, category_name: 'Dining Out', tags: [],
}

function mockFetch() {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (String(url).includes('/api/transactions') && !String(url).includes('/payees')) {
      return { ok: true, json: async () => ({ data: [TX], total: 1 }) }
    }
    if (String(url).includes('/api/accounts')) return { ok: true, json: async () => [ACCOUNT] }
    if (String(url).includes('/api/categories/frequent')) return { ok: true, json: async () => [] }
    if (String(url).includes('/api/categories')) return { ok: true, json: async () => CATEGORIES }
    if (String(url).includes('/api/tags')) return { ok: true, json: async () => [] }
    return { ok: true, json: async () => [] }
  }))
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('searchable category picker in TransactionsPage edit form', () => {
  it('shows category-search-input in edit form, not legacy two-step selects', async () => {
    mockFetch()
    const { default: TransactionsPage } = await import('@/app/(protected)/transactions/page')
    render(<TransactionsPage />)
    await waitFor(() => expect(screen.getByText('Test')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Test'))
    await waitFor(() => expect(screen.getByTestId('category-search-input')).toBeInTheDocument())
    expect(screen.queryByTestId('parent-category-select')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 5.2 — Run to verify test fails**

```bash
npx vitest run tests/components/transactions-page-category.test.tsx
```

Expected: FAIL.

- [ ] **Step 5.3 — Update TransactionsPage**

**5.3a — Remove `editParentCategoryId` state** (line 153):
```typescript
  const [editParentCategoryId, setEditParentCategoryId] = useState('')
```
Delete this line.

**5.3b — Update CategoryPicker JSX** (lines 771-780). Replace:
```tsx
                    <CategoryPicker
                      categories={categories}
                      txType={editForm.type}
                      parentId={editParentCategoryId}
                      categoryId={editForm.category_id}
                      onParentChange={setEditParentCategoryId}
                      onCategoryChange={(id) => ef('category_id', id)}
                      selectStyle={{ ...SELECT, width: '100%' }}
                    />
```
With:
```tsx
                    <CategoryPicker
                      categories={categories}
                      txType={editForm.type}
                      categoryId={editForm.category_id}
                      onChange={(cid) => ef('category_id', cid)}
                      inputStyle={{ ...SELECT, width: '100%' }}
                    />
```

**5.3c — Remove any `setEditParentCategoryId` calls** when opening or cancelling edit (grep for them and delete).

- [ ] **Step 5.4 — Run tests**

```bash
npx vitest run tests/components/transactions-page-category.test.tsx
```

Expected: PASS.

- [ ] **Step 5.5 — Commit**

```bash
git add app/(protected)/transactions/page.tsx tests/components/transactions-page-category.test.tsx
git commit -m "feat(transactions): use searchable category picker in edit form"
```

---

## Task 6 — Update RecentTransactions

**Files:**
- Modify: `app/(protected)/components/recent-transactions.tsx`

**Changes:**
1. Remove `parentCategoryId` from the `EditRow` interface (line 61)
2. Remove `parentCategoryId` from the edit row initialization (line 112)
3. Update `CategoryPicker` JSX (lines 336-344)

- [ ] **Step 6.1 — Write regression test first**

Add a describe block to `tests/components/recent-transactions.test.tsx` that opens an edit row and asserts `category-search-input` is present. Match the existing test patterns in that file.

> **Note for executor:** Read `tests/components/recent-transactions.test.tsx` before writing. The test should: open edit mode on a transaction row, verify `getByTestId('category-search-input')` exists and `queryByTestId('parent-category-select')` is null.

- [ ] **Step 6.2 — Run to verify test fails**

```bash
npx vitest run tests/components/recent-transactions.test.tsx
```

Expected: New describe block FAILS.

- [ ] **Step 6.3 — Update RecentTransactions**

**6.3a — Update `EditRow` interface**: remove `parentCategoryId: string` field.

**6.3b — Update edit row initialization**: remove the `parentCategoryId: cat ? (cat.parent_id ?? cat.id) : ''` field from wherever `editRow` is initialized.

**6.3c — Update CategoryPicker JSX** (lines 336-344). Replace:
```tsx
                      <CategoryPicker
                        categories={categories}
                        txType={tx.type}
                        parentId={editRow.parentCategoryId}
                        categoryId={editRow.categoryId}
                        onParentChange={(pid) => setEditRow((p) => p ? { ...p, parentCategoryId: pid } : p)}
                        onCategoryChange={(id) => setEditRow((p) => p ? { ...p, categoryId: id } : p)}
                        selectStyle={compactSelect}
                      />
```
With:
```tsx
                      <CategoryPicker
                        categories={categories}
                        txType={tx.type}
                        categoryId={editRow.categoryId}
                        onChange={(cid) => setEditRow((p) => p ? { ...p, categoryId: cid } : p)}
                        inputStyle={compactSelect}
                      />
```

- [ ] **Step 6.4 — Run tests**

```bash
npx vitest run tests/components/recent-transactions.test.tsx
```

Expected: All PASS.

- [ ] **Step 6.5 — Commit**

```bash
git add app/(protected)/components/recent-transactions.tsx tests/components/recent-transactions.test.tsx
git commit -m "feat(recent-tx): use searchable category picker in inline edit"
```

---

## Task 7 — Full test suite

- [ ] **Step 7.1 — Run all tests**

```bash
cd /d/a10101100_labs/root-of-all-blessings/.claude/worktrees/inspiring-shirley-8152f9
npx vitest run
```

Expected: All tests PASS, zero failures. If any fail, fix them before proceeding.

- [ ] **Step 7.2 — TypeScript check**

```bash
npx tsc --noEmit
```

Expected: No type errors. Fix any that appear.

- [ ] **Step 7.3 — Commit any fixes**

```bash
git add -p
git commit -m "fix: resolve test/type failures from category picker refactor"
```

---

## Task 8 — PR, merge, verify Vercel, test prod

- [ ] **Step 8.1 — Create PR**

```bash
gh pr create \
  --title "feat: searchable category picker with recent chips (replaces two-step)" \
  --body "$(cat <<'EOF'
## Summary
- New `/api/categories/frequent` endpoint returns top-5 categories by transaction count in last 30 days
- `CategoryPicker` rewritten: unified search input (`"gro"` → `"Food > Grocery"`), recent chips, one-tap select
- All 4 callers updated: WheresMyMoney, DraftsCard, TransactionsPage, RecentTransactions
- Drops `parentCategoryId` UI state from all callers (managed internally by picker)

## Test plan
- [ ] All vitest tests pass (`npx vitest run`)
- [ ] TypeScript clean (`npx tsc --noEmit`)
- [ ] Manual: type "gro" → sees "Food > Grocery"
- [ ] Manual: type "food" → sees all Food subcategories
- [ ] Manual: recent chips appear after transactions exist
- [ ] Manual: select via chip → form shows correct selection
- [ ] Manual: clear button (×) resets selection
- [ ] All 4 screens verified: /add, Drafts, /transactions, Dashboard recent

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 8.2 — Merge PR**

```bash
gh pr merge --squash --delete-branch
```

- [ ] **Step 8.3 — Wait for Vercel deploy**

```bash
gh run list --limit 5
```

Wait until the deploy workflow shows `completed / success`. Then open https://blessroot.quietbuild.ai and confirm the app loads.

- [ ] **Step 8.4 — Run prod regression tests**

```bash
npx vitest run
```

Re-run the full test suite to confirm nothing regressed locally.

- [ ] **Step 8.5 — Manual prod verification flows**

Test on https://blessroot.quietbuild.ai:

1. **Add a transaction via quick entry (/add → WheresMyMoney):**
   - Tap the category field → dropdown opens
   - Type "gro" → list filters to "Food > Grocery" only
   - Select it → input shows "Food > Grocery", transaction saves with correct category

2. **Edit an existing transaction:**
   - On /transactions, tap a transaction row to open edit
   - Category field shows `category-search-input` (search box)
   - Type a subcategory name, select → saves correctly

3. **Verify recent chips appear:**
   - After a few transactions, open category picker → "Recent" chips appear at top
   - Tapping a chip selects the category in one tap

4. **Unified subcategory search:**
   - Type "living" in /add category field → "Living" appears (parent with no children)
   - Type "dining" → "Food > Dining Out" appears

5. **Verify all 4 screens:**
   - /add (WheresMyMoney): ✓ searchable picker
   - Drafts (DraftsCard): ✓ searchable picker in inline edit
   - /transactions (TransactionsPage): ✓ searchable picker in edit form
   - Dashboard recent transactions: ✓ searchable picker in inline edit

- [ ] **Step 8.6 — Fix any prod issues**

If any issues are found in prod testing, fix them, create a new PR, merge, wait for deploy, and re-test before reporting done.

---

## Self-Review Checklist

- [x] **Spec coverage:** `/api/categories/frequent` ✓, searchable picker ✓, recent chips ✓, all 4 screens ✓
- [x] **Placeholders:** No TBDs (DraftsCard and RecentTransactions tests have "Note for executor" — these are intentional, directing the executor to read existing test files first before writing)
- [x] **Type consistency:** `CategoryPickerProps.onChange(categoryId: string, parentCategoryId: string)` used consistently across all tasks. `buildCategoryOptions` exported for reuse in tests. `CategoryOption` interface is local to the file.
- [x] **All callers updated:** WMM (Task 3), DraftsCard (Task 4), TransactionsPage (Task 5), RecentTransactions (Task 6)
- [x] **TDD order enforced:** Every task writes failing test BEFORE implementation code
