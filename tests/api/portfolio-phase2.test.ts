// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import {
  initTestDb, clearTestDb, resetTestDb,
  seedPortfolioSnapshotV2, seedPortfolioHolding, seedPortfolioOrder,
} from '../helpers'

beforeAll(() => initTestDb())
afterAll(() => clearTestDb())
beforeEach(() => resetTestDb())

describe('Phase 2 · Holdings: day_high, day_low, prev_close', () => {
  it('maps day_high from portfolio_holdings when present', async () => {
    seedPortfolioSnapshotV2('s1')
    seedPortfolioHolding('s1', {
      ticker: 'MU', name: 'Micron', value: 1000,
      day_high: 95.50,
    })
    const { GET } = await import('@/app/api/portfolio/snapshots/route')
    const snap = await (await GET()).json()
    const mu = snap.holdings.find((h: { ticker: string }) => h.ticker === 'MU')
    expect(mu.day_high).toBeCloseTo(95.50)
  })

  it('maps day_low from portfolio_holdings when present', async () => {
    seedPortfolioSnapshotV2('s1')
    seedPortfolioHolding('s1', {
      ticker: 'MU', name: 'Micron', value: 1000,
      day_low: 88.30,
    })
    const { GET } = await import('@/app/api/portfolio/snapshots/route')
    const snap = await (await GET()).json()
    const mu = snap.holdings.find((h: { ticker: string }) => h.ticker === 'MU')
    expect(mu.day_low).toBeCloseTo(88.30)
  })

  it('maps prev_close from portfolio_holdings when present', async () => {
    seedPortfolioSnapshotV2('s1')
    seedPortfolioHolding('s1', {
      ticker: 'MU', name: 'Micron', value: 1000,
      prev_close: 91.20,
    })
    const { GET } = await import('@/app/api/portfolio/snapshots/route')
    const snap = await (await GET()).json()
    const mu = snap.holdings.find((h: { ticker: string }) => h.ticker === 'MU')
    expect(mu.prev_close).toBeCloseTo(91.20)
  })

  it('returns undefined for day_high/low/prev_close when not set', async () => {
    seedPortfolioSnapshotV2('s1')
    seedPortfolioHolding('s1', { ticker: 'MU', name: 'Micron', value: 1000 })
    const { GET } = await import('@/app/api/portfolio/snapshots/route')
    const snap = await (await GET()).json()
    const mu = snap.holdings.find((h: { ticker: string }) => h.ticker === 'MU')
    expect(mu.day_high == null).toBe(true)
    expect(mu.day_low == null).toBe(true)
    expect(mu.prev_close == null).toBe(true)
  })

  it('maps all three fields correctly on the same holding', async () => {
    seedPortfolioSnapshotV2('s1')
    seedPortfolioHolding('s1', {
      ticker: 'NVDA', name: 'NVIDIA', value: 2000,
      day_high: 115.80, day_low: 107.40, prev_close: 112.30,
    })
    const { GET } = await import('@/app/api/portfolio/snapshots/route')
    const snap = await (await GET()).json()
    const nvda = snap.holdings.find((h: { ticker: string }) => h.ticker === 'NVDA')
    expect(nvda.day_high).toBeCloseTo(115.80)
    expect(nvda.day_low).toBeCloseTo(107.40)
    expect(nvda.prev_close).toBeCloseTo(112.30)
  })
})

describe('Phase 2 · Orders: status field + standalone orders merge', () => {
  it('snapshot orders include status field', async () => {
    seedPortfolioSnapshotV2('s1')
    seedPortfolioOrder('o1', {
      snapshot_id: 's1',
      ticker: 'MU', type: 'SELL LIMIT', price: 500, qty: 5, currency: 'USD',
      status: 'open',
    })
    const { GET } = await import('@/app/api/portfolio/snapshots/route')
    const snap = await (await GET()).json()
    expect(snap.orders).toHaveLength(1)
    expect(snap.orders[0].status).toBe('open')
  })

  it('merges standalone open orders (no snapshot_id) into snapshot orders', async () => {
    seedPortfolioSnapshotV2('s1')
    // Snapshot-linked order
    seedPortfolioOrder('o1', {
      snapshot_id: 's1',
      ticker: 'MU', type: 'SELL LIMIT', price: 500, qty: 5, currency: 'USD',
    })
    // Standalone open order (no snapshot_id)
    seedPortfolioOrder('o2', {
      snapshot_id: null,
      ticker: 'NVDA', type: 'BUY LIMIT', price: 94.65, qty: 2, currency: 'USD',
      status: 'open',
    })
    const { GET } = await import('@/app/api/portfolio/snapshots/route')
    const snap = await (await GET()).json()
    expect(snap.orders).toHaveLength(2)
    const tickers = snap.orders.map((o: { ticker: string }) => o.ticker)
    expect(tickers).toContain('MU')
    expect(tickers).toContain('NVDA')
  })

  it('does not include filled standalone orders in snapshot', async () => {
    seedPortfolioSnapshotV2('s1')
    seedPortfolioOrder('o1', {
      snapshot_id: null,
      ticker: 'NFLX', type: 'BUY LIMIT', price: 100, qty: 1, currency: 'USD',
      status: 'filled',
    })
    const { GET } = await import('@/app/api/portfolio/snapshots/route')
    const snap = await (await GET()).json()
    expect(snap.orders).toHaveLength(0)
  })

  it('deduplicates if an order appears as both snapshot-linked and standalone', async () => {
    seedPortfolioSnapshotV2('s1')
    // The same order linked to snapshot — should appear once
    seedPortfolioOrder('o1', {
      snapshot_id: 's1',
      ticker: 'MU', type: 'SELL LIMIT', price: 500, qty: 5, currency: 'USD',
      status: 'open',
    })
    const { GET } = await import('@/app/api/portfolio/snapshots/route')
    const snap = await (await GET()).json()
    expect(snap.orders).toHaveLength(1)
  })
})
