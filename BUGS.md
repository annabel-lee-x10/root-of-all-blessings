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
