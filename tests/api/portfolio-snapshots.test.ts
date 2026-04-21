// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import {
  initTestDb, clearTestDb, resetTestDb, req,
  seedPortfolioSnapshotV2, seedPortfolioHolding, seedPortfolioOrder,
  seedPortfolioRealised, seedPortfolioGrowth, seedPortfolioMilestone,
} from '../helpers'

beforeAll(() => initTestDb())
afterAll(() => clearTestDb())
beforeEach(() => resetTestDb())

describe('GET /api/portfolio/snapshots', () => {
  it('returns null when no v2 snapshots exist', async () => {
    const { GET } = await import('@/app/api/portfolio/snapshots/route')
    const res = await GET()
    expect(await res.json()).toBeNull()
  })

  it('returns latest snapshot metadata', async () => {
    seedPortfolioSnapshotV2('s1', {
      total_value: 12165.28,
      snap_label: 'Snap 27',
      snap_time: '05:34 SGT Tue 21 Apr 2026',
      unrealised_pnl: 593.25,
      realised_pnl: 430.88,
      cash: 87.45,
    })
    const { GET } = await import('@/app/api/portfolio/snapshots/route')
    const snap = await (await GET()).json()
    expect(snap.id).toBe('s1')
    expect(snap.snap_label).toBe('Snap 27')
    expect(snap.snap_time).toBe('05:34 SGT Tue 21 Apr 2026')
    expect(snap.total_value).toBeCloseTo(12165.28)
    expect(snap.unrealised_pnl).toBeCloseTo(593.25)
    expect(snap.realised_pnl).toBeCloseTo(430.88)
    expect(snap.cash).toBeCloseTo(87.45)
  })

  it('returns holdings from portfolio_holdings table with mapped field names', async () => {
    seedPortfolioSnapshotV2('s1', { total_value: 2000 })
    seedPortfolioHolding('s1', {
      ticker: 'MU', name: 'Micron Technology',
      value: 1600, pnl: 556, qty: 5, price: 320,
      geo: 'US', sector: 'Technology', currency: 'USD',
      sell_limit: null, buy_limit: null, target: 500, value_usd: 1600,
    })
    seedPortfolioHolding('s1', {
      ticker: 'ABBV', name: 'AbbVie Inc', value: 400, value_usd: 400,
      geo: 'US', sector: 'Healthcare', currency: 'USD',
    })
    const { GET } = await import('@/app/api/portfolio/snapshots/route')
    const snap = await (await GET()).json()
    expect(snap.holdings).toHaveLength(2)
    const mu = snap.holdings.find((h: { ticker: string }) => h.ticker === 'MU')
    expect(mu.ticker).toBe('MU')
    expect(mu.market_value).toBeCloseTo(1600)  // mapped from value
    expect(mu.units).toBe(5)                   // mapped from qty
    expect(mu.current_price).toBeCloseTo(320)  // mapped from price
    expect(mu.pnl).toBeCloseTo(556)
    expect(mu.target).toBe(500)
    expect(mu.allocation_pct).toBeCloseTo(80)  // 1600/2000*100
  })

  it('computes pnl_pct for holdings', async () => {
    seedPortfolioSnapshotV2('s1')
    seedPortfolioHolding('s1', { ticker: 'MU', value: 1100, pnl: 100 }) // cost = 1000
    const { GET } = await import('@/app/api/portfolio/snapshots/route')
    const snap = await (await GET()).json()
    expect(snap.holdings[0].pnl_pct).toBeCloseTo(10) // 100/1000 * 100
  })

  it('returns orders from portfolio_orders table', async () => {
    seedPortfolioSnapshotV2('s1')
    seedPortfolioOrder('ord-1', {
      snapshot_id: 's1',
      ticker: 'NVDA', type: 'SELL LIMIT', price: 220, qty: 2,
      currency: 'USD', geo: 'US', placed: '03:02 SGT', current_price: 202,
      note: '8.9% away', new_flag: 1,
    })
    const { GET } = await import('@/app/api/portfolio/snapshots/route')
    const snap = await (await GET()).json()
    expect(snap.orders).toHaveLength(1)
    const o = snap.orders[0]
    expect(o.ticker).toBe('NVDA')
    expect(o.type).toBe('SELL LIMIT')
    expect(o.price).toBeCloseTo(220)
    expect(o.new_flag).toBe(1)
  })

  it('returns realised trades from portfolio_realised table', async () => {
    seedPortfolioSnapshotV2('s1')
    seedPortfolioRealised('r1', 'QQQ', 20.50, 's1')
    seedPortfolioRealised('r2', 'AAPL', -11.03, 's1')
    const { GET } = await import('@/app/api/portfolio/snapshots/route')
    const snap = await (await GET()).json()
    expect(snap.realised).toHaveLength(2)
    const qqq = snap.realised.find((r: { key: string }) => r.key === 'QQQ')
    expect(qqq.value).toBeCloseTo(20.50)
  })

  it('returns growth scores from portfolio_growth table', async () => {
    seedPortfolioSnapshotV2('s1')
    seedPortfolioGrowth('K', 4, 'Knowledge', 'Developing', ['Item 1', 'Item 2'], 'Study more', 's1')
    const { GET } = await import('@/app/api/portfolio/snapshots/route')
    const snap = await (await GET()).json()
    expect(snap.growth).toHaveLength(1)
    const k = snap.growth[0]
    expect(k.dimension).toBe('K')
    expect(k.score).toBe(4)
    expect(k.level).toBe('Developing')
    expect(JSON.parse(k.items_json)).toEqual(['Item 1', 'Item 2'])
    expect(k.next_text).toBe('Study more')
  })

  it('returns milestones from portfolio_milestones table ordered by sort_order', async () => {
    seedPortfolioSnapshotV2('s1')
    seedPortfolioMilestone('m2', '02 Apr', ['S', 'E'], 'QQQ take-profit +$20.50', 1, 's1')
    seedPortfolioMilestone('m1', '27 Mar', ['E'], 'First position - MU entry', 0, 's1')
    const { GET } = await import('@/app/api/portfolio/snapshots/route')
    const snap = await (await GET()).json()
    expect(snap.milestones).toHaveLength(2)
    expect(snap.milestones[0].date).toBe('27 Mar')  // sort_order 0 first
    expect(snap.milestones[1].date).toBe('02 Apr')
  })

  it('returns latest snapshot when multiple exist', async () => {
    const old = new Date(Date.now() - 86400000).toISOString()
    seedPortfolioSnapshotV2('s-old', { snap_label: 'Old Snap', snapshot_date: old })
    seedPortfolioSnapshotV2('s-new', { snap_label: 'New Snap' })
    const { GET } = await import('@/app/api/portfolio/snapshots/route')
    const snap = await (await GET()).json()
    expect(snap.snap_label).toBe('New Snap')
  })
})

