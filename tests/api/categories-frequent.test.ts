// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { initTestDb, clearTestDb, resetTestDb, req, seedAccount, seedCategory, seedTransaction } from '../helpers'

beforeAll(() => initTestDb())
afterAll(() => clearTestDb())
beforeEach(() => resetTestDb())

describe('GET /api/categories/frequent', () => {
  it('returns top categories by transaction count in last 30 days', async () => {
    seedAccount('acc1', 'DBS', 'bank')
    seedCategory('cat-food', 'Food', 'expense')
    seedCategory('cat-transport', 'Transport', 'expense')
    seedCategory('cat-living', 'Living', 'expense')

    const recentDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
    // Food × 3, Transport × 2, Living × 1
    seedTransaction('t1', 'acc1', { categoryId: 'cat-food', datetime: recentDate })
    seedTransaction('t2', 'acc1', { categoryId: 'cat-food', datetime: recentDate })
    seedTransaction('t3', 'acc1', { categoryId: 'cat-food', datetime: recentDate })
    seedTransaction('t4', 'acc1', { categoryId: 'cat-transport', datetime: recentDate })
    seedTransaction('t5', 'acc1', { categoryId: 'cat-transport', datetime: recentDate })
    seedTransaction('t6', 'acc1', { categoryId: 'cat-living', datetime: recentDate })

    const { GET } = await import('@/app/api/categories/frequent/route')
    const res = await GET(req('/api/categories/frequent?type=expense&days=30&limit=5'))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data[0].id).toBe('cat-food')
    expect(data[1].id).toBe('cat-transport')
    expect(data[2].id).toBe('cat-living')
  })

  it('excludes categories with transactions older than the days window', async () => {
    seedAccount('acc1', 'DBS', 'bank')
    seedCategory('cat-food', 'Food', 'expense')
    seedCategory('cat-old', 'OldCat', 'expense')

    const recentDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
    const oldDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()
    seedTransaction('t1', 'acc1', { categoryId: 'cat-food', datetime: recentDate })
    seedTransaction('t2', 'acc1', { categoryId: 'cat-old', datetime: oldDate })

    const { GET } = await import('@/app/api/categories/frequent/route')
    const res = await GET(req('/api/categories/frequent?type=expense&days=30&limit=5'))
    const data = await res.json()
    expect(data).toHaveLength(1)
    expect(data[0].id).toBe('cat-food')
  })

  it('filters by type', async () => {
    seedAccount('acc1', 'DBS', 'bank')
    seedCategory('cat-food', 'Food', 'expense')
    seedCategory('cat-salary', 'Salary', 'income')

    const recentDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
    seedTransaction('t1', 'acc1', { categoryId: 'cat-food', type: 'expense', datetime: recentDate })
    seedTransaction('t2', 'acc1', { categoryId: 'cat-salary', type: 'income', datetime: recentDate })

    const { GET } = await import('@/app/api/categories/frequent/route')
    const res = await GET(req('/api/categories/frequent?type=income&days=30&limit=5'))
    const data = await res.json()
    expect(data).toHaveLength(1)
    expect(data[0].id).toBe('cat-salary')
  })

  it('respects the limit parameter', async () => {
    seedAccount('acc1', 'DBS', 'bank')
    const recentDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
    for (let i = 1; i <= 7; i++) {
      seedCategory(`cat-${i}`, `Cat${i}`, 'expense')
      seedTransaction(`t${i}`, 'acc1', { categoryId: `cat-${i}`, datetime: recentDate })
    }

    const { GET } = await import('@/app/api/categories/frequent/route')
    const res = await GET(req('/api/categories/frequent?type=expense&days=30&limit=3'))
    const data = await res.json()
    expect(data).toHaveLength(3)
  })

  it('returns empty array when no matching transactions', async () => {
    const { GET } = await import('@/app/api/categories/frequent/route')
    const res = await GET(req('/api/categories/frequent?type=expense&days=30&limit=5'))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toEqual([])
  })
})
