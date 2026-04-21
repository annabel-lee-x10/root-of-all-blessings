// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import {
  initTestDb, clearTestDb, resetTestDb, req,
  seedPortfolioSnapshot, seedPortfolioOrder, seedPortfolioRealisedTrade,
  seedPortfolioGrowth, seedPortfolioMilestone,
} from '../helpers'

beforeAll(initTestDb)
afterAll(clearTestDb)
beforeEach(resetTestDb)

describe('GET /api/portfolio — snap27 aggregation', () => {
  it('returns null when no snapshot exists', async () => {
    const { GET } = await import('@/app/api/portfolio/route')
    const res = await GET()
    const body = await res.json()
    expect(body).toBeNull()
  })

  it('returns snapshot with empty arrays when no related data', async () => {
    seedPortfolioSnapshot('snap-1', [{ name: 'MU', market_value: 100 }])
    const { GET } = await import('@/app/api/portfolio/route')
    const res = await GET()
    const body = await res.json()
    expect(body.id).toBe('snap-1')
    expect(body.orders).toEqual([])
    expect(body.realised_trades).toEqual([])
    expect(body.growth).toEqual([])
    expect(body.milestones).toEqual([])
  })

  it('returns snap_label, snap_time, cash and prior fields when present', async () => {
    seedPortfolioSnapshot('snap-1', [], {
      total_value: 12165.28, total_pnl: 593.25,
      cash: 87.45, pending: 508.07, realised_pnl: 430.88,
      snap_label: 'Snap 27', snap_time: '05:34 SGT Tue 21 Apr 2026',
      prior_value: 12013.65, prior_unrealised: 521.11, prior_realised: 357.36,
      prior_cash: 889.14, prior_holdings: 20,
    })
    const { GET } = await import('@/app/api/portfolio/route')
    const res = await GET()
    const body = await res.json()
    expect(body.snap_label).toBe('Snap 27')
    expect(body.cash).toBe(87.45)
    expect(body.prior_value).toBe(12013.65)
    expect(body.prior_holdings).toBe(20)
  })

  it('returns orders for the latest snapshot', async () => {
    seedPortfolioSnapshot('snap-1', [])
    seedPortfolioOrder('ord-1', 'snap-1', {
      ticker: 'NFLX', geo: 'US', type: 'BUY LIMIT', price: 94.65, qty: 2,
      currency: 'USD', placed: '03:22 SGT 21 Apr', current_price: 94.83,
      note: 'conviction add', new_flag: 1,
    })
    const { GET } = await import('@/app/api/portfolio/route')
    const res = await GET()
    const body = await res.json()
    expect(body.orders).toHaveLength(1)
    expect(body.orders[0].ticker).toBe('NFLX')
    expect(body.orders[0].type).toBe('BUY LIMIT')
    expect(body.orders[0].new_flag).toBe(1)
  })

  it('returns realised_trades for the latest snapshot', async () => {
    seedPortfolioSnapshot('snap-1', [])
    seedPortfolioRealisedTrade('rt-1', 'snap-1', 'QQQ', 20.50)
    seedPortfolioRealisedTrade('rt-2', 'snap-1', 'AAPL', -11.03)
    const { GET } = await import('@/app/api/portfolio/route')
    const res = await GET()
    const body = await res.json()
    expect(body.realised_trades).toHaveLength(2)
    expect(body.realised_trades.find((r: { ticker: string }) => r.ticker === 'QQQ').amount).toBe(20.50)
  })

  it('returns growth scores with parsed items for the latest snapshot', async () => {
    seedPortfolioSnapshot('snap-1', [])
    seedPortfolioGrowth('g-1', 'snap-1', 'K', 4, 'Developing', ['item1', 'item2'], 'next step')
    const { GET } = await import('@/app/api/portfolio/route')
    const res = await GET()
    const body = await res.json()
    expect(body.growth).toHaveLength(1)
    expect(body.growth[0].dimension).toBe('K')
    expect(body.growth[0].score).toBe(4)
    expect(body.growth[0].items).toEqual(['item1', 'item2'])
  })

  it('returns milestones in sort_order for the latest snapshot', async () => {
    seedPortfolioSnapshot('snap-1', [])
    seedPortfolioMilestone('m-2', 'snap-1', '21 Apr', ['S'], 'Second milestone', 1)
    seedPortfolioMilestone('m-1', 'snap-1', '27 Mar', ['E'], 'First milestone', 0)
    const { GET } = await import('@/app/api/portfolio/route')
    const res = await GET()
    const body = await res.json()
    expect(body.milestones).toHaveLength(2)
    expect(body.milestones[0].text).toBe('First milestone')
    expect(body.milestones[0].tags).toEqual(['E'])
    expect(body.milestones[1].text).toBe('Second milestone')
  })

  it('only returns data from the latest snapshot (not older ones)', async () => {
    seedPortfolioSnapshot('snap-old', [], { snapshot_date: '2026-04-20T00:00:00Z' })
    seedPortfolioOrder('ord-old', 'snap-old', { ticker: 'OLD', price: 1, qty: 1, type: 'SELL LIMIT' })
    seedPortfolioSnapshot('snap-new', [], { snapshot_date: '2026-04-21T00:00:00Z' })
    seedPortfolioOrder('ord-new', 'snap-new', { ticker: 'NEW', price: 2, qty: 1, type: 'BUY LIMIT' })
    const { GET } = await import('@/app/api/portfolio/route')
    const res = await GET()
    const body = await res.json()
    expect(body.id).toBe('snap-new')
    expect(body.orders).toHaveLength(1)
    expect(body.orders[0].ticker).toBe('NEW')
  })
})

