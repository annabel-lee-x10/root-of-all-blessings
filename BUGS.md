# Known Bugs

Track confirmed bugs here before they are fixed. Format:
`**[ID]** Short description — discovered date, affected file`

---

**BUG-001** `PATCH /api/transactions/[id]` and `DELETE /api/transactions/[id]` do not call `verifySession()`, meaning authenticated endpoints are missing auth checks — discovered 2026-04-19, `app/api/transactions/[id]/route.ts`

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
