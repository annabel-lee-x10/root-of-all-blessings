// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { initTestDb, clearTestDb, resetTestDb, req, seedPortfolioRealised } from '../helpers'

beforeAll(() => initTestDb())
afterAll(() => clearTestDb())
beforeEach(() => resetTestDb())

describe('GET /api/portfolio/realised', () => {
  it('returns empty array when no trades', async () => {
    const { GET } = await import('@/app/api/portfolio/realised/route')
    const res = await GET()
    const data = await res.json()
    expect(Array.isArray(data)).toBe(true)
    expect(data).toHaveLength(0)
  })

  it('returns all realised trades with correct fields', async () => {
    seedPortfolioRealised('r1', 'QQQ', 20.50)
    seedPortfolioRealised('r2', 'AAPL', -11.03)
    const { GET } = await import('@/app/api/portfolio/realised/route')
    const res = await GET()
    const data = await res.json()
    expect(data).toHaveLength(2)
    const qqq = data.find((r: { ticker: string }) => r.ticker === 'QQQ')
    expect(qqq.pnl).toBeCloseTo(20.50, 2)
  })
})

describe('POST /api/portfolio/realised', () => {
  it('creates a realised trade and returns 201', async () => {
    const { POST } = await import('@/app/api/portfolio/realised/route')
    const res = await POST(req('/api/portfolio/realised', 'POST', { ticker: 'GOOG', pnl: 54.50 }))
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.ticker).toBe('GOOG')
    expect(data.pnl).toBeCloseTo(54.50, 2)
    expect(data.id).toBeTruthy()
  })

  it('rejects missing ticker with 400', async () => {
    const { POST } = await import('@/app/api/portfolio/realised/route')
    const res = await POST(req('/api/portfolio/realised', 'POST', { pnl: 10 }))
    expect(res.status).toBe(400)
  })

  it('rejects missing pnl with 400', async () => {
    const { POST } = await import('@/app/api/portfolio/realised/route')
    const res = await POST(req('/api/portfolio/realised', 'POST', { ticker: 'MU' }))
    expect(res.status).toBe(400)
  })
})

describe('DELETE /api/portfolio/realised/[id]', () => {
  it('deletes a realised trade and returns 204', async () => {
    seedPortfolioRealised('r1', 'QQQ', 20.50)
    const { DELETE } = await import('@/app/api/portfolio/realised/[id]/route')
    const res = await DELETE(
      req('/api/portfolio/realised/r1', 'DELETE'),
      { params: Promise.resolve({ id: 'r1' }) }
    )
    expect(res.status).toBe(204)
  })

  it('returns 404 for unknown id', async () => {
    const { DELETE } = await import('@/app/api/portfolio/realised/[id]/route')
    const res = await DELETE(
      req('/api/portfolio/realised/none', 'DELETE'),
      { params: Promise.resolve({ id: 'none' }) }
    )
    expect(res.status).toBe(404)
  })
})