describe('POST /api/portfolio — JSON import', () => {
  it('returns 400 when neither html nor format:json provided', async () => {
    const { POST } = await import('@/app/api/portfolio/route')
    const res = await POST(req('/api/portfolio', 'POST', { snapshot_date: '2026-04-21' }))
    expect(res.status).toBe(400)
  })

  it('creates snapshot with all related data from JSON import', async () => {
    const { POST, GET } = await import('@/app/api/portfolio/route')
    const payload = {
      format: 'json',
      snapshot_date: '2026-04-21T05:34:00Z',
      snap_label: 'Snap 27',
      snap_time: '05:34 SGT Tue 21 Apr 2026',
      total_value: 12165.28,
      total_pnl: 593.25,
      cash: 87.45,
      pending: 508.07,
      net_invested: 11569.76,
      realised_pnl: 430.88,
      net_deposited: 11222.32,
      dividends: 4.77,
      prior_value: 12013.65,
      prior_unrealised: 521.11,
      prior_realised: 357.36,
      prior_cash: 889.14,
      prior_holdings: 20,
      holdings: [{ name: 'MU', ticker: 'MU', market_value: 2242.10, geo: 'US', sector: 'Technology', currency: 'USD' }],
      orders: [{ ticker: 'NFLX', geo: 'US', type: 'BUY LIMIT', price: 94.65, qty: 2, currency: 'USD', placed: '03:22 SGT 21 Apr', current_price: 94.83, note: 'add', new_flag: true }],
      realised_trades: [{ ticker: 'QQQ', amount: 20.50 }, { ticker: 'AAPL', amount: -11.03 }],
      growth: {
        K: { score: 4, level: 'Developing', items: ['item1'], next: 'next K' },
        S: { score: 4, level: 'Developing', items: ['item2'], next: 'next S' },
        E: { score: 4, level: 'Developing', items: ['item3'], next: 'next E' },
      },
      milestones: [
        { date: '27 Mar', tags: ['E'], text: 'First position - MU entry' },
        { date: '02 Apr', tags: ['S', 'E'], text: 'QQQ take-profit' },
      ],
    }
    const postRes = await POST(req('/api/portfolio', 'POST', payload))
    expect(postRes.status).toBe(201)
    const postBody = await postRes.json()
    expect(postBody.holdings_count).toBe(1)
    expect(postBody.orders_count).toBe(1)
    expect(postBody.realised_count).toBe(2)
    expect(postBody.growth_count).toBe(3)
    expect(postBody.milestones_count).toBe(2)

    const getRes = await GET()
    const snap = await getRes.json()
    expect(snap.snap_label).toBe('Snap 27')
    expect(snap.cash).toBe(87.45)
    expect(snap.orders).toHaveLength(1)
    expect(snap.orders[0].ticker).toBe('NFLX')
    expect(snap.realised_trades).toHaveLength(2)
    expect(snap.growth).toHaveLength(3)
    expect(snap.milestones).toHaveLength(2)
    expect(snap.milestones[0].tags).toEqual(['E'])
  })

  it('still accepts legacy html format', async () => {
    const { POST } = await import('@/app/api/portfolio/route')
    const html = `<html><body>
      <table>
        <tr><th>Name</th><th>Market Value</th><th>P&amp;L</th></tr>
        <tr><td>MU US</td><td>2242.10</td><td>556.10</td></tr>
      </table>
    </body></html>`
    const res = await POST(req('/api/portfolio', 'POST', { html, snapshot_date: '2026-04-21' }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.holdings_count).toBeGreaterThan(0)
  })
})
