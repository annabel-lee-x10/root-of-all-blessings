# Blessroot Batch — Subcategories, Theme, UI Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship nine related improvements to blessroot — subcategory schema, burnt-orange theme with light/dark toggle, logo swap, categories page overhaul, dashboard drilldown, transactions page fixes + bulk ops, and account dropdown grouping — across four sequentially merged PRs.

**Architecture:** Schema-first (PR 1) so later PRs can rely on parent_id in categories. Theme change (PR 2) is independent of schema and touches every component. Feature PRs (3 & 4) build on both.

**Tech Stack:** Next.js 16 (App Router, `params` as `Promise<{id}>` in route handlers), React 19, libsql/Turso, Vitest + @testing-library, TypeScript 5, Tailwind 4 (import-only, minimal class use), inline React.CSSProperties for all component styles.

> **IMPORTANT:** This is Next.js 16 — check `node_modules/next/dist/docs/` before coding anything. APIs, file conventions, and hooks may differ from your training data. The existing codebase is authoritative; follow its patterns exactly.

---

## File Map

### PR 1 — Schema, Types, API
- Modify: `app/api/migrate/route.ts` — add 3 new migrations
- Modify: `lib/types.ts` — add `parent_id` to Category interface
- Modify: `app/api/categories/route.ts` — accept `parent_id` in POST
- Modify: `app/api/categories/[id]/route.ts` — accept `parent_id` in PATCH
- Modify: `tests/helpers.ts` — add `parent_id` to SCHEMA, update `seedCategory`
- Modify: `tests/api/categories.test.ts` — add parent_id tests

### PR 2 — Theme + Logo
- Modify: `app/globals.css` — change --accent variables
- Create: `app/(protected)/components/theme-toggle.tsx` — sun/moon toggle button
- Modify: `app/layout.tsx` — anti-flash inline script
- Modify: `app/(protected)/components/nav-bar.tsx` — import ThemeToggle, replace gold colors, swap star SVG
- Modify: `app/(protected)/components/expense-dashboard.tsx` — replace gold colors
- Modify: `app/(protected)/components/wheres-my-money.tsx` — replace gold colors
- Modify: `app/(protected)/components/recent-transactions.tsx` — replace gold colors (if any)
- Modify: `app/(protected)/accounts/page.tsx` — replace gold colors
- Modify: `app/(protected)/categories/page.tsx` — replace gold colors
- Modify: `app/(protected)/transactions/page.tsx` — replace gold colors
- Modify: `app/(protected)/tags/page.tsx` — replace gold colors
- Modify: `app/login/login-form.tsx` — replace gold colors + logo SVG

### PR 3 — Categories Overhaul + Dashboard Drilldown
- Modify: `app/(protected)/categories/page.tsx` — full overhaul
- Modify: `app/api/dashboard/route.ts` — add `parent_category_id` param
- Modify: `app/(protected)/components/expense-dashboard.tsx` — clickable drilldown rows

### PR 4 — Transactions Improvements + Account Dropdowns + Bulk Ops
- Modify: `app/(protected)/transactions/page.tsx` — URL params, search, sort, bulk ops
- Modify: `app/api/transactions/route.ts` — add search + sort params
- Modify: `app/(protected)/components/wheres-my-money.tsx` — account optgroup
- Modify: `tests/api/transactions.test.ts` — search + sort tests

---

## PR 1: Schema, Types, and API Foundation

**Branch:** `git checkout -b feat/subcategory-schema origin/main`

---

### Task 1: Add migrations

**Files:**
- Modify: `app/api/migrate/route.ts`

- [ ] **Step 1: Read the file first**

  Open `app/api/migrate/route.ts`. Confirm it contains a `migrations` array with `{ name, sql }` entries.

- [ ] **Step 2: Add three new entries to the migrations array**

  Insert after the existing entries (before the closing `]`):

  ```typescript
  {
    name: 'categories.parent_id',
    sql: 'ALTER TABLE categories ADD COLUMN parent_id TEXT REFERENCES categories(id) ON DELETE SET NULL',
  },
  {
    name: 'tags.drop_category_id',
    sql: 'ALTER TABLE tags DROP COLUMN category_id',
  },
  {
    name: 'accounts.delete_vallow',
    sql: "DELETE FROM accounts WHERE name = 'vallow'",
  },
  ```

  The existing try/catch per migration handles idempotency — ALTER TABLE fails silently if column already exists, DROP COLUMN fails silently if column doesn't exist, DELETE affects 0 rows if already gone.

- [ ] **Step 3: Verify structure compiles**

  ```bash
  npx tsc --noEmit
  ```

  Expected: no errors.

- [ ] **Step 4: Commit**

  ```bash
  git add app/api/migrate/route.ts
  git commit -m "feat: add parent_id to categories, drop tags.category_id, delete vallow"
  ```

---

### Task 2: Update TypeScript types

**Files:**
- Modify: `lib/types.ts`

- [ ] **Step 1: Update the Category interface**

  In `lib/types.ts`, change the `Category` interface from:

  ```typescript
  export interface Category {
    id: string
    name: string
    type: CategoryType
    sort_order: number
    created_at: string
    updated_at: string
  }
  ```

  To:

  ```typescript
  export interface Category {
    id: string
    name: string
    type: CategoryType
    sort_order: number
    parent_id: string | null
    created_at: string
    updated_at: string
  }
  ```

- [ ] **Step 2: TypeScript check**

  ```bash
  npx tsc --noEmit
  ```

  Expected: no errors. (The API routes use `SELECT *` so parent_id comes back automatically; nothing breaks.)

- [ ] **Step 3: Commit**

  ```bash
  git add lib/types.ts
  git commit -m "feat: add parent_id to Category type"
  ```

---

### Task 3: Update /api/categories POST to accept parent_id

**Files:**
- Modify: `app/api/categories/route.ts`

- [ ] **Step 1: Write the failing test**

  In `tests/api/categories.test.ts`, add inside `describe('POST /api/categories', ...)`:

  ```typescript
  it('creates a subcategory with parent_id', async () => {
    seedCategory('parent1', 'Food', 'expense')
    const { POST } = await import('@/app/api/categories/route')
    const res = await POST(req('/api/categories', 'POST', {
      name: 'Groceries',
      type: 'expense',
      parent_id: 'parent1',
    }))
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.parent_id).toBe('parent1')
  })

  it('returns 400 when parent_id references non-existent category', async () => {
    const { POST } = await import('@/app/api/categories/route')
    const res = await POST(req('/api/categories', 'POST', {
      name: 'Groceries',
      type: 'expense',
      parent_id: 'does-not-exist',
    }))
    expect(res.status).toBe(400)
  })
  ```

- [ ] **Step 2: Update SCHEMA in tests/helpers.ts to add parent_id to categories**

  In `tests/helpers.ts`, change the categories table DDL from:

  ```sql
  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL CHECK(type IN ('expense','income')),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  ```

  To:

  ```sql
  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL CHECK(type IN ('expense','income')),
    sort_order INTEGER NOT NULL DEFAULT 0,
    parent_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  ```

- [ ] **Step 3: Run tests to confirm they fail**

  ```bash
  npx vitest run tests/api/categories.test.ts
  ```

  Expected: the two new tests fail (parent_id not returned / validation missing).