describe('POST /api/portfolio/snapshots', () => {
  it('rejects missing total_value', async () => {
    const { POST } = await import('@/app/api/portfolio/snapshots/route')
    const res = await POST(req('/api/portfolio/snapshots', 'POST', {}))
    expect(res.status).toBe(400)
  })

  it('creates a snapshot with holdings and returns the full snapshot', async () => {
    const { POST, GET } = await import('@/app/api/portfolio/snapshots/route')
    const body = {
      snap_label: 'Snap 28',
      snap_time: '10:00 SGT',
      total_value: 15000,
      unrealised_pnl: 700,
      realised_pnl: 500,
      cash: 100,
      holdings: [
        {
          ticker: 'MU', name: 'Micron Technology',
          geo: 'US', sector: 'Technology', currency: 'USD',
          price: 320, change_1d: -1.5, value: 1600, pnl: 556,
          qty: 5, value_usd: 1600, avg_cost: 214.88,
          target: 500, sell_limit: null, buy_limit: null,
          is_new: false, approx: false, note: 'Test',
        },
      ],
      orders: [],
      realised: [],
      growth: [],
      milestones: [],
    }
    const res = await POST(req('/api/portfolio/snapshots', 'POST', body))
    expect(res.status).toBe(201)
    const created = await res.json()
    expect(created.snap_label).toBe('Snap 28')
    expect(created.holdings_count).toBe(1)

    // Verify it can be retrieved via GET
    const snap = await (await GET()).json()
    expect(snap.snap_label).toBe('Snap 28')
    expect(snap.holdings).toHaveLength(1)
    expect(snap.holdings[0].ticker).toBe('MU')
  })

  it('creates orders when provided', async () => {
    const { POST, GET } = await import('@/app/api/portfolio/snapshots/route')
    const body = {
      snap_label: 'Test',
      total_value: 1000,
      holdings: [],
      orders: [
        { ticker: 'NFLX', geo: 'US', type: 'BUY LIMIT', price: 94.65, qty: 2, currency: 'USD', placed: '03:22 SGT', current_price: 94.83, note: '', new_flag: 1 },
      ],
      realised: [],
      growth: [],
      milestones: [],
    }
    await POST(req('/api/portfolio/snapshots', 'POST', body))
    const snap = await (await GET()).json()
    expect(snap.orders).toHaveLength(1)
    expect(snap.orders[0].ticker).toBe('NFLX')
  })
})
