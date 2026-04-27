// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import {
  initTestDb, clearTestDb, resetTestDb,
  seedPortfolioSnapshotV2, seedPortfolioHolding,
} from '../helpers'
import { db } from '@/lib/db'

beforeAll(() => initTestDb())
afterAll(() => clearTestDb())
beforeEach(() => {
  resetTestDb()
  vi.resetModules()
  vi.restoreAllMocks()
  process.env.ANTHROPIC_API_KEY = 'test-api-key'
})

vi.mock('@/lib/session', () => ({
  verifySession: vi.fn().mockResolvedValue({ userId: 'u1' }),
}))

// ─────────────────────────────────────────────────────────────────────────────
// BUG-067: Portfolio P&L tab renders -100% rows + duplicate ticker rows
//
// Three observed symptoms with one root-cause class (OCR ingest path):
//   (a) Same ticker appears twice in P&L list (NFLX, BUD).
//   (b) A duplicate row for an open position renders -100% because OCR
//       defaulted a missing value to 0 and pnl_pct guard didn't require value>0.
//   (c) PnlTab filters by `pnl_pct !== undefined` — so the two fixes together
//       remove both the duplicate and the bogus -100% row from the tab.
// ─────────────────────────────────────────────────────────────────────────────

describe('BUG-067 · GET /api/portfolio/snapshots — pnl_pct guard', () => {
  it('returns null pnl_pct when value=0 (closed position should not render -100%)', async () => {
    seedPortfolioSnapshotV2('s1', { total_value: 1000 })
    // Closed position: value=0, pnl=-23.83 (full loss).
    // Old guard `value - pnl > 0` evaluates to `-(-23.83) > 0` → true → -100% rendered.
    // New guard requires `value > 0` → null pnl_pct → row skipped by PnlTab.
    seedPortfolioHolding('s1', { ticker: 'BUD', value: 0, pnl: -23.83, value_usd: 0 })

    const { GET } = await import('@/app/api/portfolio/snapshots/route')
    const snap = await (await GET()).json()

    const bud = snap.holdings.find((h: { ticker: string }) => h.ticker === 'BUD')
    expect(bud).toBeDefined()
    // mapHolding does `pnl_pct ?? undefined` and Response.json strips undefined
    // keys, so a value=0 row arrives at the client with pnl_pct absent.
    // PnlTab filters by `h.pnl_pct !== undefined` → row is dropped (good).
    expect(bud.pnl_pct).toBeUndefined()
  })

  it('still computes pnl_pct correctly for open positions (regression guard for the new condition)', async () => {
    seedPortfolioSnapshotV2('s1', { total_value: 1000 })
    seedPortfolioHolding('s1', { ticker: 'MU', value: 1100, pnl: 100, value_usd: 1100 })
    seedPortfolioHolding('s1', { ticker: 'NEE', value: 732.67, pnl: -23.83, value_usd: 732.67 })

    const { GET } = await import('@/app/api/portfolio/snapshots/route')
    const snap = await (await GET()).json()

    const mu = snap.holdings.find((h: { ticker: string }) => h.ticker === 'MU')
    expect(mu.pnl_pct).toBeCloseTo(10, 1) // 100 / 1000 * 100

    const nee = snap.holdings.find((h: { ticker: string }) => h.ticker === 'NEE')
    expect(nee.pnl_pct).toBeCloseTo(-3.15, 1) // -23.83 / 756.5 * 100
  })

  it('returns null pnl_pct when cost basis would be zero (value === pnl, infinite-gain edge)', async () => {
    seedPortfolioSnapshotV2('s1', { total_value: 100 })
    seedPortfolioHolding('s1', { ticker: 'X', value: 100, pnl: 100, value_usd: 100 }) // costBasis=0

    const { GET } = await import('@/app/api/portfolio/snapshots/route')
    const snap = await (await GET()).json()

    const x = snap.holdings.find((h: { ticker: string }) => h.ticker === 'X')
    expect(x.pnl_pct).toBeUndefined()
  })
})

