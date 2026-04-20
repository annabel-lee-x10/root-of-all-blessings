# Bulk Receipt Upload & Voice Input — Design Spec
**Date:** 2026-04-19  
**Status:** Approved for implementation

---

## Overview

Add bulk receipt photo upload and voice-to-text expense capture to the Where's My Money page. Processed receipts become draft transactions stored in the DB, reviewable and approvable in a collapsible card at the bottom of the same page.

---

## Architecture

### Database Migration

Add `status TEXT NOT NULL DEFAULT 'approved'` to the `transactions` table. Existing rows default to `'approved'` — no data loss. Drafts created by receipt/voice processing get `status='draft'`.

Migration is idempotent (ALTER TABLE in try/catch). Added to both:
- `scripts/migrate.ts` (local dev)
- `app/api/migrate/route.ts` (production endpoint)

### Transaction Filtering

`GET /api/transactions` defaults to returning only `status='approved'` rows (with `IS NULL` fallback for pre-migration rows). Accepts optional `?status=draft` to return drafts for the DraftsCard.

---

## New API Endpoints

### `POST /api/receipts/process`

Processes a single receipt image via Claude Sonnet vision.

**Request:**
```json
{ "imageBase64": "<base64>", "mediaType": "image/jpeg", "merchantLookup": false, "accountId": "<id>" }
```
`accountId` is provided by the client (from localStorage `wmm_last_account`). If missing, server falls back to first active account.

**Flow:**
1. `verifySession()` — 401 if invalid
2. Validate: imageBase64 present, mediaType starts with `image/`, decoded size ≤ 5 MB, max 10 concurrent drafts per session (not enforced server-side, client controls)
3. Fetch all categories and tags from DB (for matching)
4. Resolve account: query `SELECT id FROM accounts WHERE is_active=1 ORDER BY updated_at DESC LIMIT 1` as fallback — but client always sends `accountId` from localStorage `wmm_last_account`
5. Call Claude `claude-sonnet-4-6` vision API with structured extraction prompt (same field set as bless-this skill: amount, currency, payee, date, time, category, tags, description, payment_method)
6. If `merchantLookup=true`: second Claude text call with web_search tool (beta) for merchant context, appended to description
7. Parse response with `parseBlessThis()`
8. Match `category` name to existing category (case-insensitive) → `category_id` or null
9. Resolve tags: match existing by name, create new tags for unmatched
10. INSERT transaction with `status='draft'`, `type='expense'`
11. Return full `TransactionRow` (with tags joined)

**Error responses:** 400 (validation), 401 (auth), 503 (no API key), 500 (processing failed)

---

### `POST /api/receipts/voice`

Processes a voice transcript (already transcribed client-side by Web Speech API).

**Request:**
```json
{ "text": "<transcript>", "accountId": "<id>" }
```

**Flow:** Identical to image processing but uses a text-mode Claude prompt (no vision, no image content block). The prompt follows bless-this text mode: parse natural language to extract expense fields.

---

## New UI Components

### `ReceiptDropzone` — `app/(protected)/components/receipt-dropzone.tsx`

Placed between `<WheresMyMoney />` and `<ExpenseDashboard />` on the dashboard page.

**State per file:**
```ts
{ file: File; status: 'waiting' | 'uploading' | 'done' | 'error'; draft?: TransactionRow; error?: string }
```

**Features:**
- Drag-and-drop zone + file picker (accept `image/*`, max 10)
- "Merchant web lookup" checkbox — off by default, shows spinner + latency warning when checked
- Upload button: fires serial API calls, updates per-file status row in real-time
- **Voice mic button**: uses `SpeechRecognition` / `webkitSpeechRecognition`, shows recording animation while active, sends final transcript to `/api/receipts/voice` on stop
- On draft created: dispatch `new CustomEvent('drafts-updated')` so DraftsCard refreshes
- Mobile-first: large tap targets, touch-friendly drop zone with visual affordance

**Per-file progress row shows:**
- Filename + thumbnail
- Status indicator: waiting (grey) / uploading (spinner) / done (green ✓) / error (red ×)
- Error message if failed

---

### `DraftsCard` — `app/(protected)/components/drafts-card.tsx`

Placed after `<RecentTransactions />` on the dashboard page (last section).

**Features:**
- Collapsed by default with count badge (`X drafts pending review`)
- Expand shows list of draft transactions
- Each draft: inline edit form (same field set as existing TransactionsPage edit form — type, amount, currency, account, category, payee, note, datetime, tags, payment_method)
- Save changes: PATCH `/api/transactions/[id]` — loading state + success confirmation
- Approve individual: PATCH with `{ status: 'approved' }` — removes from list
- Bulk approve all: batch PATCH — with "Approving..." loading state
- Delete: DELETE `/api/transactions/[id]`
- Listens for `drafts-updated` custom event to refresh

