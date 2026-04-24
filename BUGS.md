# Known Bugs

Track confirmed bugs here before they are fixed. Format:
`**[ID]** Short description — discovered date, affected file`

---

**BUG-001** `PATCH /api/transactions/[id]` and `DELETE /api/transactions/[id]` do not call `verifySession()`, meaning authenticated endpoints are missing auth checks — discovered 2026-04-19, `app/api/transactions/[id]/route.ts`

---

## BUG-047 · Vercel build fails: e2e/ and playwright.config.ts not excluded from tsconfig

**Status:** Fixed
**Reported:** 2026-04-24
**Fixed in:** `tsconfig.json`

**Symptom:** Every Vercel deployment since PR #82 (feat/playwright-e2e) fails with:

```
Type error: Cannot find module '@playwright/test' or its corresponding type declarations.
```

Because `next build` exits 1, Vercel does not promote the new build to production. The app has been serving the last successful pre-PR#82 build, causing login (and all subsequent features) to be invisible or broken on prod.

**Root cause:** `e2e/` and `playwright.config.ts` both import from `@playwright/test`, which is a `devDependency`. Vercel does not install devDependencies during the build step, so TypeScript cannot resolve the module. The `tsconfig.json` `exclude` list already covers `tests/` (added in `47258b8`) and `scripts/` (added in `be9e4d7`) for exactly this reason, but `e2e/` was never added when PR #82 introduced Playwright.

**Fix:** Added `"e2e"` and `"playwright.config.ts"` to the `exclude` array in `tsconfig.json`.

**Regression test:** `tests/regression/tsconfig-e2e-exclude.test.ts` — "BUG-047" describe block

---

## BUG-038 · Auto-generated snap_label has "(HTML import)" suffix and uses UTC date

**Status:** Fixed
**Reported:** 2026-04-23
**Fixed in:** `app/api/portfolio/route.ts`

**Symptom:** When a portfolio snapshot is created via HTML upload without an explicit `snap_label`, the auto-generated label looks like `"22 Apr 2026 (HTML import)"` instead of the clean `"22 Apr 2026"`. Additionally, if the upload occurs late in the day (after 16:00 SGT / 08:00 UTC), the date can be off by one day because the label used UTC date methods while the user is in Singapore (UTC+8).

**Root cause:** `autoLabel` was built with `getUTCDate()`, `getUTCMonth()`, `getUTCFullYear()` (UTC-based) and appended `(HTML import)` as a hardcoded suffix.

**Fix:** Replaced UTC date methods with `Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Singapore', ... }).formatToParts()` to produce the correct calendar date in SGT. Removed the `(HTML import)` suffix entirely.

**Regression tests:** `tests/regression/portfolio-snap-label.test.ts`

**Follow-up (data migration):** The BUG-038 fix only applied to new uploads. Existing prod rows still had `"22 Apr 2026 (HTML import)"` labels with UTC-based dates. Two rows with `snapshot_date` at T23:33Z and T20:57Z were `23 Apr` SGT but mislabeled `22 Apr`. One row had `snap_label = NULL`. Fix: added `snap_label.strip_html_import` and `snap_label.backfill_nulls` migration steps to `POST /api/migrate`, plus a `GET /api/migrate` diagnostic endpoint. Run `/api/migrate` against prod to apply.

**Data migration tests:** `tests/regression/portfolio-snap-label-migration.test.ts`

---

## BUG-037 · HTML upload snapshots show wrong total_value, realised_pnl, cash vs skill output

**Status:** Fixed
**Reported:** 2026-04-22
**Fixed in:** `app/api/portfolio/route.ts`

