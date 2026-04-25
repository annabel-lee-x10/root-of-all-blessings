# News Refresh Smoke Test Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Playwright e2e smoke test that verifies the News refresh pipeline populates at least 3 of 6 sections after clicking Refresh.

**Architecture:** Single new file `e2e/news-refresh.spec.ts`. The test navigates to `/portfolio`, switches to the News view via the ViewToggle, clicks Refresh, waits for the button to return to idle, and asserts ≥3 sections have cards. No application code is changed.

**Tech Stack:** Playwright (`@playwright/test`), existing `storageState: 'e2e/.auth/user.json'` for auth

---

## File Structure

- **Create:** `e2e/news-refresh.spec.ts`
- **No modifications** to any existing file

---

### Task 1: Write and verify the smoke test

**Context:**
- `/portfolio` renders `PortfolioClient` which has a `ViewToggle` with buttons "Dashboard" and "News"
- Clicking "News" renders `<NewsClient>` inline
- `NewsClient` has a sticky sub-nav with a button that reads `↻ Refresh` (idle) and `↻ Refreshing...` (busy)
- After refresh, populated sections show `NewsCard` items; empty sections show "No stories yet — hit Refresh to generate."
- The 5 non-portfolio sections are: World Headlines, Singapore Headlines, Singapore Property (collapsed), Global Tech Employment (collapsed), Singapore Tech Jobs (collapsed)
- Portfolio News only appears when tickers are loaded — skip it in this smoke test
- Auth is handled by `storageState: 'e2e/.auth/user.json'` (set in `playwright.config.ts` for all non-auth projects)
- Generous timeout needed: refresh calls Anthropic API with `web_search` for each of 5 sections sequentially (~10–20s each)

**Files:**
- Create: `e2e/news-refresh.spec.ts`

- [ ] **Step 1: Run baseline unit tests**

```bash
npx vitest run
```

Expected: All tests pass (62 files, 769 tests as of 2026-04-25). Record count for comparison after changes.

- [ ] **Step 2: Write the smoke test**

Create `e2e/news-refresh.spec.ts`:

```typescript
import { test, expect } from '@playwright/test'

test.describe('News refresh smoke test', () => {
  test(
    'refresh populates at least 3 of 5 sections with cards',
    async ({ page }) => {
      // Navigate to Portfolio page
      await page.goto('/portfolio')
      await expect(page).toHaveURL(/portfolio/)

      // Switch to News view via the ViewToggle
      await page.getByRole('button', { name: 'News' }).click()

      // Wait for the NewsClient to mount (Refresh button appears)
      const refreshBtn = page.getByRole('button', { name: /↻ Refresh/ })
      await expect(refreshBtn).toBeVisible()

      // Expand collapsed sections before refreshing so cards are visible afterward
      const property = page.getByRole('heading', { name: 'Singapore Property' })
      await property.click()
      const globalJobs = page.getByRole('heading', { name: 'Global Tech Employment' })
      await globalJobs.click()
      const sgJobs = page.getByRole('heading', { name: 'Singapore Tech Jobs' })
      await sgJobs.click()

      // Click Refresh
      await page.getByRole('button', { name: '↻ Refresh' }).click()

      // Wait for refresh to complete: button returns to "↻ Refresh" (not "↻ Refreshing...")
      // Generous 90s timeout for sequential Anthropic API calls
      await expect(page.getByRole('button', { name: '↻ Refresh' })).toBeVisible({
        timeout: 90_000,
      })
      await expect(
        page.getByRole('button', { name: /Refreshing/ })
      ).not.toBeVisible()

      // Count how many of the 5 sections have at least one card.
      // A card contains a source/timestamp footer div; we use the source span as a proxy.
      // Each section header is followed by its cards. We look for the "No stories yet" empty
      // state to detect empty sections and invert.
      const emptySections = page.getByText('No stories yet — hit Refresh to generate.')
      const emptyCount = await emptySections.count()

      // 5 sections total (World, Singapore, Property, Global Jobs, SG Jobs)
      // At least 3 must be populated
      expect(emptyCount).toBeLessThanOrEqual(2)
    },
    { timeout: 120_000 }
  )
})
```

- [ ] **Step 3: Verify the new file doesn't break the unit test suite**

```bash
npx vitest run
```

Expected: Same count as before (62 files, 769 tests). Playwright spec files live in `e2e/` and are excluded from Vitest's `tsconfig.json` include paths (BUG-047 fix), so they should not be picked up by Vitest.

- [ ] **Step 4: Commit**

```bash
git add e2e/news-refresh.spec.ts
git commit -m "test(e2e): add news refresh smoke test (≥3 of 5 sections populate)"
```

- [ ] **Step 5: Create PR and merge**

```bash
gh pr create --title "test(e2e): news refresh smoke test" --body "..."
gh pr merge --squash --auto
```

---

## Self-Review

### Spec coverage

| Requirement | Task |
|---|---|
| Navigate to Portfolio page, then News tab | Step 2 — `goto('/portfolio')` + click "News" |
| Click Refresh button | Step 2 — `click('↻ Refresh')` |
| Wait for Refreshing... → Refresh | Step 2 — `toBeVisible({ timeout: 90_000 })` + `not.toBeVisible` on Refreshing |
| Assert ≥3 of 6 sections have cards | Step 2 — count empty sections ≤ 2 (of 5 non-portfolio) |
| Handle auth | Handled automatically via `storageState` in playwright.config |
| 90s timeout | `timeout: 120_000` on test, `90_000` on the await |
| Do NOT modify app code | Only `e2e/news-refresh.spec.ts` created |
| Run unit tests before and after | Steps 1 and 3 |
| Create PR and merge | Step 5 |

### Placeholder scan

None found.

### Type consistency

No custom types — uses only `@playwright/test` imports.
