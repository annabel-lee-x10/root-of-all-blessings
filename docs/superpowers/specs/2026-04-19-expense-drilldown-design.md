# Expense Dashboard Drill-Down Design

**Date:** 2026-04-19
**Feature:** Interactive category drill-down on expense dashboard bar chart

---

## Overview

When a user clicks a category row in the expense dashboard's Category Breakdown section, the view transitions to a tag-level breakdown of that category. A back button returns to the top-level view. Transfers are always excluded. A loading skeleton is shown during fetch.

---

## Architecture

Two files change:

| File | Change |
|---|---|
| `app/api/dashboard/route.ts` | Accept `drilldown=<category_name>` query param; return tag breakdown response |
| `app/(protected)/components/expense-dashboard.tsx` | Add `drilldown` state, clickable category rows, `DrilldownPanel` sub-section |

No new files. No new routes.

---

## API: `GET /api/dashboard`

### New query parameter: `drilldown`

When `drilldown=<category_name>` is present alongside existing params (`range`, `start`, `end`), the endpoint returns a drilldown response instead of the summary response.

**Response shape:**

```json
{
  "category_name": "Food",
  "total": 800.00,
  "tag_breakdown": [
    { "tag_name": "Dining Out", "total": 500.00, "pct": 62.5 },
    { "tag_name": "Groceries", "total": 200.00, "pct": 25.0 },
    { "tag_name": "(untagged)", "total": 100.00, "pct": 12.5 }
  ]
}
```

**SQL logic:**

1. Find expense transactions in the date range matching the given category name (JOIN categories).
2. LEFT JOIN transaction_tags → tags to get tag names.
3. GROUP BY tag_id: tagged transactions group by tag name; untagged transactions (tag_id IS NULL) appear as `"(untagged)"`.
4. Compute `pct` as `(tag_total / category_total) * 100`, rounded to 1 decimal.
5. Order by total DESC, untagged last.
6. Transfers excluded (type = 'expense' filter).

**When category has zero spend:** return `{ category_name, total: 0, tag_breakdown: [] }` with status 200.

**Validation:** `drilldown` param is URL-decoded before use. No SQL injection risk — the category name is passed as a parameterized argument.

---

## Component: `ExpenseDashboard`

### State additions

```ts
const [drilldown, setDrilldown] = useState<string | null>(null)
const [drilldownData, setDrilldownData] = useState<DrilldownData | null>(null)
const [drilldownLoading, setDrilldownLoading] = useState(false)
```

### Types

```ts
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
```

### Data flow

- Clicking a category row calls `openDrilldown(cat.category_name)`:
  - Sets `drilldown` state
  - Fetches `/api/dashboard?range=...&drilldown=<encoded_name>`
  - Sets `drilldownLoading` true during fetch, false when done
- Back button calls `closeDrilldown()`: clears `drilldown` and `drilldownData`

### Rendering

**Category Breakdown rows (existing):**
- Add `role="button"`, `tabIndex={0}`, `cursor: pointer` style, hover highlight
- `onClick` and `onKeyDown` (Enter/Space) call `openDrilldown`

**Drill-down panel (new, replaces category breakdown when active):**

```
┌─────────────────────────────────────┐
│ ← Back        Food  •  $800.00      │
├─────────────────────────────────────┤
│ [loading skeleton rows]             │
│ — or —                              │
│ Dining Out   ████████░░   $500  62% │
│ Groceries    ████░░░░░░   $200  25% │
│ (untagged)   █░░░░░░░░░   $100  13% │
└─────────────────────────────────────┘
```

- Bar color: `#79c0ff` (distinct from overview's `#f0b429`)
- Loading state: 3 grey placeholder bars at 60/40/30% width, pulsing opacity
- "No tags found" empty state when `tag_breakdown` is empty
- Mobile: same flex-column layout as overview rows

---

## Testing

### API tests (`tests/api/dashboard.test.ts` additions)

- Returns tag breakdown when `drilldown` param is present
- Groups by tag correctly (multiple transactions, same tag)
- Untagged transactions appear as `"(untagged)"`
- Transfers excluded from drilldown totals
- Respects date range params in drilldown mode
- Returns `{ total: 0, tag_breakdown: [] }` for category with no spend in range
- Needs `seedTransactionTag(txId, tagId)` helper added to `tests/helpers.ts`

### Component tests (`tests/components/expense-dashboard.test.tsx` additions)

- Category rows have `role="button"`
- Clicking a category triggers fetch with `drilldown=<name>` param
- Drilldown panel shows tag names after load
- Back button clears drilldown and restores category view
- Loading skeleton shown while drilldown fetch is in progress
- Drilldown fetch includes range params from current selection

---

## Constraints

- Transfers excluded at both API and conceptual level (type = 'expense' filter handles this)
- BUGS.md and TEST_STRATEGY.md do not exist; following conventions inferred from existing tests
- Inline styles only (project convention — no CSS modules)
- No new route files — extend existing `/api/dashboard` handler
