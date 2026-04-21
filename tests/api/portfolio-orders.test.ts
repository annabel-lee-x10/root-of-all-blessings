// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { initTestDb, clearTestDb, resetTestDb, req, seedPortfolioOrder } from '../helpers'

beforeAll(() => initTestDb())
afterAll(() => clearTestDb())
beforeEach(() => resetTestDb())

describe('GET /api/portfolio/orders', () => {
  it('returns empty array when no orders', async () => {
    const { GET } = await import('@/app/api/portfolio/orders/route')
    const res = await GET()
    const data = await res.json()
    expect(Array.isArray(data)).toBe(true)
    expect(data).toHaveLength(0)
  })

  it('returns only open orders by default', async () => {
    seedPortfolioOrder('o1', { ticker: 'MU', status: 'open' })
    seedPortfolioOrder('o2', { ticker: 'ABBV', status: 'filled' })
    const { GET } = await import('@/app/api/portfolio/orders/route')
    const res = await GET()
    const data = await res.json()
    expect(data).toHaveLength(1)
    expect(data[0].ticker).toBe('MU')
  })

  it('returns all order fields', async () => {
    seedPortfolioOrder('o1', {
      ticker: 'MU', geo: 'US', type: 'SELL LIMIT', price: 500, qty: 5,
      currency: 'USD', placed: '21 Apr 2026', current_price: 448, note: 'Test note', new_flag: true,
    })
    const { GET } = await import('@/app/api/portfolio/orders/route')
    const res = await GET()
    const [o] = await res.json()
    expect(o.ticker).toBe('MU')
    expect(o.geo).toBe('US')
    expect(o.type).toBe('SELL LIMIT')
    expect(o.price).toBe(500)
    expect(o.qty).toBe(5)
    expect(o.currency).toBe('USD')
    expect(o.placed).toBe('21 Apr 2026')
    expect(o.current_price).toBe(448)
    expect(o.note).toBe('Test note')
    expect(o.new_flag).toBe(1)
  })
})

describe('POST /api/portfolio/orders', () => {
  it('creates an order and returns 201', async () => {
    const { POST } = await import('@/app/api/portfolio/orders/route')
    const res = await POST(req('/api/portfolio/orders', 'POST', {
      ticker: 'NVDA', geo: 'US', type: 'SELL LIMIT',
      price: 220, qty: 2, currency: 'USD', placed: '21 Apr 2026',
    }))
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.ticker).toBe('NVDA')
    expect(data.id).toBeTruthy()
  })

  it('rejects missing ticker with 400', async () => {
    const { POST } = await import('@/app/api/portfolio/orders/route')
    const res = await POST(req('/api/portfolio/orders', 'POST', { price: 100 }))
    expect(res.status).toBe(400)
  })

  it('rejects missing price with 400', async () => {
    const { POST } = await import('@/app/api/portfolio/orders/route')
    const res = await POST(req('/api/portfolio/orders', 'POST', { ticker: 'MU', qty: 1 }))
    expect(res.status).toBe(400)
  })
})

describe('PATCH /api/portfolio/orders/[id]', () => {
  it('updates current_price and returns 200', async () => {
    seedPortfolioOrder('o1', { ticker: 'MU', price: 500, current_price: 440 })
    const { PATCH } = await import('@/app/api/portfolio/orders/[id]/route')
    const res = await PATCH(
      req('/api/portfolio/orders/o1', 'PATCH', { current_price: 455 }),
      { params: Promise.resolve({ id: 'o1' }) }
    )
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.current_price).toBe(455)
  })

  it('updates status to filled', async () => {
    seedPortfolioOrder('o1', { ticker: 'MU', status: 'open' })
    const { PATCH } = await import('@/app/api/portfolio/orders/[id]/route')
    const res = await PATCH(
      req('/api/portfolio/orders/o1', 'PATCH', { status: 'filled' }),
      { params: Promise.resolve({ id: 'o1' }) }
    )
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.status).toBe('filled')
  })

  it('returns 404 for unknown id', async () => {
    const { PATCH } = await import('@/app/api/portfolio/orders/[id]/route')
    const res = await PATCH(
      req('/api/portfolio/orders/none', 'PATCH', { current_price: 100 }),
      { params: Promise.resolve({ id: 'none' }) }
    )
    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/portfolio/orders/[id]', () => {
  it('deletes an order and returns 204', async () => {
    seedPortfolioOrder('o1', { ticker: 'MU' })
    const { DELETE } = await import('@/app/api/portfolio/orders/[id]/route')
    const res = await DELETE(
      req('/api/portfolio/orders/o1', 'DELETE'),
      { params: Promise.resolve({ id: 'o1' }) }
    )
    expect(res.status).toBe(204)
  })

  it('returns 404 for unknown id', async () => {
    const { DELETE } = await import('@/app/api/portfolio/orders/[id]/route')
    const res = await DELETE(
      req('/api/portfolio/orders/none', 'DELETE'),
      { params: Promise.resolve({ id: 'none' }) }
    )
    expect(res.status).toBe(404)
  })
})