**Symptom:** After uploading the skill's HTML report, all financial summary values are wrong:
- `total_value` shows $14,229.64 instead of $14,369.02 (skill's total)
- `realised_pnl` shows $430.88 instead of $469.50
- `cash` shows $87.45 instead of $224.63
- `unrealised_pnl` shows $405.39 instead of $411.38

**Root cause 1 — total_value computed from equity sum only:** `parseHtml()` sums `market_value` across all holdings without FX conversion and without including cash. The skill's total_value is the true portfolio total (FX-adjusted, including cash). There is no way to derive this from the table alone.

**Root cause 2 — carry-forward uses stale values:** When the caller doesn't provide `realised_pnl` and `cash`, the route carries them from the previous snapshot (`snap_label IS NOT NULL`). For Snap 28, the previous was Snap 27 ($430.88 / $87.45). Snap 28 updated those to $469.50 / $224.63 — but the HTML table contains neither.

**Root cause 3 — unrealised_pnl never written on HTML upload:** `parseHtml()` returns `total_pnl` from the holdings sum, but the INSERT omits the `unrealised_pnl` column. The GET route backfills it live by summing `portfolio_holdings.pnl`. For non-USD holdings (WISE UK pnl in GBP, Z74 SG pnl in SGD), the stored value is in original currency but treated as USD — causing ~$6 undercount.

**Fix:** Added `parseSummary(html)` which extracts a machine-readable `<script type="application/json" id="portfolio-summary">` block from the skill's HTML output. Values in this block take priority over all computed/carried-forward values. The skill embeds this block so the upload route reads exact numbers instead of approximating them.

**Skill update:** Added the JSON summary block to the skill's HTML generation spec. Block includes: `total_value`, `unrealised_pnl`, `realised_pnl`, `cash`, `pending`.

**Regression tests:** `tests/regression/portfolio-upload.test.ts` — "BUG-037" describe block

---

## BUG-036 · HTML upload strips pnl from skill-generated reports (URZ P&L header not matched)

**Status:** Fixed
**Reported:** 2026-04-22
**Fixed in:** `app/api/portfolio/route.ts`

**Symptom:** After uploading the syfe-portfolio skill's HTML report, all holdings have `pnl = null` and `avg_cost = null` in the database. The portfolio page shows "—" for unrealised P&L instead of the correct value.

**Root cause:** Two independent failures in `parseHtml()`:

1. **HTML entity encoding:** `stripTags()` strips HTML tags but does not decode HTML entities. The skill's HTML renders the pnl column header as `<th>URZ P&amp;L</th>`. After `stripTags()`, this becomes `"URZ P&amp;L"` (literal string), not `"URZ P&L"`. The pnl pattern `^p&l$` tests for a literal `&`, which can't match the 5-character sequence `&amp;`.

2. **Over-anchored regex:** Even if the entity were decoded, `^p&l$` anchors require the header to be exactly `"p&l"` with nothing before or after. The actual header `"URZ P&L"` would fail the start anchor. Removing the anchors so the pattern reads `p&l` correctly matches any header containing `"p&l"` as a substring.

**Fix:**
- `stripTags()` now decodes common HTML entities (`&amp;`, `&lt;`, `&gt;`, `&nbsp;`, `&quot;`, `&#39;`) before returning.
- `detectColumnMap` pnl pattern changed from `/^p&l$/i` to `/p&l/i` (substring match, no anchors).

**Note:** `avg_cost` is not in the skill's HTML holdings table — the table only has Ticker, Price, 1D%, Value, URZ P&L, Qty, Weight. Adding avg_cost requires updating the skill's html-report-spec.md. Tracked separately.

**Regression tests:** `tests/regression/portfolio-upload.test.ts` — "BUG-036" describe block

---

## BUG-034 · Portfolio page shows "This page couldn't load" on mobile

**Status:** Fixed
**Reported:** 2026-04-22
**Fixed in:** `app/(protected)/portfolio/portfolio-client.tsx`, `app/api/portfolio/snapshots/route.ts`, `app/api/migrate/route.ts`

**Symptom:** The portfolio page showed "This page couldn't load" on mobile immediately after loading.

**Root cause 1 (client crash):** `PortfolioClient.load()` called `setSnapshot(snap)` without checking `res.ok`. When the API returned a 500 JSON error body (e.g. `{"error":"Database error"}`), `res.json()` succeeded and `setSnapshot` was called with the error object. Since the object is truthy, the component skipped the upload-panel branch and tried to destructure `holdings` from the error object — `undefined.reduce()` crashed React.

**Root cause 2 (API 500):** The `/api/migrate` route never created the `portfolio_holdings` table. The `portfolio_realised` table was also wrongly created as `portfolio_realised_trades`. The `portfolio_growth` table was missing `label` and `next_text` columns. When the snapshots route queried `portfolio_holdings WHERE snapshot_id = ?`, it threw "no such table", causing all portfolio loads to 500.

**Fix (client):** Added `if (!res.ok) { showToast('Failed to load portfolio', 'error'); return }` guard before `setSnapshot` — prevents setting truthy non-null state on API errors.

**Fix (API):** Added `try/catch` to `GET /api/portfolio/snapshots` so it always returns JSON (never raw 500 HTML).

**Fix (migration):** Added `portfolio_holdings` `CREATE TABLE IF NOT EXISTS`, added `portfolio_realised` with correct schema, and added `ALTER TABLE portfolio_growth ADD COLUMN` for `label` and `next_text` to `/api/migrate`.

**Regression tests:** `tests/components/portfolio-client.test.tsx` — "BUG-034" describe block

---

## BUG-002 · News: `<cite>` tags render as visible text in card summaries

**Status:** Fixed  
**Reported:** 2026-04-19  
**Fixed in:** `lib/news-utils.ts`, `app/(protected)/news/news-client.tsx`

**Symptom:** Raw `<cite index="1-19,1-20">text</cite>` markup appeared as visible text in news card summaries, catalysts, headlines, and key points.

**Root cause:** The Claude `web_search_20250305` tool annotates assistant text responses with inline `<cite index="...">` markers. These land verbatim in JSON string values returned by the model. `mapCard()` extracted them with `String(it.summary)` and they were passed directly to JSX — React renders strings literally, not as HTML, so the tag syntax appeared as raw characters.

**Fix:** `stripCiteTags()` added to `lib/news-utils.ts`. Applied in `mapCard()` on `headline`, `catalyst`, `summary`, and every `keyPoints` item. Also applied in `agenticLoop` on the final text return (see BUG-003).

**Regression test:** `tests/regression/news-cite-tags.test.ts`

---

## BUG-004 · News: cached cards render raw `<cite>` tags as visible text (client-side)

**Status:** Fixed  
**Reported:** 2026-04-19  
**Fixed in:** `app/(protected)/news/news-client.tsx`

**Symptom:** News cards loaded from the database (via `loadBrief()`) displayed raw `<cite index="...">text</cite>` markup as literal visible characters in catalyst, summary, and key-points fields — even after BUG-002's server-side fix was deployed.

**Root cause:** `stripCiteTags()` was only applied in `mapCard()`, which runs during a live Refresh. Cards stored in `news_briefs.content_json` before the fix bypass `mapCard()` entirely: `loadBrief()` → `JSON.parse()` → `setNews()` → `NewsCard` render, with no stripping at any stage. React renders strings literally (not as HTML), so `<cite` appeared as raw text.

**Fix:** `stripCiteTags()` now called at render time in `NewsCard` for `catalyst`, `summary`, and each `keyPoints` item. Defense-in-depth — new data is still stripped in `mapCard()` (double-strip is safe and idempotent).

**Regression test:** `tests/components/news-client-cite-strip.test.tsx`

---

## BUG-005 · Expense Dashboard shows "Failed to load" instead of empty state

**Status:** Fixed  
**Reported:** 2026-04-19  
**Fixed in:** `app/(protected)/components/expense-dashboard.tsx`, `app/api/dashboard/route.ts`

**Symptom:** On first load (no transactions yet) the Expense Dashboard section showed an orange "Failed to load dashboard data — please refresh" error.

**Root cause (primary):** The dashboard SQL queries include `AND (status IS NULL OR status = 'approved')`, requiring the `status` column added in the draft-transaction feature. If `/api/migrate` had not been run on the production database, every query failed with `no such column: status`, causing the route to return 500 and the component to set `error = true`.

**Root cause (secondary):** Even if the API succeeded, all-zero data had no visual distinction — four silent "0.00" widgets with no context.

**Fix (API):** Dashboard route wraps queries in try-catch; on SQL failure it retries with equivalent queries that omit the status filter so the dashboard renders instead of erroring.

**Fix (component):** When data loads successfully and all totals are zero, shows "No transactions yet in this period." instead of four "0.00" widgets.

**Regression test:** `tests/components/expense-dashboard.test.tsx` (BUG-005 describe block)

---

## BUG-006 · ReceiptDropzone shows "Network error" for all server-side failures

**Status:** Fixed  
**Reported:** 2026-04-19  
**Fixed in:** `app/(protected)/components/receipt-dropzone.tsx`

**Symptom:** Every failed receipt upload displayed "Network error" in red, regardless of actual failure reason (missing status column, missing API key, 500 from server, etc.).

**Root cause:** `processFiles()` called `res.json()` inside the outer try-catch. When the server returned a 500 with an HTML error page (or empty body), `res.json()` threw a `SyntaxError` which the outer catch mapped to `'Network error'`. True network failures were indistinguishable from server errors.

**Fix:** `res.json()` is now wrapped in its own inner try-catch. A parse failure sets `data = null` and falls through to the else branch, which shows `data?.error ?? 'Processing failed'`. The outer catch still shows `'Network error'` only when `fetch()` itself throws (no response at all).

**Regression test:** `tests/components/receipt-dropzone.test.tsx`

---

## BUG-003 · News: Singapore Property section shows "No stories yet" after Refresh

**Status:** Fixed  
**Reported:** 2026-04-19  
**Fixed in:** `app/(protected)/news/news-client.tsx`

**Symptom:** After hitting Refresh, the Singapore Property section remained empty ("No stories yet — hit Refresh to generate") while World, Singapore, and Jobs sections loaded correctly.

**Root cause:** Claude's citation tags embed the attribute's double-quotes directly inside a JSON string value:

```
{"summary": "Prices rose <cite index="1-19,1-20">5%</cite> in Q1"}
```

The `"` in `index="1-19,1-20"` terminates the JSON string early, making the entire JSON payload malformed. `parseArr()`'s `catch { return [] }` silently swallowed the `JSON.parse` error and returned an empty array. Whether a section triggered this depended on citation density in the model's response, explaining why some sections succeeded while others did not.

**Fix:** `stripCiteTags()` applied to the text returned by `agenticLoop()` before it is passed to `parseArr()`, ensuring cite tags are removed before JSON parsing and eliminating the malformed-string failure mode.

**Regression test:** `tests/regression/news-cite-tags.test.ts` — "strips cite tags that would break JSON parsing" case.

---

## BUG-010 · /api/categories returns 500 on POST when parent_id column is absent

**Status:** Fixed  
**Reported:** 2026-04-20  
**Fixed in:** `app/api/categories/route.ts`, `app/api/migrate/route.ts`

**Symptom:** `POST /api/categories` returned 500 for all requests in production, preventing users from creating categories (e.g. a "Pet" category).

**Root cause:** `POST` runs `INSERT INTO categories (id, name, type, sort_order, parent_id, ...)`. The `parent_id` column was added to the route in PR #14, but the corresponding `ALTER TABLE` migration in `/api/migrate` was never called against the production Turso DB. The DB still had the original schema (from `scripts/migrate.ts`) without `parent_id`, so every INSERT failed with "table categories has no column named parent_id" → uncaught exception → 500.

**Fix (route):** `POST` now catches the `no column named parent_id` error and retries the INSERT without `parent_id`. Category is created; the user can set the parent relationship via `PATCH` once `/api/migrate` is run.

**Fix (migration):** Added a `categories.pet` section to `/api/migrate` that (a) promotes the "Pet" category from a child of Living to a top-level parent, and (b) creates subcategories (Grooming, Vet, Toys, Litter, Others, Food, Supplements) linked to Pet — skipping any that already exist as parents elsewhere.

**Regression test:** `tests/api/categories.test.ts` — "POST /api/categories – BUG-010 parent_id fallback" describe block

---

## BUG-007 · Where's My Money: mic button does nothing on mobile

**Status:** Fixed  
**Reported:** 2026-04-19  
**Fixed in:** `app/(protected)/components/wheres-my-money.tsx`, `next.config.ts`

**Symptom:** Tapping "Tap mic to log an expense by voice" on mobile did nothing — no permission prompt, no feedback, no error.

**Root cause 1:** The mic button feature was never implemented. No `SpeechRecognition` code existed in `wheres-my-money.tsx`. The button the user expected was simply absent.

**Root cause 2:** `next.config.ts` emitted `Permissions-Policy: microphone=()`, which denies microphone access to all origins including self. Web Speech API silently fails (or throws `NotAllowedError`) when this header is present, regardless of whether the user grants the browser permission prompt.

**Fix:** Added Voice button with `webkitSpeechRecognition` fallback (Safari/iOS, Android Chrome), pulsing listening state, "Listening…" label, tap-to-stop, and error banners for unsupported browser / permission denied / no speech. Transcript fed into `applyPasteData()`. Changed `Permissions-Policy` from `microphone=()` to `microphone=(self)`.

**Regression test:** `tests/regression/voice-input.test.tsx`

---

## BUG-011 · Expense Dashboard: Top Expenses shows subcategories instead of parent categories

**Status:** Fixed  
**Reported:** 2026-04-21  
**Fixed in:** `app/api/dashboard/route.ts`

**Symptom:** The Top Expenses section on the dashboard listed individual subcategories (e.g. "Vet", "Grooming", "Food") instead of their parent category (e.g. "Pet"), making it hard to understand spending at a glance.

**Root cause:** The top-level `catQuerySql` in the dashboard route grouped by `t.category_id, c.name`, which is the subcategory level. No join to the parent categories table was performed.

**Fix:** Updated the top-level category query (and tag aggregation queries) to `LEFT JOIN categories p ON c.parent_id = p.id` and group by `COALESCE(p.id, c.id), COALESCE(p.name, c.name)`, rolling all subcategory spend up to the parent.

---

## BUG-012 · Categories page: search input below tabs, doesn't filter subcategories

**Status:** Fixed  
**Reported:** 2026-04-21  
**Fixed in:** `app/(protected)/categories/page.tsx`

**Symptom:** The search box appeared inside the tab panel (below the Expense/Income switcher) and only filtered top-level category names — typing a subcategory name returned no results.

**Fix:** Moved search input above the tab switcher. Updated `topLevel` filter to also show parent categories that have at least one matching subcategory; shows matching subcategories inline under their parent.

---

## BUG-013 · Transactions page loads all 7,040 records at once

**Status:** Fixed  
**Reported:** 2026-04-21  
**Fixed in:** `app/(protected)/transactions/page.tsx`

**Symptom:** The transactions page fetched all transactions on load (effectively no pagination UX), making the page slow and the list unwieldy.

**Fix:** Changed `LIMIT` from 20 to 50, replaced page-prev/next pagination with a "Load more" append pattern — initial load shows 50, each "Load more" appends the next 50.

---

## BUG-014 · Dashboard time period labels not compact; missing 3-month option

**Status:** Fixed  
**Reported:** 2026-04-21  
**Fixed in:** `app/(protected)/components/expense-dashboard.tsx`, `app/api/dashboard/route.ts`

**Symptom:** Period tabs showed verbose labels "Daily / 7-day / Monthly" and had no 3-month option.

**Fix:** Renamed periods to 1D/7D/1M/3M/Custom in both the component and API. Added 3M range that covers the last 3 calendar months.

---

## BUG-015 · Delete actions use native browser confirm() dialog

**Status:** Fixed  
**Reported:** 2026-04-21  
**Fixed in:** `app/(protected)/transactions/page.tsx`, `app/(protected)/categories/page.tsx`

**Symptom:** Deleting a transaction or category triggered the browser's native `window.confirm()` popup, which looks out of place on mobile and cannot be styled.

**Fix:** Replaced `window.confirm()` with a custom `ConfirmDialog` React component that renders a styled modal matching the app's design system.

---

## BUG-016 · No undo after delete

**Status:** Fixed  
**Reported:** 2026-04-21  
**Fixed in:** `app/(protected)/components/toast.tsx`, `app/(protected)/transactions/page.tsx`, `app/(protected)/categories/page.tsx`, `app/api/transactions/route.ts`

**Symptom:** Deleting a transaction or category was immediately permanent with no recovery path.

**Fix:** Extended the Toast system to support action buttons. After each confirmed delete, a toast with an "Undo" button appears for 5.5 seconds. Clicking Undo re-inserts the deleted item (transactions restore with original ID via modified POST handler; categories re-POST with same data). Keeps a stack of up to 5 undoable deletes per page.

---

## BUG-017 · Transactions toolbar buttons misaligned and clunky on mobile

**Status:** Fixed  
**Reported:** 2026-04-21  
**Fixed in:** `app/(protected)/transactions/page.tsx`

**Symptom:** The action toolbar (Export CSV, Export XLSX, Filters, Select) was misaligned on mobile, with inconsistent button sizes and two separate export buttons.

**Fix:** Merged Export CSV + XLSX into a single "Export ▾" button with an inline dropdown. Standardised button sizing and alignment across the toolbar.

---

## BUG-018 · More sheet includes News and Portfolio links

**Status:** Fixed  
**Reported:** 2026-04-21  
**Fixed in:** `app/(protected)/components/nav-bar.tsx`

**Symptom:** The bottom-nav "More" slide-up sheet showed "News" and "Portfolio" links, which are already accessible via the View Switcher dropdown in the top nav.

**Fix:** Removed News and Portfolio from `BUDGET_MORE`; sheet now contains only Accounts, Tags, and Sign out.

---

## BUG-019 · /add page: both cards not collapsible; wrong order

**Status:** Fixed  
**Reported:** 2026-04-21  
**Fixed in:** `app/(protected)/add/page.tsx`, `app/(protected)/components/wheres-my-money.tsx`, `app/(protected)/components/receipt-dropzone.tsx`

**Symptom:** The /add page showed both WheresMyMoney (manual entry) and ReceiptDropzone (OCR) fully expanded with no way to collapse either. OCR card appeared below the manual form despite being the primary entry method.

**Fix:** Converted /add to a client component managing accordion state. OCR card moved to top and opens by default; manual form starts collapsed. Tapping either card's header expands it and collapses the other.

---

## BUG-021 · ReceiptDropzone: "No active account found" when localStorage has stale account ID

**Status:** Fixed
**Reported:** 2026-04-21
**Fixed in:** `app/api/receipts/_lib.ts`, `app/(protected)/components/receipt-dropzone.tsx`

**Symptom:** Uploading a receipt image and clicking "Process" showed "No active account found" in red, with the "Process 0 Receipts" button grayed out. Appeared after PR #42 made OCR the primary (top, expanded) entry method on /add.

**Root cause:** `resolveAccount()` in `_lib.ts` returned `null` — triggering a 400 error — when the client sent a non-empty but stale `accountId` (e.g. an old account that was deleted or from a different DB session). The server-side fallback to the first active account only ran when `accountId` was falsy (empty string or undefined). After PR #42 placed OCR at the top of the /add page, users whose `wmm_last_account` localStorage key pointed to a stale account would hit this path immediately on first use.

**Fix (server):** Removed the early `return null` in `resolveAccount()` so a stale/invalid `accountId` falls through to the same first-active-account fallback as a missing one.

**Fix (client):** `ReceiptDropzone.processFiles()` now writes `data.draft.account_id` back to `wmm_last_account` after each successful receipt, so stale IDs self-heal on the first successful OCR.

**Regression test:** `tests/api/receipts.test.ts` — "BUG-021: falls back to first active account when accountId is stale/not found"

---

## BUG-020 · Duplicate voice input buttons on /add page

**Status:** Fixed  
**Reported:** 2026-04-21  
**Fixed in:** `app/(protected)/components/receipt-dropzone.tsx`

**Symptom:** Two voice mic buttons appeared on the /add page — one in the WheresMyMoney form, one in the ReceiptDropzone card.

**Root cause:** Both components independently implemented voice input. WheresMyMoney's voice button fills the form via `applyPasteData()`. ReceiptDropzone had a second voice button that sent audio to `/api/receipts/voice`.

**Fix:** Removed the voice button from ReceiptDropzone. Voice input is handled exclusively by WheresMyMoney; ReceiptDropzone focuses on image OCR.

---

## BUG-021 · News: FAB (+) button does nothing on /news page

**Status:** Fixed
**Reported:** 2026-04-21
**Fixed in:** `app/(protected)/components/nav-bar.tsx`, `app/(protected)/news/news-client.tsx`

**Symptom:** Tapping the (+) FAB button in the bottom nav while on the News page had no effect — it was a `<Link href="/news">` which navigates to the page the user is already on.

**Root cause:** The news-view FAB was rendered as `<Link href="/news">` (same pattern as portfolio, which navigates to `/portfolio`). Since the user is already on `/news`, the navigation was a no-op. No file upload was triggered.

**Fix:** The news-view FAB is now a `<button>` that dispatches `window.CustomEvent('news:open-upload')`. `NewsClient` listens for this event and calls `fileRef.current?.click()` to open the browser's file picker.

**Regression test:** `tests/components/news-client-fab.test.tsx`

---

## BUG-022 · News: Portfolio tab never shows content

**Status:** Fixed (secondary to BUG-021)
**Reported:** 2026-04-21
**Fixed in:** See BUG-021 fix

**Symptom:** The Portfolio News section was never visible, even after generating a news brief.

**Root cause:** The Portfolio section only renders when `portfolioTickers.length > 0 || news.port.length > 0`. Tickers were never populated because the FAB upload never triggered (BUG-021). With no tickers, Refresh skips the portfolio section, so `news.port` stays empty too.

**Fix:** Fixed by BUG-021. Once the FAB correctly triggers the portfolio HTML upload, tickers populate and the Portfolio section becomes visible after Refresh.

---

## BUG-023 · News: Singapore Property section always empty after Refresh

**Status:** Fixed
**Reported:** 2026-04-21
**Fixed in:** `lib/news-utils.ts`, `app/(protected)/news/news-client.tsx`

**Symptom:** The Singapore Property section consistently showed "No stories yet — hit Refresh to generate" even after hitting Refresh. World, Singapore, and Jobs sections populated correctly.

**Root cause:** `parseArr()` used a greedy regex `/\[[\s\S]*\]/` to extract a JSON array from the model's raw text response. When the model included a preamble sentence containing `[N]` (e.g. "Here are [5] stories today:"), the greedy match found the first `[` (in `[5]`) and the last `]` (at the end of the JSON array), producing invalid JSON that `JSON.parse` could not handle. `catch { return [] }` silently swallowed the error and the section stayed empty. The Property search query ("HDB, condo, landed, commercial, launches, policy") triggers this preamble pattern more often than World or Singapore topics.

**Fix:** `parseArr()` now tries `JSON.parse` directly first (fast path for clean responses). On failure, it scans for the last `[` that opens a JSON array of objects or an empty array (pattern `[\s*[{` or `[\s*]`), then parses from there. Moved to `lib/news-utils.ts` for testability.

**Regression test:** `tests/regression/news-property-parse.test.ts`

---

## BUG-024 · News: upload does not auto-generate portfolio news after upload

**Status:** Fixed  
**Reported:** 2026-04-21  
**Fixed in:** `app/(protected)/news/news-client.tsx`

**Symptom:** Uploading a portfolio HTML snapshot extracted tickers correctly and showed "N tickers found" toast, but the Portfolio section remained empty until the user manually clicked Refresh.

**Root cause:** `handleUpload` called `setPortfolioTickers(tickers)` and showed the toast but did not trigger portfolio news generation.

**Fix:** Extracted `refreshPortfolioNews(tickers)` helper. After a successful upload with at least one ticker, `handleUpload` calls `void refreshPortfolioNews(tickers)` immediately — portfolio news generates in the background while the upload UI is already dismissed.

**Regression test:** `tests/components/news-upload-auto-refresh.test.tsx`

---

## BUG-025 · News: Singapore Property section does not auto-fetch when expanded

**Status:** Fixed  
**Reported:** 2026-04-21  
**Fixed in:** `app/(protected)/news/news-client.tsx`

**Symptom:** Expanding the Singapore Property section (collapsed by default) only toggled the collapsed state — it never initiated a fetch. Users had to separately click Refresh to populate it.

**Root cause:** `SectionBlock`'s toggle handler had no hook into the expand event and no `onOpen` callback mechanism.

**Fix:** Added `onOpen?: () => void` prop to `SectionBlock`. The toggle function now calls `onOpen()` when transitioning to open with `items.length === 0 && !loading`. Added `handlePropOpen` in `NewsClient` (guarded by `propFetchedRef` to prevent re-fetching on subsequent collapses/re-expands). Property `SectionBlock` receives `onOpen={handlePropOpen}`.

**Regression test:** `tests/components/news-property-auto-fetch.test.tsx`

---

## BUG-026 · WheresMyMoney: credit card account does not lock payment method

**Status:** Fixed
**Reported:** 2026-04-21
**Fixed in:** `lib/types.ts`, `app/(protected)/components/wheres-my-money.tsx`

**Symptom:** Selecting a credit card account (e.g. "Citi 9773", type `credit_card`) left the payment method dropdown editable with no default value. Users had to manually select "Credit card" every time.

**Root cause:** `AccountType` in `lib/types.ts` did not include `'credit_card'`, so credit card accounts were grouped under no `<optgroup>` in `AccountOptions` and silently excluded from the dropdown. No logic existed to auto-lock payment method based on account type.

**Fix:** Added `'credit_card'` to `AccountType`, `ACCOUNT_TYPE_ORDER`, and `ACCOUNT_TYPE_LABELS`. Added a `useEffect` watching `accountId` + `accounts`: when the selected account has `type === 'credit_card'`, it auto-sets `paymentMethod` to `'credit card'` and sets `paymentMethodLocked = true`, disabling the select. Unlocks automatically when a non-credit-card account is selected.

**Regression test:** `tests/components/wheres-my-money.test.tsx` — BUG-026 describe block

---

## BUG-027 · WheresMyMoney: duplicate category names in category dropdown

**Status:** Fixed (resolved by BUG-028 fix)
**Reported:** 2026-04-21
**Fixed in:** `app/(protected)/components/wheres-my-money.tsx`

**Symptom:** The category dropdown showed duplicate names: "Tools" appeared three times, "Toys" twice, "Travel" twice.

**Root cause:** `filteredCategories` returned all categories (both parent and child rows). Multiple parent categories had subcategories with the same name (e.g. "Toys" under both Shopping and Technology). A flat `<select>` rendering all rows produced visible duplicates.

**Fix:** Resolved by the two-step category picker (BUG-028). Subcategories are now scoped to their selected parent, so duplicate names across different parents never appear simultaneously.

**Regression test:** `tests/components/wheres-my-money.test.tsx` — BUG-027 describe block

---

## BUG-028 · WheresMyMoney: category picker is a flat list; ignores parent_id hierarchy

**Status:** Fixed
**Reported:** 2026-04-21
**Fixed in:** `app/(protected)/components/wheres-my-money.tsx`

**Symptom:** The category dropdown showed all categories in a flat alphabetical list, mixing top-level categories ("Food", "Transport") with subcategories ("Dining Out", "Toys"). Users could not tell which subcategory belonged to which parent.

**Root cause:** The category `<select>` rendered `filteredCategories` (all categories of the matching type) without using the `parent_id` field.

**Fix:** Replaced the flat `<select>` with a two-step picker. The first select shows only parent categories (`parent_id === null`). When a parent with children is selected, a second select appears showing subcategories filtered to that parent (`parent_id === selectedParent`). If the selected parent has no children, it is used as the `category_id` directly. `applyPasteData` and `reset()` updated to handle `parentCategoryId` state.

**Regression test:** `tests/components/wheres-my-money.test.tsx` — BUG-028 describe block

---

## BUG-029 · WheresMyMoney: tag suggestions surface category-named DB entries

**Status:** Fixed
**Reported:** 2026-04-21
**Fixed in:** `app/(protected)/components/wheres-my-money.tsx`

**Symptom:** Typing in the Tags field surfaced entries like "APIs" and "Accessories" — names that are subcategory names rather than user-defined tags. This confused users into thinking the tag system and category system were the same.

**Root cause:** The tags table contained entries whose names matched category/subcategory names (likely created by the OCR receipt flow). The `filteredTagSuggestions` filter had no guard against this.

**Fix:** Added a `categoryNameSet` (case-insensitive Set of all category names) to `filteredTagSuggestions`. Tag suggestions whose names appear in `categoryNameSet` are excluded. Genuine user tags are unaffected; the "Create" option still appears if a user explicitly types a name that happens to match a category.

**Regression test:** `tests/components/wheres-my-money.test.tsx` — BUG-029 describe block

---

## BUG-029 regression · DraftsCard tag picker still shows category-named tags

**Status:** Fixed
**Reported:** 2026-04-21
**Fixed in:** `app/(protected)/components/drafts-card.tsx`

**Symptom:** After BUG-029 was fixed in `wheres-my-money.tsx`, tags with category-like names (e.g. "APIs", "Accessories", "Dining Out") still appeared in the DraftsCard inline edit form's tag picker.

**Root cause:** The `categoryNameSet` exclusion was applied only to `WheresMyMoney`. `DraftsCard` has its own independent tag picker (toggle-button list) that loads tags from `/api/tags` and renders all of them with no filtering. Both components already load `/api/categories`, but `DraftsCard` never used that data to filter tags.

**Fix:** Derived `visibleTags` in `DraftsCard` using the same `categoryNameSet` pattern. The tag picker now renders `visibleTags` instead of `tags`, excluding any tag whose name (case-insensitive) matches a loaded category name.

**Regression test:** `tests/components/drafts-card.test.tsx` — "BUG-029 regression" describe block

---

## BUG-031 · Portfolio: UNREALISED P&L shows "--" when snapshot uploaded without unrealised_pnl

**Status:** Fixed
**Reported:** 2026-04-22
**Fixed in:** `app/api/portfolio/snapshots/route.ts`

**Symptom:** The UNREALISED KPI on the portfolio page showed "--" (double dash) even though all holdings had individual P&L values. Total VALUE was correct; only the aggregate unrealised figure was missing.

**Root cause:** `GET /api/portfolio/snapshots` returned `snap.unrealised_pnl` directly from the DB column. Snapshots uploaded via the blessings-of-root-bless-this skill omit this field in the POST body, causing `unrealised_pnl ?? null` to store NULL. The handler had no fallback to compute the aggregate from the holdings' individual `pnl` values in `portfolio_holdings`.

**Fix:** After loading holdings in the GET handler, if `snap.unrealised_pnl === null`, compute the aggregate by summing `pnl` from all holdings rows that have a non-null value. If no holdings have pnl values, `unrealised_pnl` remains null (renders "--" correctly). Explicit DB values are always respected and never overridden.

**Regression test:** `tests/api/portfolio-snapshots.test.ts` — "BUG-031: backfills unrealised_pnl from holdings when snapshot has null unrealised_pnl" describe block

---

## BUG-030 · OCR receipt: Date/Time field defaults to current timestamp instead of receipt date

**Status:** Fixed
**Reported:** 2026-04-21
**Fixed in:** `lib/parse-bless-this.ts`, `app/api/receipts/process/route.ts`

**Symptom:** After processing a receipt via OCR, the Date/Time field on the resulting draft showed the current timestamp (e.g. "21/04/2026, 14:05") instead of the date printed on the receipt.

**Root cause (primary):** `normaliseDate` in `parse-bless-this.ts` only handled four numeric date formats (YYYY-MM-DD, DD/MM/YYYY, MM-DD-YYYY, YYYYMMDD). Receipts commonly print dates as "21 Apr 2026", "Apr 21, 2026", "21.04.2026", or "21/04/26". When Claude outputs the date in one of these formats (which it often does, particularly for text-month formats), `normaliseDate` fell through and returned the raw string. `new Date("21 Apr 2026T00:00:00+08:00")` is an Invalid Date; calling `.toISOString()` on it throws `RangeError: Invalid time value`, causing the route to 500. Claude learned to omit the `Date:` line to avoid this, triggering the `new Date().toISOString()` fallback.

**Root cause (secondary):** The `RECEIPT_PROMPT` said "If a field cannot be determined, omit that line entirely" without distinguishing Date as a field that's almost always present. Combined with the 500 risk, Claude would skip Date for any receipt with a non-ISO date format.

**Fix (`lib/parse-bless-this.ts`):** Extended `normaliseDate` to handle six additional formats:
- `DD.MM.YYYY` (dot separator)
- `DD/MM/YY` (short year, century assumed 2000+)
- `DD-MM-YYYY` (dash, day-first for SG locale)
- `D Mon YYYY` / `D Month YYYY` (e.g. "21 Apr 2026", "21 April 2026")
- `Mon D, YYYY` / `Month D, YYYY` (e.g. "Apr 21, 2026", "April 21, 2026")

**Fix (`app/api/receipts/process/route.ts`):** Added `isNaN(sgtDate.getTime())` guard so an unrecognised date format falls back to current time gracefully instead of throwing. Strengthened `RECEIPT_PROMPT` to explicitly tell Claude that dates appear on virtually all receipts and to output them in any format (converter handles the normalisation).

**Regression tests:** `tests/parse-bless-this.test.ts` — six new date format cases; `tests/api/receipts.test.ts` — BUG-030 datetime extraction, fallback, and no-crash cases

---

## BUG-031 · Savings gauge SVG overflows on real Android phones (5th report — SVG removed)

**Status:** Fixed (5th attempt — SVG removed entirely)
**Reported:** 2026-04-22
**Fixed in:** `app/(protected)/components/expense-dashboard.tsx`

**Symptom:** The savings gauge arc was clipped or overflowing its card on real Android phones. PRs #64, #65, #66, #67 all deployed fixes that passed emulator tests but failed on physical devices.

**Root cause:** SVG sizing is fundamentally unreliable on mobile browsers in flex containers. All four prior attempts (overflow:hidden, aspectRatio CSS, intrinsic width/height HTML attrs) failed on real Android. The SVG approach itself is the problem.

**Fix:** Removed the entire SVG arc gauge. Replaced `SavingsGauge` with a plain-div horizontal progress bar: outer `div` with `overflow:hidden`/`border-radius` as the track, inner `div` with `width: ${progress}%` as the fill, and a text label below. No SVG, no arc geometry, no viewBox. Cannot overflow or collapse.

**Regression test:** `tests/regression/gauge-overflow.test.tsx` — updated to assert no SVG present, bar div with overflow:hidden, and correct label text

---

## BUG-033 · Portfolio upload fails on prod: missing tables + no JSON error responses

**Status:** Fixed
**Reported:** 2026-04-22
**Fixed in:** `app/api/migrate/route.ts`, `app/api/portfolio/route.ts`, `app/api/portfolio/snapshots/route.ts`

**Symptom:** On prod, uploading a portfolio HTML file shows "Upload failed" toast and the portfolio page shows "Failed to load portfolio". PR #66 (BUG-032 fix) deployed but did not resolve the prod errors.

**Root cause (primary):** The `/api/migrate` route never created the `portfolio_holdings` table. When `POST /api/portfolio` (the HTML upload route) tried to `INSERT INTO portfolio_holdings`, it threw "no such table: portfolio_holdings". The route had no try-catch, so Next.js returned a 500 HTML error page. The client called `res.json()` on that HTML, which threw `SyntaxError`, landing in the outer `catch` → "Upload failed" toast.

**Root cause (secondary):** The `/api/migrate` route created `portfolio_realised_trades` (wrong name) instead of `portfolio_realised`. The `GET /api/portfolio/snapshots` route (used to load the portfolio page) queries `portfolio_realised`. After an HTML upload, once a snapshot with `snap_label` existed, this SELECT failed → same 500 HTML path → "Failed to load portfolio".

**Root cause (tertiary):** `portfolio_growth` was created by the migration with `next TEXT` instead of `next_text TEXT` and without a `label TEXT` column, diverging from the schema that `GET /api/portfolio/snapshots` expects.

**Fix (migrate route):** Replaced the `portfolio_realised_trades` CREATE with the correct `portfolio_realised` table (columns: `id, snapshot_id, key, value, note, trade_date, created_at`). Added `portfolio_holdings` CREATE TABLE with all required columns. Fixed `portfolio_growth` schema (`label TEXT, next_text TEXT`). Added ALTER TABLE migrations to patch existing `portfolio_growth` tables with wrong column names. All table creations now tracked individually in the `migrations` response.

**Fix (API routes):** Wrapped all DB operations in `POST /api/portfolio` and `GET /api/portfolio/snapshots` in try-catch. On DB failure, routes return `Response.json({ error: '...' }, { status: 500 })` instead of throwing — so `res.json()` never throws in the client, and the actual error message is surfaced.

**Regression test:** `tests/regression/portfolio-migration.test.ts`

---

## BUG-031 · Dashboard: savings gauge SVG overflows card on mobile (3rd report)

**Status:** Fixed
**Reported:** 2026-04-21
**Fixed in:** `app/(protected)/components/expense-dashboard.tsx`

**Symptom:** On mobile (375px), the savings-rate semicircle arc extended well beyond the card boundaries — the arc top appeared above the "EXPENSE DASHBOARD" title and time-period pills (1D, 7D, 1M, 3M, Custom), the sides overflowed past the card edges, and the 3M pill was hidden behind the gauge. Reported three times; PR #61 was supposed to fix it but didn't.

**Root cause (corrected after PR #64 regression):** The actual root cause is SVG height collapse on mobile. Without an explicit `aspectRatio`, mobile browsers (Safari/iOS, Chrome Android) collapse the SVG element's layout height to near-zero when inside certain block containers and the intrinsic height cannot be derived from CSS alone. Switching `overflow: 'visible'` → `overflow: 'hidden'` in PR #64 exposed this: `overflow: hidden` clips the SVG viewport, so a near-zero-height SVG clipped the arc into disconnected fragments rather than letting it overflow. `overflow: visible` masked the collapse by painting the arc outside bounds (as seen in the original bug — arc over the header). The fix is to prevent the height collapse, not just to clip the result.

**Fix:** Added `aspectRatio: '200 / 120'` to the SVG element — this forces the browser to maintain the correct height relative to the SVG width, preventing collapse. Changed `overflow: 'visible'` → `overflow: 'hidden'` to prevent residual overflow. Reverted wrapper back to `textAlign: 'center'` with `overflow: 'hidden'` defense-in-depth. Arc geometry (viewBox, cy, cx, radius) unchanged.

**Regression test:** `tests/regression/gauge-overflow.test.tsx`

---

## BUG-032 · Portfolio: HTML upload silently invisible after PR #63 refactor

**Status:** Fixed
**Reported:** 2026-04-22
**Fixed in:** `app/api/portfolio/route.ts`

**Symptom:** Uploading a Syfe HTML export on the Portfolio page showed "Upload failed" toast (or succeeded silently) but the dashboard never reflected the uploaded data — the UploadPanel reappeared immediately after upload.

**Root cause:** PR #63 refactored `portfolio-client.tsx` to use `GET /api/portfolio/snapshots` (v2 route) for display, which filters `WHERE snap_label IS NOT NULL`. However, `POST /api/portfolio` (the v1 upload route) continued inserting snapshots with `snap_label = null` and did not insert into the `portfolio_holdings` child table. Result: every HTML upload was structurally invisible to the v2 read path. Additionally, on fresh production deployments where `/api/migrate` had not been run, columns like `snap_label` might not exist, causing the INSERT to throw → 500 HTML response → `res.json()` throws SyntaxError → outer `catch` fires "Upload failed" toast.

**Fix (`app/api/portfolio/route.ts` POST):**
1. Auto-generate `snap_label` from the snapshot date (e.g. "22 Apr 2026 (HTML import)") so it is never null.
2. After inserting into `portfolio_snapshots`, also insert each parsed holding into the `portfolio_holdings` table so the v2 GET can read them.
3. Keep `holdings_json` populated for backward compatibility with the v1 GET route.

**Regression tests:** `tests/regression/portfolio-upload.test.ts`


---

## BUG-035 · Portfolio: HTML upload resets Realised, Cash, Net Invested to zero

**Status:** Fixed
**Reported:** 2026-04-22
**Fixed in:** `app/api/portfolio/route.ts`

**Symptom:** After uploading a Syfe HTML export on the Portfolio page, the Realised KPI dropped from its correct value (e.g. +$430.88) to +$0.00, and Cash dropped from $87.45 to $0.00. The portfolio was visually "broken" even though holdings imported correctly.

**Root cause:** `POST /api/portfolio` defaulted `realised_pnl`, `cash`, and related financial context to `0` / `null` when not provided in the request body. The UploadPanel only sends `{ html, snapshot_date }` — Syfe HTML exports do not contain realised P&L, cash balance, or net invested data. So every HTML upload silently overwrote the previous snapshot's financial context with zeros.

**Fix (`app/api/portfolio/route.ts` POST):**
Before inserting a new snapshot, if `cash` and `realised_pnl` are absent from the request, fetch the most recent previous v2 snapshot and carry forward: `realised_pnl`, `cash`, `net_invested`, `net_deposited`, `dividends`, and sets `prior_*` fields from the previous snapshot so vs-prev comparisons continue to work. Explicit values in the request are always respected and never overridden.

**Regression tests:** `tests/regression/portfolio-upload.test.ts` — BUG-035 describe block

---

## BUG-038 · Accounts page: credit_card accounts not displayed

**Status:** Fixed
**Reported:** 2026-04-22
**Fixed in:** `app/(protected)/accounts/page.tsx`

**Symptom:** Credit card accounts (type `credit_card`) were invisible on the /accounts page — they did not appear under any section heading, and `credit_card` was absent from the Type dropdown when creating or editing an account.

**Root cause:** `TYPE_ORDER` and `TYPE_LABEL` on lines 16–17 of the accounts page were missing `credit_card`. `groupByType` added credit_card accounts to the groups map, but `TYPE_ORDER.map(...)` never iterated over them, so they silently dropped from the render.

**Fix:** Added `'credit_card'` to `TYPE_ORDER` (between `cash` and `fund`) and `credit_card: 'Credit Card'` to `TYPE_LABEL`.

**Regression test:** `tests/components/accounts-page-credit-card.test.tsx`

---

## BUG-039 · Edit screens: switching type to Transfer shows no destination account picker

**Status:** Fixed
**Reported:** 2026-04-22
**Fixed in:** `app/(protected)/components/drafts-card.tsx`, `app/(protected)/components/recent-transactions.tsx`

**Symptom:** In the Dashboard edit screens (DraftsCard inline edit form and RecentTransactions inline edit form), switching a transaction's type to "Transfer" did not reveal a "To Account" destination account picker. The category picker was also still shown for transfer transactions in RecentTransactions, and `to_account_id` was never included in the PATCH body on save.

**Root cause:** Both `DraftsCard` and `RecentTransactions` had incomplete `EditForm`/`EditRow` interfaces and edit form UIs. The working reference (`transactions/page.tsx`) had the pattern correct: `to_account_id` in the form state, a conditional "To Account" `<select>` when `type === 'transfer'`, hidden `CategoryPicker` for transfers, and `to_account_id` in the PATCH body. Neither dashboard component implemented any of this.

**Fix:**
- `DraftsCard`: Added `to_account_id` to `EditForm` interface and `txToForm()`, added conditional "To Account" select when `editForm.type === 'transfer'`, added `to_account_id` to `saveEdit()` PATCH body.
- `RecentTransactions`: Added `toAccountId` to `EditRow` interface and `startEdit()`, added conditional "To Account" select when `tx.type === 'transfer'`, hidden `CategoryPicker` for transfers, added `to_account_id` to `saveEdit()` PATCH body.

**Regression tests:** `tests/components/drafts-card.test.tsx` — BUG-039 describe block; `tests/components/recent-transactions.test.tsx` — BUG-039 describe block

---

## BUG-040 · News: "Upload Portfolio" button shown in sub-nav toolbar

**Status:** Fixed
**Reported:** 2026-04-23
**Fixed in:** `app/(protected)/news/news-client.tsx`

**Symptom:** The sticky sub-nav toolbar on the News page contained an "Upload Portfolio" button alongside the section jump links and Refresh button. This was redundant — portfolio upload is already accessible via the (+) FAB in the bottom nav (which dispatches `news:open-upload` per BUG-021 fix). The button cluttered the toolbar.

**Fix:** Removed the Upload Portfolio button from the sub-nav toolbar. The hidden `<input ref={fileRef}>` and `news:open-upload` event listener are retained so the FAB continues to work.

**Regression test:** `tests/components/news-client-fab.test.tsx` — "Upload Portfolio button is NOT rendered in the sub-nav toolbar (BUG-040)"

---

## BUG-041 · News: Singapore Property shows gray skeleton cards every page load

**Status:** Fixed
**Reported:** 2026-04-23
**Fixed in:** `app/(protected)/news/news-client.tsx`

**Symptom:** Every time the user navigated to the News page and expanded the Singapore Property section, 3 animated gray skeleton cards appeared for 10–30 seconds while an agentic API call was made — even when the DB already held a recent Property brief (empty or with stories).

**Root cause:** `propFetchedRef` (the guard preventing repeated auto-fetches within a session) was only set to `true` by `handlePropOpen`. Neither `loadBrief` (which loads the DB brief on mount) nor `handleRefresh` (which refreshes all sections including Property) updated `propFetchedRef`. On every page load, `propFetchedRef.current = false`. If the Property section was expanded with `items.length === 0` (regardless of whether the DB had already been refreshed), `handlePropOpen` triggered, showing skeleton cards and making a redundant API call.

**Fix:**
- `loadBrief`: after successfully parsing DB data that contains a `prop` key, sets `propFetchedRef.current = true` — respects the DB result and skips auto-fetch.
- `loadBrief`: changed `setNews(parsed)` to `setNews({ ...EMPTY_SECTIONS, ...parsed })` — prevents potential crash if DB data is from an older format that lacks some `QsBriefSections` keys.
- `handleRefresh`: after finishing the `prop` section refresh, sets `propFetchedRef.current = true` — within the same session, no redundant auto-fetch after a manual Refresh.

**Regression test:** `tests/components/news-property-auto-fetch.test.tsx` — "does NOT trigger a generate call when DB brief already has prop: [] (BUG-041)"

---

## BUG-050 · Portfolio: Geo/Sector tabs show stale FX disclaimer text

**Status:** Fixed
**Reported:** 2026-04-24
**Fixed in:** `app/(protected)/portfolio/portfolio-client.tsx`

**Symptom:** The Geo tab showed "~USD totals · SGD≈0.74 · GBP≈1.29" and the Sector tab showed "~USD totals · NON-USD APPROXIMATED" disclaimer footnotes. After FX conversion was removed (BUG-048), these disclaimers became misleading remnants.

**Fix:** Removed both disclaimer `<div>` elements from `GeoTab` and `SectorTab`.

**Regression test:** `tests/components/portfolio-client.test.tsx` — "BUG-050" describe block

---

## BUG-049 · Portfolio: topbar contains dead HTML-upload file input after UploadArea added

**Status:** Fixed
**Reported:** 2026-04-24
**Fixed in:** `app/(protected)/portfolio/portfolio-client.tsx`

**Symptom:** The topbar contained a hidden `<input type="file" accept=".html,.htm">` wired to the old `handleFile` HTML-upload flow. Now that `UploadArea` (screenshot OCR) is behind the "+" modal (BUG-046), the old HTML-upload button and its associated `fileRef`, `handleFile`, `uploading` state, `portfolioTickers` state, and `portfolio:open-upload` event listener are dead code.

**Fix:** Removed the hidden file input, `fileRef`, `handleFile`, `uploading` state, `portfolioTickers` state, and the `portfolio:open-upload` event listener from `PortfolioClient`. `NewsClient` receives `sharedTickers={[]}`.

**Regression test:** `tests/components/portfolio-client.test.tsx` — "BUG-049" describe block

---

## BUG-048 · Portfolio: Geo/Sector/Holdings tabs apply FX conversion to market_value

**Status:** Fixed
**Reported:** 2026-04-24
**Fixed in:** `app/(protected)/portfolio/portfolio-client.tsx`

**Symptom:** `HoldingsTab`, `GeoTab`, `SectorTab`, and `WhatIfTab` all called `valueUSD(h)` which multiplied `market_value` by a hardcoded FX rate (`SGD×0.74`, `GBP×1.29`). This produced approximate USD-converted totals (displayed with `~$`) rather than the portfolio's authoritative `total_value` from the API. The conversion also caused incorrect sort order and weight percentages for non-USD holdings.

**Fix:** Removed the `FX` constant and `valueUSD` function. All tabs now use `h.market_value` directly for sorting, weighting, and totals. The `~$` approximate prefix and the KPI row's secondary "~$X USD" value were removed.

**Regression test:** `tests/components/portfolio-client.test.tsx` — "BUG-048" describe block

---

## BUG-046 · Portfolio: UploadArea should be in a modal behind a Plus button

**Status:** Fixed
**Reported:** 2026-04-24
**Fixed in:** `app/(protected)/portfolio/upload-modal.tsx` (new), `app/(protected)/portfolio/portfolio-client.tsx`

**Symptom:** The `UploadArea` OCR screenshot upload (added in BUG-042 fix) was rendered inline between the KPI row and the tab bar — always occupying screen real estate regardless of whether the user wants to upload.

**Root cause:** BUG-042 fix placed `<UploadArea>` unconditionally in the snapshot-exists branch, causing it to always be visible.

**Fix:** Created `UploadModal` (modelled after `DownloadsModal`) wrapping `UploadArea`. Added a "+" button in the topbar that opens the modal. Removed the inline `<UploadArea>` between KPI and tab bar. Empty state (`!snapshot`) retains the inline upload. On successful upload, the modal calls both `onUploaded` and `onClose`.

**Regression tests:** `tests/components/portfolio-client.test.tsx` — "BUG-046" describe block; BUG-042 describe block updated to assert "+" button in topbar.

---

## BUG-045 · /api/migrate GET handler returns snapshot list instead of running migrations

**Status:** Fixed
**Reported:** 2026-04-24
**Fixed in:** `app/api/migrate/route.ts`

**Symptom:** `GET /api/migrate` returned `{ snapshots: [...] }` — a diagnostic list of recent portfolio snapshots — instead of running the migration suite. Any tool or browser navigating to `/api/migrate` received useless data and migrations were not applied.

**Root cause:** The GET handler body was a copy-paste from the portfolio snapshots route and was never updated. The migration logic lived only in POST.

**Fix:** Extracted the POST body into an `async function runMigrations()`. Both GET and POST now call `return runMigrations()` after the auth check. The old snapshot-listing SELECT was removed.

**Regression tests:** `tests/api/migrate-category-remap.test.ts` — "BUG-045" describe block.

---

## BUG-042 · Portfolio: screenshot UploadArea not visible when portfolio data exists

**Status:** Fixed
**Reported:** 2026-04-24
**Fixed in:** `app/(protected)/portfolio/portfolio-client.tsx`

**Symptom:** After PR #88 added the `UploadArea` OCR screenshot upload component, users who already had portfolio data could not see the upload UI. The page only showed a small "Downloads" button in the topbar with no way to upload new screenshots.

**Root cause:** `UploadArea` was gated behind `!snapshot` — it only rendered when there was no portfolio data at all. Users with existing snapshots never saw it.

**Fix:** Added `<UploadArea onUploaded={load} />` between the KPI row and the tab bar in the snapshot-exists branch of `PortfolioClient`, so it is always prominently visible regardless of whether snapshot data exists.

**Regression test:** `tests/components/portfolio-client.test.tsx` — "BUG-042 – screenshot upload accessible when snapshot data exists"

---

## BUG-043 · Portfolio scan: "Scan failed" when Anthropic fetch throws or times out

**Status:** Fixed
**Reported:** 2026-04-24
**Fixed in:** `app/api/portfolio/scan/route.ts`

**Symptom:** Clicking "Scan N screenshots" on the portfolio page shows "Scan failed" in red text. The upload UI works correctly (files are selected and submitted), but the POST /api/portfolio/scan endpoint silently fails.

**Root cause 1 — No try/catch around Anthropic fetch:** The `fetch()` call to `https://api.anthropic.com/v1/messages` had no try/catch. If `fetch()` itself throws (network error, Vercel killing the function on timeout), the route handler throws an unhandled exception. Next.js returns a 500 response with an HTML error page instead of JSON. The client's `res.json()` call throws a SyntaxError, `data` is set to `{}`, and `data.error ?? 'Scan failed'` resolves to "Scan failed".

**Root cause 2 — No maxDuration:** No `export const maxDuration` was set on the route. Vercel defaults to 10s (Hobby) or 15s (Pro) for serverless functions. OCR of 5 screenshots in a single Claude vision call can take 15–30 seconds, causing Vercel to kill the function mid-execution before a response is sent.

**Root cause 3 — Anthropic error body swallowed:** When Anthropic returns a 4xx/5xx, the route returned `{ error: 'OCR failed' }` without reading the Anthropic error body. This makes it impossible to diagnose what specifically failed (too-large request, invalid model, rate limit, etc.).

**Fix:** Added `export const maxDuration = 60` to extend the Vercel function timeout. Wrapped the Anthropic `fetch` call in a try/catch that returns a JSON error on network failure. When `!anthropicRes.ok`, the route now reads the Anthropic error body and surfaces it in the response.

**Regression tests:** `tests/api/portfolio-scan.test.ts` — "BUG-043" describe block

---

## BUG-044 · Portfolio scan: "Scan failed" persists — DB crash + Vercel timeout on multi-image call

**Status:** Fixed
**Reported:** 2026-04-24
**Fixed in:** `app/api/portfolio/scan/route.ts`

**Symptom:** Scan still returns "Scan failed" after BUG-043 fix. BUG-043 only added try/catch around the Anthropic `fetch()` call, but two additional crash paths remain unprotected.

**Root cause 1 — No top-level try/catch:** DB operations (`INSERT INTO portfolio_holdings`, `INSERT INTO portfolio_snapshots`, etc.) have no error handling. If the production database schema is missing columns added by migrations (e.g. `day_high`, `day_low`, `prev_close` on `portfolio_holdings` — added as ALTER TABLE in PR #86 — when `/api/migrate` wasn't run after PR #86), these INSERTs throw an unhandled exception. Next.js returns an HTML 500 page instead of JSON. The client's `res.json()` fails, `data = {}`, and "Scan failed" appears.

**Root cause 2 — Single Anthropic call for N images times out:** All images are sent in a single Claude API call. With 5 screenshots, this can take 15–30s. Vercel serverless functions are capped at 10s (Hobby) or 60s (Pro). When Vercel kills the function, the connection is dropped before any response is sent — this cannot be caught by try/catch inside the function. The client receives no response or a 504 HTML page → "Scan failed".

**Fix:**
1. Added a top-level `try/catch` around the entire `POST` handler body with `console.error` logging. Any unhandled exception now returns `{ error: "Scan error: <message>" }` instead of crashing silently.
2. Extracted `scanOneImage()` — a helper that calls the Anthropic API for a single image and returns `{ results }` or `{ error }`. The route now processes images in parallel (one Claude call per image). Each call completes in 2–5s; 5 parallel calls finish in ~5s total — well within any Vercel timeout tier.
3. Partial-success handling: if some images succeed and some fail, results from the successful images are used. The scan only returns an error if ALL images fail.

**Regression tests:** `tests/api/portfolio-scan.test.ts` — "BUG-044" describe block

---

## BUG-051 · Portfolio: FAB opens HTML file picker instead of screenshot upload modal

**Status:** Fixed
**Reported:** 2026-04-24
**Fixed in:** `app/(protected)/portfolio/portfolio-client.tsx`

**Symptom:** Tapping the orange FAB ("+") button in the bottom nav while on the Portfolio page opened the OS file picker filtered to `.html/.htm` files (the old HTML-snapshot import mechanism) instead of the screenshot upload area.

**Root cause:** The `portfolio:open-upload` event listener called `fileRef.current?.click()`, which triggered a hidden `<input type="file" accept=".html,.htm">` in the topbar — a leftover from the old HTML-import flow. The new upload mechanism is `UploadArea` (screenshot OCR), which has its own internal file ref. The FAB never connected to it.

**Fix:** Removed the hidden HTML file input from the topbar and the associated `handleFile` / `fileRef` / `uploading` state. The `portfolio:open-upload` listener now calls `setShowUpload(true)`, which renders `UploadArea` in an `<UploadModal>` overlay. The modal closes when the upload completes or the user dismisses it.

**Regression tests:** `tests/components/portfolio-client-news-tab.test.tsx` — "portfolio:open-upload event opens the screenshot upload modal when snapshot exists (BUG-051)"

---

## BUG-052 · Portfolio: Value KPI shows FX-approximated ~USD secondary value

**Status:** Fixed
**Reported:** 2026-04-24
**Fixed in:** `app/(protected)/portfolio/portfolio-client.tsx`

**Symptom:** The Value KPI displayed a secondary line `~$XX USD` computed from hardcoded FX rates (`SGD≈0.74`, `GBP≈1.29`). The Geo and Sector tabs showed `~USD totals · SGD≈0.74 · GBP≈1.29` and `~USD totals · NON-USD APPROXIMATED` disclaimers. Holdings were sorted and weighted by this FX-converted estimate rather than their stored `market_value`.

**Root cause:** A `FX: Record<string, number>` constant and a `valueUSD(h)` helper were used throughout the component to convert non-USD holdings to approximate USD totals for sorting, weighting, and display. This produced inaccurate displayed values that diverged from the DB-stored `market_value`.

**Fix:** Removed the `FX` constant and `valueUSD()` function. All sorting, weighting, and display now use `h.market_value` directly. Removed the `~$XX USD` secondary value from the Value KPI. Removed the FX footnotes and "NON-USD APPROXIMATED" disclaimers from Geo and Sector tabs.

**Regression tests:** `tests/components/portfolio-client.test.tsx` — "BUG-052 – Value KPI shows no FX-approximated USD value"

---

## BUG-053 · Portfolio: holdings display values exactly as stored in DB

**Status:** Fixed (verified — no client-side transformation found)
**Reported:** 2026-04-24
**Fixed in:** `app/(protected)/portfolio/portfolio-client.tsx` (verified; BUG-052 fix removed the only transformation)

**Symptom:** Concern that `market_value`, `pnl`, `pnl_pct`, and `change_1d_pct` might be transformed client-side before display.

**Root cause:** After BUG-052, no client-side transformations remain. `market_value` is displayed directly; `pnl`, `pnl_pct`, and `change_1d_pct` are passed through `fmt()` / `fmtPct()` for locale formatting only (no value change).

**Regression tests:** `tests/components/portfolio-client.test.tsx` — "BUG-053 – holdings display values exactly as stored in DB"
