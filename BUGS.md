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

## BUG-011 · News: upload FAB does not auto-generate portfolio news after upload

**Status:** Fixed  
**Reported:** 2026-04-21  
**Fixed in:** `app/(protected)/news/news-client.tsx`

**Symptom:** Clicking "Upload Portfolio" and selecting a portfolio HTML snapshot extracted tickers correctly and showed "N tickers found" toast, but the Portfolio section remained empty ("No stories yet — hit Refresh to generate"). Users had to manually click Refresh to get portfolio news, making the upload appear to do nothing.

**Root cause:** `handleUpload` called `setPortfolioTickers(tickers)` and showed the toast but did not trigger portfolio news generation. The only path to generating portfolio news was the full `handleRefresh` button which the user had to discover and click separately.

**Fix:** Extracted `refreshPortfolioNews(tickers)` from `handleRefresh`. After a successful upload with at least one ticker, `handleUpload` calls `void refreshPortfolioNews(tickers)` immediately — the portfolio loading state activates and news is generated in the background while the upload UI is already dismissed.

**Regression test:** `tests/components/news-upload-auto-refresh.test.tsx`

---

## BUG-012 · News: Singapore Property section shows empty state instead of fetching on expand

**Status:** Fixed  
**Reported:** 2026-04-21  
**Fixed in:** `app/(protected)/news/news-client.tsx`

**Symptom:** The Singapore Property section (collapsed by default) shows "No stories yet — hit Refresh to generate." when expanded. Tapping the section header only toggled the collapsed state; it never initiated a fetch. Users had to separately click the global Refresh button to populate it.

**Root cause:** `SectionBlock`'s toggle handler called `setOpen(v => !v)` only — no hook into the section's expand event. The component had no `onOpen` callback mechanism and no fetch was ever scheduled on section expand.

**Fix:** Added `onOpen?: () => void` prop to `SectionBlock`. The toggle function now calls `onOpen()` when transitioning to open and `items.length === 0 && !loading`. Added `handlePropOpen` in `NewsClient` that fetches property news on first call (guarded by `propFetchedRef` to prevent re-fetching on subsequent collapses/re-expands). Property `SectionBlock` receives `onOpen={handlePropOpen}`.

**Regression test:** `tests/components/news-property-auto-fetch.test.tsx`