describe('BUG-067 · GET /api/portfolio/snapshots — dedup duplicate ticker rows', () => {
  it('returns ONE row when the same ticker has two identical rows (NFLX duplicate)', async () => {
    seedPortfolioSnapshotV2('s1', { total_value: 5000 })
    seedPortfolioHolding('s1', {
      id: 'h1', ticker: 'NFLX', name: 'Netflix',
      value: 661.16, pnl: -21.41, value_usd: 661.16,
    })
    seedPortfolioHolding('s1', {
      id: 'h2', ticker: 'NFLX', name: 'Netflix',
      value: 661.16, pnl: -21.41, value_usd: 661.16,
    })

    const { GET } = await import('@/app/api/portfolio/snapshots/route')
    const snap = await (await GET()).json()

    const nflxRows = snap.holdings.filter((h: { ticker: string }) => h.ticker === 'NFLX')
    expect(nflxRows).toHaveLength(1)
    expect(nflxRows[0].pnl).toBeCloseTo(-21.41)
  })

  it('keeps the row with value > 0 when a 0-value duplicate also exists (BUD case)', async () => {
    seedPortfolioSnapshotV2('s1', { total_value: 5000 })
    // The "real" open position
    seedPortfolioHolding('s1', {
      id: 'h-open', ticker: 'BUD', name: 'Anheuser-Busch',
      value: 732.67, pnl: -23.83, value_usd: 732.67,
    })
    // The bogus closed/zero-value row from a misclassified OCR result
    seedPortfolioHolding('s1', {
      id: 'h-zero', ticker: 'BUD', name: 'Anheuser-Busch',
      value: 0, pnl: -23.83, value_usd: 0,
    })

    const { GET } = await import('@/app/api/portfolio/snapshots/route')
    const snap = await (await GET()).json()

    const budRows = snap.holdings.filter((h: { ticker: string }) => h.ticker === 'BUD')
    expect(budRows).toHaveLength(1)
    expect(budRows[0].market_value).toBeCloseTo(732.67) // the open-position row
    expect(budRows[0].pnl_pct).toBeCloseTo(-3.15, 1)    // not -100%
  })

  it('does not collapse different tickers (sanity check for dedup key)', async () => {
    seedPortfolioSnapshotV2('s1', { total_value: 3000 })
    seedPortfolioHolding('s1', { ticker: 'MU', value: 1000, pnl: 100, value_usd: 1000 })
    seedPortfolioHolding('s1', { ticker: 'NEE', value: 1000, pnl: 100, value_usd: 1000 })
    seedPortfolioHolding('s1', { ticker: 'AAPL', value: 1000, pnl: 100, value_usd: 1000 })

    const { GET } = await import('@/app/api/portfolio/snapshots/route')
    const snap = await (await GET()).json()

    expect(snap.holdings).toHaveLength(3)
  })

  it('falls back to name when ticker is null (some Syfe ETFs have no ticker)', async () => {
    seedPortfolioSnapshotV2('s1', { total_value: 2000 })
    seedPortfolioHolding('s1', {
      id: 'h1', ticker: null as unknown as string, name: 'Some Untickered Fund',
      value: 500, pnl: 10, value_usd: 500,
    })
    seedPortfolioHolding('s1', {
      id: 'h2', ticker: null as unknown as string, name: 'Some Untickered Fund',
      value: 500, pnl: 10, value_usd: 500,
    })

    const { GET } = await import('@/app/api/portfolio/snapshots/route')
    const snap = await (await GET()).json()

    const matches = snap.holdings.filter((h: { name: string }) => h.name === 'Some Untickered Fund')
    expect(matches).toHaveLength(1)
  })
})

describe('BUG-067 · POST /api/portfolio/scan — OCR ingest does not write duplicate or zero-value holdings', () => {
  function makeFormRequest(): NextRequest {
    const formData = new FormData()
    formData.append('images', new File([Buffer.from('img1')], 'a.jpg', { type: 'image/jpeg' }))
    formData.append('images', new File([Buffer.from('img2')], 'b.jpg', { type: 'image/jpeg' }))
    return new NextRequest('http://localhost/api/portfolio/scan', { method: 'POST', body: formData })
  }

  it('dedups holdings by ticker when same ticker is OCRd from multiple images', async () => {
    // Image 1: NFLX as a regular holding
    // Image 2: NFLX again (e.g. a holdings page that overlapped, or a stock detail misparsed as holdings)
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ content: [{ text: JSON.stringify([
          { type: 'holdings', data: { holdings: [
            { ticker: 'NFLX', name: 'Netflix', geo: 'US', currency: 'USD', value: 661.16, pnl: -21.41, qty: 1 },
          ] } },
        ]) }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ content: [{ text: JSON.stringify([
          { type: 'holdings', data: { holdings: [
            { ticker: 'NFLX', name: 'Netflix', geo: 'US', currency: 'USD', value: 661.16, pnl: -21.41, qty: 1 },
          ] } },
        ]) }] }),
      })
    )

    const { POST } = await import('@/app/api/portfolio/scan/route')
    const res = await POST(makeFormRequest())
    expect(res.status).toBe(200)
    const { snapshot_id } = await res.json()

    const rows = (await db.execute({
      sql: 'SELECT * FROM portfolio_holdings WHERE snapshot_id = ? AND ticker = ?',
      args: [snapshot_id, 'NFLX'],
    })).rows
    expect(rows).toHaveLength(1)
  })

  it('skips OCR holdings with missing/zero value (the source of -100% rows)', async () => {
    // Image 1: BUD with normal value
    // Image 2: BUD with no value column (gets coerced to 0 by numOrNull(h.value) ?? 0)
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ content: [{ text: JSON.stringify([
          { type: 'holdings', data: { holdings: [
            { ticker: 'BUD', name: 'AB-InBev', geo: 'US', currency: 'USD', value: 732.67, pnl: -23.83, qty: 12 },
          ] } },
        ]) }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ content: [{ text: JSON.stringify([
          { type: 'holdings', data: { holdings: [
            { ticker: 'BUD', name: 'AB-InBev', geo: 'US', currency: 'USD', pnl: -23.83 }, // no value!
          ] } },
        ]) }] }),
      })
    )

    const { POST } = await import('@/app/api/portfolio/scan/route')
    const res = await POST(makeFormRequest())
    expect(res.status).toBe(200)
    const { snapshot_id } = await res.json()

    const rows = (await db.execute({
      sql: 'SELECT * FROM portfolio_holdings WHERE snapshot_id = ? AND ticker = ?',
      args: [snapshot_id, 'BUD'],
    })).rows
    // Either dedup keeps the value>0 row, OR the zero-value row is filtered out.
    // Either way: exactly one row, and it has value > 0.
    expect(rows).toHaveLength(1)
    expect(rows[0].value).toBeGreaterThan(0)
  })
})