**Empty state:** "No drafts. Upload receipts above to get started."

---

## Modified Files

| File | Change |
|------|--------|
| `lib/types.ts` | Add `status?: 'draft' \| 'approved'` to `Transaction` |
| `scripts/migrate.ts` | Add `transactions.status` idempotent migration |
| `app/api/migrate/route.ts` | Add `transactions.status` migration entry |
| `app/api/transactions/route.ts` | GET: default filter `status != 'draft'`; accept `?status=draft` |
| `app/api/transactions/[id]/route.ts` | Add `'status'` to UPDATABLE array (needed for approve flow) |
| `app/(protected)/page.tsx` | Add `<ReceiptDropzone />` + `<DraftsCard />` |
| `tests/helpers.ts` | Add `status` column to test schema + `seedTransaction` opts |
| `BUGS.md` | Create (empty known bugs log) |
| `TEST_STRATEGY.md` | Create (documents test conventions) |

---

## Claude Prompt — Receipt Vision

```
You are a receipt parser for a personal finance app. Extract all available expense information from this receipt image.

Output EXACTLY in this format (omit lines you cannot determine):
Amount: [total amount, numbers only]
Currency: [3-letter code, default SGD]
Merchant/Payee: [store or vendor name]
Date: [YYYY-MM-DD]
Time: [HH:MM 24h]
Category: [one of: Food, Transport, Housing, Bills, Health, Entertainment, Subscriptions, Education, Pet, Other]
Tags: [3-5 lowercase comma-separated contextual tags]
Description: [1-2 sentence description of the purchase context]
Payment Method: [cash/credit card/debit card/e-wallet]
Notes: [any extra detail]

Rules:
- Amount is the grand total (GST-inclusive if shown)
- Category inferred from merchant type and line items
- Tags: use item types, time of day, merchant type, spend amount as signals
- If a field cannot be determined, omit that line entirely
```

---

## Claude Prompt — Voice/Text Mode

```
You are an expense parser for a personal finance app. The user described an expense or income in natural language (possibly transcribed from voice). Extract all available information.

Output EXACTLY in this format (omit lines you cannot determine):
Amount: [amount]
Currency: [3-letter code, default SGD]
Merchant/Payee: [merchant or payee name]
Date: [YYYY-MM-DD, default today: {TODAY}]
Category: [one of: Food, Transport, Housing, Bills, Health, Entertainment, Subscriptions, Education, Pet, Other]
Tags: [3-5 lowercase comma-separated contextual tags]
Description: [1-2 sentence description]
Payment Method: [cash/credit card/debit card/e-wallet]

User input: "{TEXT}"
```

---

## Account Resolution (No UI)

Client always reads `localStorage.getItem('wmm_last_account')` and sends `accountId` in the API body. If the key is absent (new user), client calls `/api/accounts` on mount and picks the first active account. No account picker UI shown anywhere.

---

## Tests to Write (TDD — tests before implementation)

1. `tests/api/receipts.test.ts`
   - 401 when no session
   - 400 when imageBase64 missing
   - 400 when mediaType is not an image
   - 503 when ANTHROPIC_API_KEY not set
   - Creates draft transaction on success (mock Claude fetch)
   - Returns parsed fields from Claude response
   - Creates new tags from Claude output
   - Matches existing category by name
   - Leaves category_id null when no match

2. `tests/api/receipts-voice.test.ts`
   - 401 when no session
   - 400 when text missing
   - 503 when no API key
   - Creates draft on success (mock Claude fetch)

3. Tests for GET `/api/transactions` draft filtering:
   - Does not return draft transactions by default
   - Returns only drafts when `?status=draft`

---

## Mobile-First Layout Notes

- Drop zone: full-width on mobile, border-dashed, large center icon, min-height 120px touch target
- Voice mic button: 48×48px minimum, prominent placement beside drop zone
- Per-file status rows: stacked vertically, no horizontal scroll
- Drafts card: full-width expand, edit fields use single-column grid on mobile
- Action buttons at bottom of edit form, full-width on mobile
- No horizontal overflow anywhere

---

## Event Bus

Simple `window.dispatchEvent(new CustomEvent('drafts-updated'))` and `window.addEventListener('drafts-updated', handler)` for cross-component communication. No prop drilling needed.

---

## Security

- All endpoints: `verifySession()` first
- Image size capped at 5 MB (base64 decoded)
- Media type validated (must start with `image/`)
- No raw file system writes (base64 sent directly to Anthropic)
- API key stays server-side only