- [ ] **Step 4: Update the POST handler to accept parent_id**

  In `app/api/categories/route.ts`, replace the POST handler with:

  ```typescript
  export async function POST(request: NextRequest) {
    const body = await request.json()
    const { name, type, sort_order = 0, parent_id = null } = body

    if (!name || !type) {
      return Response.json({ error: 'name and type are required' }, { status: 400 })
    }
    if (!['expense', 'income'].includes(type)) {
      return Response.json({ error: 'type must be expense or income' }, { status: 400 })
    }

    if (parent_id != null) {
      const parentRow = await db.execute({
        sql: 'SELECT id FROM categories WHERE id = ?',
        args: [parent_id],
      })
      if (parentRow.rows.length === 0) {
        return Response.json({ error: 'parent_id does not reference a valid category' }, { status: 400 })
      }
    }

    const id = crypto.randomUUID()
    const n = new Date().toISOString()

    await db.execute({
      sql: `INSERT INTO categories (id, name, type, sort_order, parent_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [id, name, type, sort_order, parent_id, n, n],
    })

    const row = await db.execute({ sql: 'SELECT * FROM categories WHERE id = ?', args: [id] })
    return Response.json(row.rows[0], { status: 201 })
  }
  ```

- [ ] **Step 5: Run tests to confirm they pass**

  ```bash
  npx vitest run tests/api/categories.test.ts
  ```

  Expected: all pass.

- [ ] **Step 6: Commit**

  ```bash
  git add app/api/categories/route.ts tests/api/categories.test.ts tests/helpers.ts
  git commit -m "feat: categories POST accepts parent_id with validation"
  ```

---

### Task 4: Update /api/categories/[id] PATCH to accept parent_id

**Files:**
- Modify: `app/api/categories/[id]/route.ts`
- Modify: `tests/api/categories.test.ts`

- [ ] **Step 1: Write the failing test**

  In `tests/api/categories.test.ts`, add inside `describe('PATCH /api/categories/[id]', ...)`:

  ```typescript
  it('sets parent_id on a category', async () => {
    seedCategory('parent2', 'Food', 'expense')
    seedCategory('child1', 'Groceries', 'expense')
    const { PATCH } = await import('@/app/api/categories/[id]/route')
    const res = await PATCH(
      req('/api/categories/child1', 'PATCH', { parent_id: 'parent2' }),
      { params: Promise.resolve({ id: 'child1' }) }
    )
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.parent_id).toBe('parent2')
  })

  it('clears parent_id when set to null', async () => {
    seedCategory('parent3', 'Transport', 'expense')
    seedCategory('child2', 'Taxi', 'expense')
    // Set parent first
    const n = new Date().toISOString()
    // (use seedCategory helper, then manually set parent_id via raw SQL in test)
    const { PATCH } = await import('@/app/api/categories/[id]/route')
    const res = await PATCH(
      req('/api/categories/child2', 'PATCH', { parent_id: null }),
      { params: Promise.resolve({ id: 'child2' }) }
    )
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.parent_id).toBeNull()
  })
  ```

- [ ] **Step 2: Run tests to confirm they fail**

  ```bash
  npx vitest run tests/api/categories.test.ts
  ```

  Expected: new tests fail.

- [ ] **Step 3: Update PATCH to handle parent_id**

  In `app/api/categories/[id]/route.ts`, update the PATCH handler to include `parent_id` in the updatable fields:

  ```typescript
  import { NextRequest } from 'next/server'
  import type { InValue } from '@libsql/client'
  import { db } from '@/lib/db'

  export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
  ) {
    const { id } = await params
    const body = await request.json()
    const { name, type, sort_order, parent_id } = body

    const existing = await db.execute({ sql: 'SELECT id FROM categories WHERE id = ?', args: [id] })
    if (existing.rows.length === 0) {
      return Response.json({ error: 'Category not found' }, { status: 404 })
    }

    const n = new Date().toISOString()
    const updates: string[] = []
    const args: InValue[] = []

    if (name !== undefined) { updates.push('name = ?'); args.push(name) }
    if (type !== undefined) { updates.push('type = ?'); args.push(type) }
    if (sort_order !== undefined) { updates.push('sort_order = ?'); args.push(sort_order) }
    if ('parent_id' in body) { updates.push('parent_id = ?'); args.push(parent_id ?? null) }

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

  Key: use `'parent_id' in body` (not `body.parent_id !== undefined`) so that explicitly passing `null` sets the column to NULL.

- [ ] **Step 4: Run all category tests**

  ```bash
  npx vitest run tests/api/categories.test.ts
  ```

  Expected: all pass.

- [ ] **Step 5: TypeScript check**

  ```bash
  npx tsc --noEmit
  ```

  Expected: no errors.

- [ ] **Step 6: Run full test suite**

  ```bash
  npx vitest run
  ```

  Expected: no regressions.

- [ ] **Step 7: Commit**

  ```bash
  git add app/api/categories/[id]/route.ts tests/api/categories.test.ts
  git commit -m "feat: categories PATCH accepts parent_id"
  ```

---

### Task 5: Open PR 1 and merge

- [ ] **Step 1: Push branch**

  ```bash
  git push -u origin feat/subcategory-schema
  ```

- [ ] **Step 2: Create PR**

  ```bash
  gh pr create --title "feat: subcategory schema - parent_id on categories" --body "$(cat <<'EOF'
  ## Summary
  - Adds `parent_id TEXT REFERENCES categories(id) ON DELETE SET NULL` to categories via /api/migrate
  - Drops `category_id` from tags table (no longer needed - tags are flat labels)
  - Deletes the 'vallow' account that was erroneously inserted
  - Updates Category TypeScript type with `parent_id: string | null`
  - POST /api/categories now accepts optional `parent_id` with existence validation
  - PATCH /api/categories/[id] now accepts `parent_id` (supports setting to null)

  ## Test plan
  - [ ] Run npx vitest run — all tests pass
  - [ ] POST /api/migrate on prod after merge to apply schema changes
  EOF
  )"
  ```

- [ ] **Step 3: Merge the PR**

  ```bash
  gh pr merge --squash --delete-branch
  git checkout main && git pull
  ```

---

## PR 2: Theme (Burnt Orange) + Logo

**Branch:** `git checkout -b feat/burnt-orange-theme origin/main`

The goal is to replace every instance of the old gold (#f0b429, #d4a017, rgba(240,180,41,...)) with burnt orange (#CC5500, #B34700, rgba(204,85,0,...)) across all components, add a working light/dark toggle to the nav bar, and swap the star logo for a trend-chart SVG.

---

### Task 6: Update CSS variables

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: Replace accent color variables**

  Change `globals.css` from:

  ```css
  :root {
    --bg: #0d1117;
    --bg-card: #161b22;
    --border: #30363d;
    --text: #e6edf3;
    --text-muted: #8b949e;
    --accent: #f0b429;
  }

  [data-theme="light"] {
    --bg: #f6f8fa;
    --bg-card: #ffffff;
    --border: #d0d7de;
    --text: #1f2328;
    --text-muted: #636c76;
    --accent: #d4a017;
  }
  ```

  To:

  ```css
  :root {
    --bg: #0d1117;
    --bg-card: #161b22;
    --border: #30363d;
    --text: #e6edf3;
    --text-muted: #8b949e;
    --accent: #CC5500;
  }

  [data-theme="light"] {
    --bg: #f6f8fa;
    --bg-card: #ffffff;
    --border: #d0d7de;
    --text: #1f2328;
    --text-muted: #636c76;
    --accent: #B34700;
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add app/globals.css
  git commit -m "feat: change accent CSS variable to burnt orange #CC5500"
  ```

---

### Task 7: Create ThemeToggle component

**Files:**
- Create: `app/(protected)/components/theme-toggle.tsx`

- [ ] **Step 1: Create the component**

  ```typescript
  'use client'
  import { useEffect, useState } from 'react'

  export function ThemeToggle() {
    const [theme, setTheme] = useState<'dark' | 'light'>('dark')

    useEffect(() => {
      const saved = localStorage.getItem('theme') as 'dark' | 'light' | null
      const initial = saved ?? 'dark'
      setTheme(initial)
      document.documentElement.setAttribute('data-theme', initial)
    }, [])

    function toggle() {
      const next = theme === 'dark' ? 'light' : 'dark'
      setTheme(next)
      document.documentElement.setAttribute('data-theme', next)
      localStorage.setItem('theme', next)
    }

    return (
      <button
        onClick={toggle}
        aria-label="Toggle theme"
        style={{
          background: 'none',
          border: '1px solid #30363d',
          borderRadius: '6px',
          color: '#8b949e',
          cursor: 'pointer',
          padding: '5px 7px',
          lineHeight: 1,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        {theme === 'dark' ? (
          // Sun icon — shown in dark mode to offer switching to light
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="5"/>
            <line x1="12" y1="1" x2="12" y2="3"/>
            <line x1="12" y1="21" x2="12" y2="23"/>
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
            <line x1="1" y1="12" x2="3" y2="12"/>
            <line x1="21" y1="12" x2="23" y2="12"/>
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
          </svg>
        ) : (
          // Moon icon — shown in light mode to offer switching to dark
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
          </svg>
        )}
      </button>
    )
  }
  ```

- [ ] **Step 2: TypeScript check**

  ```bash
  npx tsc --noEmit
  ```

  Expected: no errors.

- [ ] **Step 3: Commit**

  ```bash
  git add app/(protected)/components/theme-toggle.tsx
  git commit -m "feat: add ThemeToggle component (sun/moon)"
  ```

---

### Task 8: Add anti-flash script to root layout + add ThemeToggle to NavBar

**Files:**
- Modify: `app/layout.tsx`
- Modify: `app/(protected)/components/nav-bar.tsx`

- [ ] **Step 1: Update root layout with anti-flash script**

  Replace `app/layout.tsx` contents with:

  ```typescript
  import type { Metadata } from 'next'
  import './globals.css'

  export const metadata: Metadata = {
    title: 'Root OS',
    description: 'Root of All Blessings - Personal finance tracker',
  }

  export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
      <html lang="en">
        <head>
          <script dangerouslySetInnerHTML={{ __html: `(function(){var t=localStorage.getItem('theme');document.documentElement.setAttribute('data-theme',t==='light'?'light':'dark');})();` }} />
        </head>
        <body>{children}</body>
      </html>
    )
  }
  ```

  This runs before React hydrates so users never see a flash of the wrong theme.

- [ ] **Step 2: Add ThemeToggle to nav-bar**

  In `app/(protected)/components/nav-bar.tsx`:

  1. Add import at top: `import { ThemeToggle } from './theme-toggle'`

  2. In the right-side `<div>` (the one that contains the Sign out button), add `<ThemeToggle />` before the Sign out form:

  ```tsx
  {/* Right side */}
  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
    <ThemeToggle />
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
    {/* mobile hamburger remains */}
  ```

- [ ] **Step 3: TypeScript check**

  ```bash
  npx tsc --noEmit
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add app/layout.tsx app/(protected)/components/nav-bar.tsx
  git commit -m "feat: add anti-flash theme script and ThemeToggle to nav bar"
  ```

---

### Task 9: Replace all gold (#f0b429) with burnt orange (#CC5500) in nav-bar.tsx

**Files:**
- Modify: `app/(protected)/components/nav-bar.tsx`

- [ ] **Step 1: Replace all gold colors**

  In `nav-bar.tsx`, make these replacements (search for each one):

  | Old value | New value |
  |-----------|-----------|
  | `'#f0b429'` | `'#CC5500'` |
  | `rgba(240,180,41,0.08)` | `rgba(204,85,0,0.08)` |
  | `linear-gradient(135deg, #f0b429 0%, #d4a017 100%)` | `linear-gradient(135deg, #CC5500 0%, #A34400 100%)` |

  Specifically:
  - `tabStyle` function: active color `'#f0b429'` → `'#CC5500'`, active background `rgba(240,180,41,0.08)` → `rgba(204,85,0,0.08)`
  - Logo div background gradient: update both stops
  - Sub-menu active link color: `'#f0b429'` → `'#CC5500'`
  - Mobile active color: `'#f0b429'` → `'#CC5500'`
  - Mobile active border: `'#f0b429'` → `'#CC5500'`
  - Dropdown chevron button color: `'#f0b429'` → `'#CC5500'`

- [ ] **Step 2: Replace the star SVG with a trend-chart SVG**

  Find the logo SVG (currently a star path):
  ```tsx
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
    <path d="M12 2L8 8H4l4 4-2 6 6-3 6 3-2-6 4-4h-4L12 2z" fill="white" opacity="0.9" />
  </svg>
  ```

  Replace with an upward trend chart SVG:
  ```tsx
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3,17 8,12 12,14 18,7 21,10"/>
    <polyline points="18,7 21,7 21,10"/>
  </svg>
  ```

- [ ] **Step 3: TypeScript check**

  ```bash
  npx tsc --noEmit
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add app/(protected)/components/nav-bar.tsx
  git commit -m "feat: replace gold with burnt orange and star with trend chart in nav bar"
  ```

---

### Task 10: Replace gold colors in expense-dashboard.tsx

**Files:**
- Modify: `app/(protected)/components/expense-dashboard.tsx`

- [ ] **Step 1: Replace all gold color references**

  Find and replace every gold color:

  | Old | New |
  |-----|-----|
  | `'#f0b429'` | `'#CC5500'` |
  | `rgba(240,180,41,0.12)` | `rgba(204,85,0,0.12)` |

  Specifically in the range-selector buttons:
  - `border: range === r.id ? '1px solid #f0b429'` → `'1px solid #CC5500'`
  - `background: range === r.id ? 'rgba(240,180,41,0.12)'` → `'rgba(204,85,0,0.12)'`
  - `color: range === r.id ? '#f0b429'` → `'#CC5500'`

  In the category breakdown bar:
  - `background: '#f0b429'` → `'#CC5500'`

- [ ] **Step 2: Commit**

  ```bash
  git add app/(protected)/components/expense-dashboard.tsx
  git commit -m "feat: replace gold with burnt orange in expense dashboard"
  ```

---

### Task 11: Replace gold colors in wheres-my-money.tsx

**Files:**
- Modify: `app/(protected)/components/wheres-my-money.tsx`

- [ ] **Step 1: Find all gold references**

  Run: `grep -n "#f0b429\|rgba(240,180" app/(protected)/components/wheres-my-money.tsx`

  Replace each occurrence:
  - `#f0b429` → `#CC5500`
  - `rgba(240,180,41,` → `rgba(204,85,0,`
  - `#d4a017` → `#A34400` (if present)

  Common locations:
  - Type pill buttons (active state background/border/color)
  - Tag pill buttons (selected state)
  - Primary action buttons
  - Focus borders (look for `#f0b429` in onFocus handlers)

- [ ] **Step 2: Commit**

  ```bash
  git add app/(protected)/components/wheres-my-money.tsx
  git commit -m "feat: replace gold with burnt orange in WMM form"
  ```

---

### Task 12: Replace gold colors in all remaining files

**Files:**
- Modify: `app/(protected)/accounts/page.tsx`
- Modify: `app/(protected)/categories/page.tsx`
- Modify: `app/(protected)/transactions/page.tsx`
- Modify: `app/(protected)/tags/page.tsx`
- Modify: `app/(protected)/components/recent-transactions.tsx`
- Modify: `app/login/login-form.tsx`

- [ ] **Step 1: Do a global search for gold colors**

  ```bash
  grep -rn "#f0b429\|rgba(240,180\|#d4a017\|f0b429\|linear-gradient.*d4a017" app/ --include="*.tsx" --include="*.ts" --include="*.css"
  ```

  Work through each file. Replace:
  - `#f0b429` → `#CC5500`
  - `rgba(240,180,41,` → `rgba(204,85,0,`
  - `#d4a017` → `#A34400`
  - In gradients: `linear-gradient(135deg, #f0b429 0%, #d4a017 100%)` → `linear-gradient(135deg, #CC5500 0%, #A34400 100%)`

  **In each page file**, the pattern is:
  - `BTN_PRI = { ...BTN, background: '#f0b429', color: '#0d1117' }` → `background: '#CC5500'`
  - `borderColor: '#f0b429'` → `'#CC5500'`

  **In accounts/page.tsx specifically:**
  - The "new account" form card has `borderColor: '#f0b429'` on the card border when open → `'#CC5500'`

  **In login-form.tsx:**
  - Logo gradient: `linear-gradient(135deg, #f0b429 0%, #d4a017 100%)` → burnt orange
  - Star SVG → trend chart SVG (same SVG from Task 9)
  - Submit button background: `#f0b429` → `#CC5500`
  - Input focus border: `#f0b429` → `#CC5500`

- [ ] **Step 2: Verify no gold colors remain**

  ```bash
  grep -rn "#f0b429\|rgba(240,180\|#d4a017" app/ --include="*.tsx" --include="*.ts" --include="*.css"
  ```

  Expected: no matches.

- [ ] **Step 3: TypeScript check**

  ```bash
  npx tsc --noEmit
  ```

- [ ] **Step 4: Run tests**

  ```bash
  npx vitest run
  ```

  Expected: all pass.

- [ ] **Step 5: Commit**

  ```bash
  git add app/(protected)/accounts/page.tsx app/(protected)/categories/page.tsx \
          app/(protected)/transactions/page.tsx app/(protected)/tags/page.tsx \
          app/(protected)/components/recent-transactions.tsx app/login/login-form.tsx
  git commit -m "feat: replace gold with burnt orange in all remaining components"
  ```

---

### Task 13: Open PR 2 and merge

- [ ] **Step 1: Push and create PR**

  ```bash
  git push -u origin feat/burnt-orange-theme
  gh pr create --title "feat: burnt orange theme + light/dark toggle + trend logo" --body "$(cat <<'EOF'
  ## Summary
  - Replaces all #f0b429 gold accent with #CC5500 burnt orange across every component
  - Adds ThemeToggle (sun/moon) to nav bar; stores preference in localStorage
  - Anti-flash script in root layout sets data-theme before React hydrates
  - Swaps star icon for an upward trend-chart SVG in nav bar and login page

  ## Test plan
  - [ ] All vitest tests pass
  - [ ] Dark mode: burnt orange accents visible on buttons, bars, active tabs
  - [ ] Light mode: toggle works, white background, dark text, burnt orange accent
  - [ ] Preference persists on page refresh (check localStorage key "theme")
  EOF
  )"
  ```

- [ ] **Step 2: Merge**

  ```bash
  gh pr merge --squash --delete-branch
  git checkout main && git pull
  ```

---

## PR 3: Categories Page Overhaul + Dashboard Subcategory Drilldown

**Branch:** `git checkout -b feat/categories-overhaul origin/main`

---

### Task 14: Categories page — remove reorder arrows, add sort and search

**Files:**
- Modify: `app/(protected)/categories/page.tsx`

- [ ] **Step 1: Remove reorder state and functions**

  Remove these from the component:
  - `const [movingId, setMovingId] = useState<string | null>(null)` state
  - The entire `move()` async function
  - `const BTN_ICON = ...` constant (only used for arrows)

- [ ] **Step 2: Add sort and search state**

  Add these state declarations:

  ```typescript
  type SortBy = 'name-asc' | 'name-desc' | 'volume-desc' | 'volume-asc'
  const [sortBy, setSortBy] = useState<SortBy>('name-asc')
  const [search, setSearch] = useState('')
  ```

- [ ] **Step 3: Update the `visible` computation**

  Replace the current `visible` computed value with:

  ```typescript
  const visible = categories
    .filter(c => c.type === tab && c.parent_id == null)
    .filter(c => !search.trim() || c.name.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'name-asc') return a.name.localeCompare(b.name)
      if (sortBy === 'name-desc') return b.name.localeCompare(a.name)
      if (sortBy === 'volume-desc') return b.tx_count - a.tx_count
      if (sortBy === 'volume-asc') return a.tx_count - b.tx_count
      return 0
    })

  const subcatsByParent = new Map<string, CategoryWithCount[]>()
  for (const c of categories.filter(x => x.type === tab && x.parent_id != null)) {
    if (!subcatsByParent.has(c.parent_id!)) subcatsByParent.set(c.parent_id!, [])
    subcatsByParent.get(c.parent_id!)!.push(c)
  }
  ```

- [ ] **Step 4: Update the create form to include parent picker**

  In the create form section, add a parent picker dropdown below the name input:

  ```tsx
  {showCreate && (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <input
          style={{ ...INPUT, flex: 1 }}
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder={`New ${tab} category name`}
          onKeyDown={e => e.key === 'Enter' && createCategory()}
          autoFocus
        />
        <button style={BTN_PRI} onClick={createCategory} disabled={creating}>
          {creating ? 'Adding...' : 'Add'}
        </button>
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <label style={{ color: '#8b949e', fontSize: '0.8rem', flexShrink: 0 }}>Parent (optional):</label>
        <select
          style={{ ...SELECT, flex: 1 }}
          value={newParentId}
          onChange={e => setNewParentId(e.target.value)}
        >
          <option value="">None (top-level)</option>
          {categories.filter(c => c.type === tab && c.parent_id == null).map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
    </div>
  )}
  ```

  Add `const [newParentId, setNewParentId] = useState('')` to state.

  Update `createCategory()` to include `parent_id: newParentId || null` in the POST body, and reset `setNewParentId('')` after success.

- [ ] **Step 5: Update the edit form to include parent picker**

  Add `const [editParentId, setEditParentId] = useState<string | null>(null)` to state.

  Update `startEdit()`:
  ```typescript
  function startEdit(c: CategoryWithCount) {
    setEditingId(c.id)
    setEditName(c.name)
    setEditType(c.type as Tab)
    setEditParentId(c.parent_id ?? null)
  }
  ```

  In the edit form JSX, add parent picker after the type select:
  ```tsx
  <select
    style={{ ...SELECT, width: 'auto' }}
    value={editParentId ?? ''}
    onChange={e => setEditParentId(e.target.value || null)}
  >
    <option value="">None (top-level)</option>
    {categories
      .filter(c => c.type === editType && c.parent_id == null && c.id !== editingId)
      .map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
  </select>
  ```

  Update `saveEdit()` to include `parent_id: editParentId` in the PATCH body.

- [ ] **Step 6: Update CategoryWithCount type**

  At the top of the file, update the type to include parent_id:
  ```typescript
  type CategoryWithCount = Category & { tx_count: number }
  ```

  This already inherits `parent_id` from `Category` (updated in PR 1).

- [ ] **Step 7: Replace the render section to show sort, search, and nested hierarchy**

  Replace the section between the tabs and the end of the component with:

  ```tsx
  {/* Sort + search controls */}
  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
    <input
      style={{ ...INPUT, flex: '1 1 180px', minWidth: '0' }}
      value={search}
      onChange={e => setSearch(e.target.value)}
      placeholder="Search categories..."
    />
    <select
      style={{ ...SELECT, flex: '0 0 auto', width: 'auto' }}
      value={sortBy}
      onChange={e => setSortBy(e.target.value as SortBy)}
    >
      <option value="name-asc">Name A-Z</option>
      <option value="name-desc">Name Z-A</option>
      <option value="volume-desc">Volume high-low</option>
      <option value="volume-asc">Volume low-high</option>
    </select>
  </div>

  {loading ? (
    <p style={{ color: '#8b949e', margin: 0 }}>Loading...</p>
  ) : visible.length === 0 ? (
    <p style={{ color: '#8b949e', margin: 0 }}>No {tab} categories{search ? ' match.' : ' yet.'}</p>
  ) : (
    visible.map(c => (
      <React.Fragment key={c.id}>
        {/* Top-level category card */}
        <div style={CARD}>
          {editingId === c.id ? (
            /* ... existing edit form, updated with parent picker ... */
          ) : (
            <>
              <div style={{ flex: 1 }}>
                <span style={{ color: '#e6edf3', fontWeight: 500 }}>{c.name}</span>
                <span style={{ fontSize: '0.78rem', color: '#8b949e', marginLeft: '0.6rem' }}>
                  {c.tx_count} transaction{c.tx_count !== 1 ? 's' : ''}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <button style={BTN_SEC} onClick={() => startEdit(c)}>Edit</button>
                <button
                  style={BTN_DNG}
                  onClick={() => deleteCategory(c)}
                  disabled={deletingId === c.id}
                  title={c.tx_count > 0 ? `${c.tx_count} transactions use this category` : 'Delete'}
                >
                  {deletingId === c.id ? '...' : 'Delete'}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Subcategories — indented */}
        {(subcatsByParent.get(c.id) ?? []).map(sub => (
          <div key={sub.id} style={{ ...CARD, marginLeft: '1.5rem', background: '#0d1117', borderStyle: 'dashed' }}>
            {editingId === sub.id ? (
              /* same edit form */
            ) : (
              <>
                <div style={{ flex: 1 }}>
                  <span style={{ color: '#c9d1d9', fontWeight: 400, fontSize: '0.9rem' }}>{sub.name}</span>
                  <span style={{ fontSize: '0.75rem', color: '#8b949e', marginLeft: '0.6rem' }}>
                    {sub.tx_count} transaction{sub.tx_count !== 1 ? 's' : ''}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <button style={BTN_SEC} onClick={() => startEdit(sub)}>Edit</button>
                  <button style={BTN_DNG} onClick={() => deleteCategory(sub)} disabled={deletingId === sub.id}>
                    {deletingId === sub.id ? '...' : 'Delete'}
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </React.Fragment>
    ))
  )}
  ```

  Add `import React from 'react'` at the top if not already present (needed for React.Fragment).

- [ ] **Step 8: TypeScript check**

  ```bash
  npx tsc --noEmit
  ```

- [ ] **Step 9: Commit**

  ```bash
  git add app/(protected)/categories/page.tsx
  git commit -m "feat: categories page - remove arrows, add sort/search/parent-picker/nested display"
  ```

---

### Task 15: Dashboard API — add subcategory drilldown endpoint

**Files:**
- Modify: `app/api/dashboard/route.ts`
- Modify: `tests/api/dashboard.test.ts`

- [ ] **Step 1: Write a failing test for the drilldown**

  In `tests/api/dashboard.test.ts`, add:

  ```typescript
  it('returns subcategory breakdown when parent_category_id is provided', async () => {
    seedAccount('a1', 'DBS', 'bank')
    seedCategory('parent1', 'Food', 'expense')
    seedCategory('sub1', 'Groceries', 'expense')
    seedCategory('sub2', 'Dining', 'expense')
    // Set parent_id on sub1 and sub2 — do directly in testDb
    // (The seedCategory helper doesn't support parent_id; set it manually)
    // Access testDb via the wireDbMock pattern... 
    // Instead, seed using POST which goes through the route:
    // Actually just use the PATCH route to set parent_id after seeding
    const { PATCH } = await import('@/app/api/categories/[id]/route')
    await PATCH(req('/api/categories/sub1', 'PATCH', { parent_id: 'parent1' }), { params: Promise.resolve({ id: 'sub1' }) })
    await PATCH(req('/api/categories/sub2', 'PATCH', { parent_id: 'parent1' }), { params: Promise.resolve({ id: 'sub2' }) })
    
    seedTransaction('t1', 'a1', { type: 'expense', amount: 50, categoryId: 'sub1', datetime: new Date().toISOString() })
    seedTransaction('t2', 'a1', { type: 'expense', amount: 30, categoryId: 'sub2', datetime: new Date().toISOString() })

    const { GET } = await import('@/app/api/dashboard/route')
    const res = await GET(req('/api/dashboard?range=monthly&parent_category_id=parent1'))
    const data = await res.json()
    expect(data.category_breakdown).toHaveLength(2)
    const names = data.category_breakdown.map((x: { category_name: string }) => x.category_name)
    expect(names).toContain('Groceries')
    expect(names).toContain('Dining')
  })
  ```

- [ ] **Step 2: Run tests to confirm failure**

  ```bash
  npx vitest run tests/api/dashboard.test.ts
  ```

  Expected: new test fails.

- [ ] **Step 3: Update the dashboard API to support parent_category_id**

  In `app/api/dashboard/route.ts`, update the GET handler. After the range calculation, add the parent_category_id param and modify the category breakdown query:

  ```typescript
  export async function GET(request: NextRequest) {
    const p = request.nextUrl.searchParams
    const range = p.get('range') ?? 'monthly'
    const parentCategoryId = p.get('parent_category_id')

    if (!VALID_RANGES.includes(range as Range)) {
      return Response.json({ error: 'range must be daily, 7day, monthly, or custom' }, { status: 400 })
    }

    const [startDate, endDate, daysInRange] = getRangeDates(
      range as Range,
      p.get('start'),
      p.get('end'),
    )

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
      parentCategoryId
        ? db.execute({
            sql: `SELECT c.name as category_name,
                         COALESCE(SUM(CASE WHEN t.currency = 'SGD' THEN t.amount ELSE COALESCE(t.sgd_equivalent, t.amount) END), 0) as total
                  FROM transactions t
                  LEFT JOIN categories c ON t.category_id = c.id
                  WHERE t.type = 'expense' AND t.datetime >= ? AND t.datetime <= ?
                    AND c.parent_id = ?
                  GROUP BY t.category_id, c.name
                  ORDER BY total DESC`,
            args: [startDate, endDate, parentCategoryId],
          })
        : db.execute({
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

- [ ] **Step 4: Run tests**

  ```bash
  npx vitest run tests/api/dashboard.test.ts
  ```

  Expected: all pass.

- [ ] **Step 5: Commit**

  ```bash
  git add app/api/dashboard/route.ts tests/api/dashboard.test.ts
  git commit -m "feat: dashboard API supports parent_category_id drilldown param"
  ```

---

### Task 16: ExpenseDashboard — clickable category rows with subcategory drilldown

**Files:**
- Modify: `app/(protected)/components/expense-dashboard.tsx`

- [ ] **Step 1: Add drilldown state**

  Add to the component state:

  ```typescript
  const [expandedCategoryId, setExpandedCategoryId] = useState<string | null>(null)
  const [expandedCategoryName, setExpandedCategoryName] = useState<string>('')
  const [drillData, setDrillData] = useState<CategoryEntry[] | null>(null)
  const [drillLoading, setDrillLoading] = useState(false)
  ```

- [ ] **Step 2: Add drilldown fetch function**

  ```typescript
  async function drillInto(categoryName: string, categoryId: string | null) {
    if (!categoryId || expandedCategoryId === categoryId) {
      setExpandedCategoryId(null)
      setDrillData(null)
      return
    }
    setExpandedCategoryId(categoryId)
    setExpandedCategoryName(categoryName)
    setDrillLoading(true)
    try {
      let url = `/api/dashboard?range=${range}&parent_category_id=${categoryId}`
      if (range === 'custom' && customStart && customEnd) {
        url += `&start=${encodeURIComponent(customStart + 'T00:00:00+08:00')}&end=${encodeURIComponent(customEnd + 'T23:59:59+08:00')}`
      }
      const res = await fetch(url)
      const d = await res.json()
      setDrillData(d.category_breakdown ?? [])
    } catch {
      setDrillData(null)
    } finally {
      setDrillLoading(false)
    }
  }
  ```

  The `categoryId` is not currently in the API response — we need the category ID to drill down. However, the current dashboard API returns `category_name` but not `category_id`. We have two options:
  - Add `category_id` to the dashboard API response
  - Use the category name to look up the ID

  **Simplest**: update the dashboard API to also return `category_id` in each breakdown entry.

- [ ] **Step 3: Update dashboard API to return category_id**

  In `app/api/dashboard/route.ts`, update the breakdown map:

  ```typescript
  const categoryBreakdown = catResult.rows.map((r) => ({
    category_id: (r.category_id as string | null) ?? null,
    category_name: (r.category_name as string | null) ?? 'Uncategorised',
    total: Number(r.total),
    pct: totalSpend > 0 ? Math.round((Number(r.total) / totalSpend) * 1000) / 10 : 0,
  }))
  ```

  And update the SELECT to include `t.category_id` in both query variants:

  ```sql
  SELECT t.category_id,
         c.name as category_name,
         COALESCE(SUM(...)) as total
  FROM transactions t
  ...
  GROUP BY t.category_id, c.name
  ```

- [ ] **Step 4: Update CategoryEntry type in expense-dashboard.tsx**

  ```typescript
  interface CategoryEntry {
    category_id: string | null
    category_name: string
    total: number
    pct: number
  }
  ```

- [ ] **Step 5: Update the category breakdown render to be clickable**

  Replace the breakdown render section with:

  ```tsx
  {!loading && data && data.category_breakdown.length > 0 && (
    <div>
      <div style={{ ...labelStyle, marginBottom: '8px' }}>Top Expenses</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
        {data.category_breakdown.slice(0, 6).map((cat) => {
          const isExpanded = expandedCategoryId === cat.category_id
          return (
            <div key={cat.category_name}>
              {/* Main category row */}
              <div
                onClick={() => drillInto(cat.category_name, cat.category_id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '5px 0',
                  cursor: cat.category_id ? 'pointer' : 'default',
                  borderRadius: '4px',
                }}
              >
                <span style={{ color: '#e6edf3', fontSize: '13px', minWidth: '100px' }}>{cat.category_name}</span>
                <div style={{ flex: 1, background: '#21262d', borderRadius: '4px', height: '6px', overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(100, cat.pct)}%`, height: '100%', background: '#CC5500', borderRadius: '4px' }} />
                </div>
                <span style={{ color: '#8b949e', fontSize: '12px', minWidth: '48px', textAlign: 'right' }}>
                  {fmt(cat.total)}
                </span>
                <span style={{ color: '#484f58', fontSize: '11px', minWidth: '38px', textAlign: 'right' }}>
                  {cat.pct.toFixed(1)}%
                </span>
                {cat.category_id && (
                  <span style={{ color: '#484f58', fontSize: '11px', flexShrink: 0 }}>{isExpanded ? '▲' : '▼'}</span>
                )}
              </div>

              {/* Subcategory drilldown rows - flush left, no extra indent */}
              {isExpanded && (
                <div style={{ marginBottom: '4px' }}>
                  {drillLoading ? (
                    <div style={{ color: '#8b949e', fontSize: '12px', padding: '4px 0' }}>Loading...</div>
                  ) : !drillData || drillData.length === 0 ? (
                    <div style={{ color: '#484f58', fontSize: '12px', padding: '4px 0' }}>No subcategories</div>
                  ) : (
                    drillData.map(sub => (
                      <div key={sub.category_name} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '3px 0' }}>
                        <span style={{ color: '#8b949e', fontSize: '12px', minWidth: '100px' }}>{sub.category_name}</span>
                        <div style={{ flex: 1, background: '#21262d', borderRadius: '4px', height: '4px', overflow: 'hidden' }}>
                          <div style={{ width: `${Math.min(100, sub.pct)}%`, height: '100%', background: '#CC550080', borderRadius: '4px' }} />
                        </div>
                        <span style={{ color: '#8b949e', fontSize: '12px', minWidth: '48px', textAlign: 'right' }}>{fmt(sub.total)}</span>
                        <span style={{ color: '#484f58', fontSize: '11px', minWidth: '38px', textAlign: 'right' }}>{sub.pct.toFixed(1)}%</span>
                        <span style={{ width: '16px', flexShrink: 0 }} />
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )}
  ```

- [ ] **Step 6: TypeScript check**

  ```bash
  npx tsc --noEmit
  ```

- [ ] **Step 7: Commit**

  ```bash
  git add app/(protected)/components/expense-dashboard.tsx app/api/dashboard/route.ts
  git commit -m "feat: clickable category drilldown shows subcategories in expense dashboard"
  ```

---

### Task 17: Open PR 3 and merge

- [ ] **Step 1: Run full test suite**

  ```bash
  npx vitest run
  ```

  Expected: all pass.

- [ ] **Step 2: Push and create PR**

  ```bash
  git push -u origin feat/categories-overhaul
  gh pr create --title "feat: categories overhaul + dashboard drilldown" --body "$(cat <<'EOF'
  ## Summary
  - Categories page: removes up/down reorder arrows
  - Categories page: adds Sort By (name A-Z/Z-A, volume high/low) dropdown
  - Categories page: adds search bar to filter by name
  - Categories page: adds parent picker when creating/editing a category
  - Categories page: shows subcategories nested under their parent (dashed border, indented)
  - Dashboard API: new optional `parent_category_id` param returns subcategory breakdown
  - Dashboard API: breakdown now includes `category_id` for drilldown
  - ExpenseDashboard: clicking a category row expands it to show subcategories inline

  ## Test plan
  - [ ] All vitest tests pass
  - [ ] Create an expense category, create a subcategory with it as parent - both appear in hierarchy
  - [ ] Dashboard: click a parent category - subcategories appear inline below it
  - [ ] Sort and search work correctly on categories page
  EOF
  )"
  ```

- [ ] **Step 3: Merge**

  ```bash
  gh pr merge --squash --delete-branch
  git checkout main && git pull
  ```

---

## PR 4: Transactions Page Fixes + Account Dropdowns + Bulk Operations

**Branch:** `git checkout -b feat/transactions-improvements origin/main`

---

### Task 18: Fix URL params reading on transactions page

**Files:**
- Modify: `app/(protected)/transactions/page.tsx`

The bug: navigating to `/transactions?category_id=X&account_id=Y` doesn't pre-populate the filters because the component initialises `filters` with empty strings and never reads the URL.

- [ ] **Step 1: Add URL param reading on mount**

  In the component, split the existing `useEffect` for loading master data (accounts/categories/tags) so that URL params are read alongside it:

  ```typescript
  useEffect(() => {
    // Read URL params on mount and apply to initial filter state
    const sp = new URLSearchParams(window.location.search)
    const urlFilters: Partial<Filters> = {}
    const catId = sp.get('category_id')
    const acctId = sp.get('account_id')
    const tagId = sp.get('tag_id')
    const txType = sp.get('type')
    if (catId) urlFilters.categoryId = catId
    if (acctId) urlFilters.accountId = acctId
    if (tagId) urlFilters.tagId = tagId
    if (txType && ['expense', 'income', 'transfer', ''].includes(txType)) {
      urlFilters.type = txType as Filters['type']
    }
    if (Object.keys(urlFilters).length > 0) {
      setFilters(prev => ({ ...prev, ...urlFilters }))
      setShowFilters(true) // open filter panel so user can see active filters
    }

    Promise.all([
      fetch('/api/accounts').then((r) => r.json()),
      fetch('/api/categories').then((r) => r.json()),
      fetch('/api/tags').then((r) => r.json()),
    ]).then(([accts, cats, tgs]) => {
      setAccounts(accts)
      setCategories(cats)
      setTags(tgs)
    })
  }, [])
  ```

  This uses `window.location.search` (safe in a `'use client'` component) instead of `useSearchParams()`, avoiding the need for a Suspense boundary.

- [ ] **Step 2: TypeScript check**

  ```bash
  npx tsc --noEmit
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add app/(protected)/transactions/page.tsx
  git commit -m "fix: read URL search params on mount to pre-populate transaction filters"
  ```

---

### Task 19: Add search bar and sort to transactions page + API

**Files:**
- Modify: `app/(protected)/transactions/page.tsx`
- Modify: `app/api/transactions/route.ts`
- Modify: `tests/api/transactions.test.ts`

- [ ] **Step 1: Write failing tests for search and sort**

  In `tests/api/transactions.test.ts`, add:

  ```typescript
  describe('GET /api/transactions - search and sort', () => {
    it('filters by search term matching payee', async () => {
      seedAccount('a1', 'DBS', 'bank')
      seedTransaction('t1', 'a1', { payee: 'NTUC FairPrice', type: 'expense' })
      seedTransaction('t2', 'a1', { payee: 'Grab', type: 'expense' })
      const { GET } = await import('@/app/api/transactions/route')
      const res = await GET(req('/api/transactions?search=NTUC'))
      const data = await res.json()
      expect(data.data).toHaveLength(1)
      expect(data.data[0].payee).toBe('NTUC FairPrice')
    })

    it('sorts by amount descending', async () => {
      seedAccount('a1', 'DBS', 'bank')
      seedTransaction('t1', 'a1', { amount: 10, type: 'expense' })
      seedTransaction('t2', 'a1', { amount: 50, type: 'expense' })
      seedTransaction('t3', 'a1', { amount: 25, type: 'expense' })
      const { GET } = await import('@/app/api/transactions/route')
      const res = await GET(req('/api/transactions?sort=amount-desc'))
      const data = await res.json()
      expect(data.data[0].amount).toBe(50)
      expect(data.data[1].amount).toBe(25)
      expect(data.data[2].amount).toBe(10)
    })
  })
  ```

- [ ] **Step 2: Run tests to confirm failure**

  ```bash
  npx vitest run tests/api/transactions.test.ts
  ```

- [ ] **Step 3: Update /api/transactions GET to support search and sort**

  In `app/api/transactions/route.ts`, update the GET handler:

  ```typescript
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
    const search = p.get('search')
    const sort = p.get('sort') ?? 'date-desc'

    const ORDER_MAP: Record<string, string> = {
      'date-desc': 't.datetime DESC',
      'date-asc': 't.datetime ASC',
      'amount-desc': 'COALESCE(t.sgd_equivalent, t.amount) DESC',
      'amount-asc': 'COALESCE(t.sgd_equivalent, t.amount) ASC',
      'payee-asc': "COALESCE(t.payee, '') ASC, t.datetime DESC",
    }
    const orderClause = ORDER_MAP[sort] ?? 't.datetime DESC'

    const where: string[] = []
    const args: InValue[] = []

    if (type) { where.push('t.type = ?'); args.push(type) }
    if (account_id) { where.push('(t.account_id = ? OR t.to_account_id = ?)'); args.push(account_id, account_id) }
    if (category_id) { where.push('t.category_id = ?'); args.push(category_id) }
    if (start) { where.push('t.datetime >= ?'); args.push(start) }
    if (end) { where.push('t.datetime <= ?'); args.push(end) }
    if (tag_id) {
      where.push('EXISTS (SELECT 1 FROM transaction_tags tt WHERE tt.transaction_id = t.id AND tt.tag_id = ?)')
      args.push(tag_id)
    }
    if (search) {
      where.push('(t.payee LIKE ? OR t.note LIKE ? OR c.name LIKE ?)')
      args.push(`%${search}%`, `%${search}%`, `%${search}%`)
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''

    const countResult = await db.execute({
      sql: `SELECT COUNT(*) as total FROM transactions t LEFT JOIN categories c ON t.category_id = c.id ${whereClause}`,
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
            ORDER BY ${orderClause}
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
      const tagMap = new Map<string, Tag[]>()
      for (const row of tagResult.rows) {
        const txId = row.transaction_id as string
        if (!tagMap.has(txId)) tagMap.set(txId, [])
        tagMap.get(txId)!.push({ id: row.id as string, name: row.name as string, created_at: '' })
      }
      for (const row of rows) {
        row.tags = tagMap.get(row.id) ?? []
      }
    }

    return Response.json({ data: rows, total, page, limit })
  }
  ```

  Note: The COUNT query now also joins categories so `c.name LIKE ?` works in the WHERE clause.

- [ ] **Step 4: Run tests**

  ```bash
  npx vitest run tests/api/transactions.test.ts
  ```

  Expected: all pass.

- [ ] **Step 5: Add search + sort UI to transactions page**

  In the filters panel in `app/(protected)/transactions/page.tsx`:

  1. Add state: `const [search, setSearch] = useState('')` and `const [sortBy, setSortBy] = useState('date-desc')`

  2. Add search to the `load()` URLSearchParams:
     ```typescript
     if (search) p.set('search', search)
     if (sortBy !== 'date-desc') p.set('sort', sortBy)
     ```

  3. Add `search` and `sortBy` to the `useCallback` deps array.

  4. Add a search input above the filters panel (always visible, not inside the collapsible section):
     ```tsx
     {/* Search + sort bar */}
     <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
       <input
         style={{ ...INPUT, flex: '1 1 200px', minWidth: 0 }}
         value={search}
         onChange={e => { setSearch(e.target.value); setPage(1) }}
         placeholder="Search payee, note, category..."
       />
       <select
         style={{ ...SELECT, flex: '0 0 auto', width: 'auto' }}
         value={sortBy}
         onChange={e => { setSortBy(e.target.value); setPage(1) }}
       >
         <option value="date-desc">Date: newest first</option>
         <option value="date-asc">Date: oldest first</option>
         <option value="amount-desc">Amount: high to low</option>
         <option value="amount-asc">Amount: low to high</option>
         <option value="payee-asc">Payee A-Z</option>
       </select>
     </div>
     ```

  5. In the Clear filters button handler, also reset search and sortBy:
     ```typescript
     setSearch('')
     setSortBy('date-desc')
     ```

- [ ] **Step 6: TypeScript check + tests**

  ```bash
  npx tsc --noEmit && npx vitest run
  ```

- [ ] **Step 7: Commit**

  ```bash
  git add app/(protected)/transactions/page.tsx app/api/transactions/route.ts tests/api/transactions.test.ts
  git commit -m "feat: transactions - search bar, sort by, and URL param reading"
  ```

---

### Task 20: Account dropdown grouping (optgroup) everywhere

**Files:**
- Modify: `app/(protected)/components/wheres-my-money.tsx`
- Modify: `app/(protected)/transactions/page.tsx`

- [ ] **Step 1: Create a reusable AccountOptions component**

  This is a tiny helper that can live in the same file where first used. Define it near the top of `wheres-my-money.tsx`:

  ```typescript
  const ACCOUNT_TYPE_ORDER = ['bank', 'wallet', 'cash', 'fund'] as const
  const ACCOUNT_TYPE_LABELS: Record<string, string> = { bank: 'Bank', wallet: 'Wallet', cash: 'Cash', fund: 'Fund' }

  function AccountOptions({ accounts }: { accounts: Account[] }) {
    const groups = Object.fromEntries(ACCOUNT_TYPE_ORDER.map(t => [t, [] as Account[]]))
    for (const a of accounts) {
      if (groups[a.type]) groups[a.type].push(a)
    }
    return (
      <>
        {ACCOUNT_TYPE_ORDER.filter(t => groups[t].length > 0).map(type => (
          <optgroup key={type} label={ACCOUNT_TYPE_LABELS[type]}>
            {groups[type].map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </optgroup>
        ))}
      </>
    )
  }
  ```

- [ ] **Step 2: Apply AccountOptions in WMM form**

  In `wheres-my-money.tsx`, find the Account selector `<select>`:
  ```tsx
  {accounts.filter(a => a.is_active === 1).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
  ```

  Replace with:
  ```tsx
  <AccountOptions accounts={accounts.filter(a => a.is_active === 1)} />
  ```

  Do the same for the "To Account" selector.

- [ ] **Step 3: Apply AccountOptions in transactions edit form**

  Copy the `AccountOptions` function and `ACCOUNT_TYPE_ORDER`/`ACCOUNT_TYPE_LABELS` constants into `transactions/page.tsx` (or extract to a shared file if you prefer — but keep it simple, inline is fine).

  In the inline edit form, replace:
  ```tsx
  {activeAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
  ```
  with `<AccountOptions accounts={activeAccounts} />` in both the from-account and to-account selectors.

- [ ] **Step 4: TypeScript check**

  ```bash
  npx tsc --noEmit
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add app/(protected)/components/wheres-my-money.tsx app/(protected)/transactions/page.tsx
  git commit -m "feat: group accounts by type using optgroup in all account dropdowns"
  ```

---

### Task 21: Bulk operations on transactions page

**Files:**
- Modify: `app/(protected)/transactions/page.tsx`

- [ ] **Step 1: Add bulk selection state**

  Add state declarations:

  ```typescript
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkAccountId, setBulkAccountId] = useState('')
  const [bulkCategoryId, setBulkCategoryId] = useState('')
  const [bulkType, setBulkType] = useState<'' | TxType>('')
  const [bulkAddTagId, setBulkAddTagId] = useState('')
  const [bulkRemoveTagId, setBulkRemoveTagId] = useState('')
  ```

- [ ] **Step 2: Add selection toggle helpers**

  ```typescript
  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    if (selected.size === transactions.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(transactions.map(t => t.id)))
    }
  }
  ```

- [ ] **Step 3: Add bulk action helpers**

  ```typescript
  async function bulkPatch(patch: object) {
    setBulkLoading(true)
    const selectedTxs = transactions.filter(t => selected.has(t.id))
    try {
      await Promise.all(selectedTxs.map(tx =>
        fetch(`/api/transactions/${tx.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        })
      ))
      showToast(`Updated ${selectedTxs.length} transaction${selectedTxs.length !== 1 ? 's' : ''}`, 'success')
      setSelected(new Set())
      load()
    } catch {
      showToast('Some updates failed', 'error')
    } finally {
      setBulkLoading(false)
    }
  }

  async function bulkApplyAccount() {
    if (!bulkAccountId) return
    await bulkPatch({ account_id: bulkAccountId })
    setBulkAccountId('')
  }

  async function bulkApplyCategory() {
    if (!bulkCategoryId) return
    await bulkPatch({ category_id: bulkCategoryId || null })
    setBulkCategoryId('')
  }

  async function bulkApplyType() {
    if (!bulkType) return
    await bulkPatch({ type: bulkType })
    setBulkType('')
  }

  async function bulkApplyAddTag() {
    if (!bulkAddTagId) return
    setBulkLoading(true)
    const selectedTxs = transactions.filter(t => selected.has(t.id))
    try {
      await Promise.all(selectedTxs.map(tx => {
        const newTagIds = [...new Set([...tx.tags.map(t => t.id), bulkAddTagId])]
        return fetch(`/api/transactions/${tx.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tag_ids: newTagIds }),
        })
      }))
      showToast(`Added tag to ${selectedTxs.length} transaction${selectedTxs.length !== 1 ? 's' : ''}`, 'success')
      setBulkAddTagId('')
      setSelected(new Set())
      load()
    } catch {
      showToast('Some updates failed', 'error')
    } finally {
      setBulkLoading(false)
    }
  }

  async function bulkApplyRemoveTag() {
    if (!bulkRemoveTagId) return
    setBulkLoading(true)
    const selectedTxs = transactions.filter(t => selected.has(t.id))
    try {
      await Promise.all(selectedTxs.map(tx => {
        const newTagIds = tx.tags.map(t => t.id).filter(id => id !== bulkRemoveTagId)
        return fetch(`/api/transactions/${tx.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tag_ids: newTagIds }),
        })
      }))
      showToast(`Removed tag from ${selectedTxs.length} transaction${selectedTxs.length !== 1 ? 's' : ''}`, 'success')
      setBulkRemoveTagId('')
      setSelected(new Set())
      load()
    } catch {
      showToast('Some updates failed', 'error')
    } finally {
      setBulkLoading(false)
    }
  }
  ```

- [ ] **Step 4: Add "Select" button to the header**

  In the header `<div>` that contains the Export and Filters buttons, add:

  ```tsx
  <button
    onClick={() => { setSelectMode(v => !v); setSelected(new Set()) }}
    style={selectMode ? { ...BTN_SEC, color: '#CC5500', borderColor: '#CC5500' } : BTN_SEC}
  >
    {selectMode ? 'Cancel select' : 'Select'}
  </button>
  ```

- [ ] **Step 5: Add checkbox + select-all to transaction list rows**

  When `selectMode` is true, show a checkbox at the start of each row. Before the transaction list container, add a select-all row:

  ```tsx
  {selectMode && (
    <div style={{ padding: '8px 16px', borderBottom: '1px solid #21262d', display: 'flex', alignItems: 'center', gap: '8px' }}>
      <input
        type="checkbox"
        checked={selected.size === transactions.length && transactions.length > 0}
        onChange={toggleSelectAll}
        style={{ cursor: 'pointer' }}
      />
      <span style={{ color: '#8b949e', fontSize: '12px' }}>
        {selected.size > 0 ? `${selected.size} selected` : 'Select all'}
      </span>
    </div>
  )}
  ```

  In each transaction row, prepend a checkbox when `selectMode` is active:

  ```tsx
  {selectMode && (
    <input
      type="checkbox"
      checked={selected.has(tx.id)}
      onChange={() => toggleSelect(tx.id)}
      onClick={e => e.stopPropagation()}
      style={{ cursor: 'pointer', flexShrink: 0 }}
    />
  )}
  ```

- [ ] **Step 6: Add bulk action bar (shown when selection > 0)**

  Add the bulk action bar as a fixed bar at the bottom of the page, inside the main `<div>`:

  ```tsx
  {selectMode && selected.size > 0 && (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
      background: '#1c2128', borderTop: '1px solid #30363d',
      padding: '12px 1.5rem', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap',
    }}>
      <span style={{ color: '#e6edf3', fontSize: '13px', fontWeight: 600, flexShrink: 0 }}>
        {selected.size} selected
      </span>

      {/* Change account */}
      <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
        <select
          style={{ ...SELECT, width: 'auto', fontSize: '12px', padding: '4px 8px' }}
          value={bulkAccountId}
          onChange={e => setBulkAccountId(e.target.value)}
        >
          <option value="">Account...</option>
          <AccountOptions accounts={activeAccounts} />
        </select>
        <button style={{ ...BTN_SEC, fontSize: '12px' }} onClick={bulkApplyAccount} disabled={!bulkAccountId || bulkLoading}>
          Apply
        </button>
      </div>

      {/* Change category */}
      <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
        <select
          style={{ ...SELECT, width: 'auto', fontSize: '12px', padding: '4px 8px' }}
          value={bulkCategoryId}
          onChange={e => setBulkCategoryId(e.target.value)}
        >
          <option value="">Category...</option>
          <optgroup label="Expense">
            {expenseCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </optgroup>
          <optgroup label="Income">
            {incomeCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </optgroup>
        </select>
        <button style={{ ...BTN_SEC, fontSize: '12px' }} onClick={bulkApplyCategory} disabled={!bulkCategoryId || bulkLoading}>
          Apply
        </button>
      </div>

      {/* Change type */}
      <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
        {(['expense', 'income', 'transfer'] as const).map(t => (
          <button
            key={t}
            onClick={() => setBulkType(prev => prev === t ? '' : t)}
            style={{
              ...BTN, fontSize: '12px', padding: '4px 10px',
              background: bulkType === t ? typeColor(t) : '#21262d',
              color: bulkType === t ? '#0d1117' : '#8b949e',
              border: `1px solid ${bulkType === t ? typeColor(t) : '#30363d'}`,
              textTransform: 'capitalize',
            }}
          >
            {t}
          </button>
        ))}
        {bulkType && (
          <button style={{ ...BTN_SEC, fontSize: '12px' }} onClick={bulkApplyType} disabled={bulkLoading}>
            Apply type
          </button>
        )}
      </div>

      {/* Add tag */}
      <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
        <select
          style={{ ...SELECT, width: 'auto', fontSize: '12px', padding: '4px 8px' }}
          value={bulkAddTagId}
          onChange={e => setBulkAddTagId(e.target.value)}
        >
          <option value="">Add tag...</option>
          {tags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <button style={{ ...BTN_SEC, fontSize: '12px' }} onClick={bulkApplyAddTag} disabled={!bulkAddTagId || bulkLoading}>
          +Tag
        </button>
      </div>

      {/* Remove tag */}
      <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
        <select
          style={{ ...SELECT, width: 'auto', fontSize: '12px', padding: '4px 8px' }}
          value={bulkRemoveTagId}
          onChange={e => setBulkRemoveTagId(e.target.value)}
        >
          <option value="">Remove tag...</option>
          {tags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <button style={{ ...BTN_DNG, fontSize: '12px' }} onClick={bulkApplyRemoveTag} disabled={!bulkRemoveTagId || bulkLoading}>
          -Tag
        </button>
      </div>

      {bulkLoading && <span style={{ color: '#8b949e', fontSize: '12px' }}>Updating...</span>}
    </div>
  )}
  ```

  Also add `paddingBottom: selectMode && selected.size > 0 ? '80px' : undefined` to the main container div so content isn't hidden behind the bar.

- [ ] **Step 7: TypeScript check**

  ```bash
  npx tsc --noEmit
  ```

  Expected: no errors.

- [ ] **Step 8: Run full test suite**

  ```bash
  npx vitest run
  ```

  Expected: all pass.

- [ ] **Step 9: Commit**

  ```bash
  git add app/(protected)/transactions/page.tsx
  git commit -m "feat: bulk operations on transactions page (select, change account/category/type/tag)"
  ```

---

### Task 22: Open PR 4 and merge

- [ ] **Step 1: Push and create PR**

  ```bash
  git push -u origin feat/transactions-improvements
  gh pr create --title "feat: transactions improvements + account dropdowns + bulk ops" --body "$(cat <<'EOF'
  ## Summary
  - Fixes: URL params (category_id, account_id, tag_id) now pre-populate filters on page load
  - New: search bar (searches payee, note, category name) - always visible above filter panel
  - New: Sort By dropdown (date newest/oldest, amount high/low, payee A-Z)
  - New: accounts grouped by type with <optgroup> in WMM form and transaction edit form
  - New: multi-select mode on transactions page with checkboxes and select-all
  - New: bulk action bar appears when items are selected:
    - Change account (with grouped optgroup)
    - Change category (expense/income grouped)
    - Change type (expense/income/transfer pills)
    - Add tag / Remove tag
  - All bulk actions PATCH individually with Promise.all, shows count toast on completion

  ## Test plan
  - [ ] All vitest tests pass
  - [ ] Navigate to /transactions?category_id=X - filters open with correct category pre-selected
  - [ ] Search "grab" - shows only transactions with that payee/note/category
  - [ ] Sort by amount desc - highest transactions appear first
  - [ ] Account dropdowns show optgroup labels (Bank, Wallet, Cash, Fund)
  - [ ] Select 3 transactions, change account - all 3 update, toast shows "3 transactions"
  - [ ] Add/remove tag in bulk - correct transactions updated
  EOF
  )"
  ```

- [ ] **Step 2: Merge**

  ```bash
  gh pr merge --squash --delete-branch
  git checkout main && git pull
  ```

---

## Post-merge Production Steps

After all PRs are merged and ~3 minutes have passed for the deployment to stabilise:

- [ ] **Run migrations on prod**

  ```bash
  curl -X POST https://blessroot.quietbuild.ai/api/migrate \
    -H "Cookie: <your-session-cookie>"
  ```

  Expected response: `{ "ok": true, "migrations": { "categories.parent_id": "added", "tags.drop_category_id": "added", "accounts.delete_vallow": "already exists" } }`

  (or similar — "already exists" is fine for idempotent ops)

- [ ] **Smoke test**

  - [ ] Log in
  - [ ] Dark/light toggle works and persists on refresh
  - [ ] Nav bar shows trend chart SVG, burnt orange accent on active tab
  - [ ] Create a category, set it as parent of a new category - nested hierarchy appears
  - [ ] Expense dashboard: click a parent category - subcategories expand inline
  - [ ] Transactions page: navigate with ?category_id=X - filter pre-populated
  - [ ] Search a payee, sort by amount — both work
  - [ ] Select multiple transactions, bulk-change category — all update correctly
