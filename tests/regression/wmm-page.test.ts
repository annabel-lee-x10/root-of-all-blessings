// @vitest-environment node
// Regression: verifies the dashboard API and existing APIs are intact after the layout rework
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { initTestDb, clearTestDb, resetTestDb, req, seedAccount, seedCategory, seedTransaction } from '../helpers'

beforeAll(() => initTestDb())
afterAll(() => clearTestDb())
beforeEach(() => {
  resetTestDb()
  seedAccount('acc1', 'DBS', 'bank')
  seedCategory('cat1', 'Food', 'expense')
})

describe('Dashboard API regression', () => {
  it('dashboard custom range returns correct shape', async () => {
    const { GET } = await import('@/app/api/dashboard/route')
    const res = await GET(req('/api/dashboard?range=custom&start=2026-04-19T00:00:00%2B08:00&end=2026-04-19T23:59:59%2B08:00'))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toHaveProperty('total_spend')
    expect(data).toHaveProperty('total_income')
    expect(data).toHaveProperty('daily_average')
    expect(data).toHaveProperty('category_breakdown')
    expect(data).toHaveProperty('days_in_range')
    expect(data).toHaveProperty('budget_remaining')
  })

  it('transactions API still returns paginated results (regression)', async () => {
    seedTransaction('tx1', 'acc1', { datetime: '2026-04-19T10:00:00+08:00' })
    const { GET } = await import('@/app/api/transactions/route')
    const res = await GET(req('/api/transactions'))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.data).toHaveLength(1)
    expect(data.total).toBe(1)
  })

  it('accounts API still returns list (regression)', async () => {
    const { GET } = await import('@/app/api/accounts/route')
    const res = await GET(req('/api/accounts'))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(Array.isArray(data)).toBe(true)
    expect(data).toHaveLength(1)
  })

  it('categories API still returns list (regression)', async () => {
    const { GET } = await import('@/app/api/categories/route')
    const res = await GET(req('/api/categories'))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(Array.isArray(data)).toBe(true)
    expect(data).toHaveLength(1)
  })

  it('dashboard returns zero totals on empty DB', async () => {
    const { GET } = await import('@/app/api/dashboard/route')
    const res = await GET(req('/api/dashboard?range=monthly'))
    const data = await res.json()
    expect(data.total_spend).toBe(0)
    expect(data.total_income).toBe(0)
    expect(data.category_breakdown).toHaveLength(0)
  })

  it('dashboard income and expense are tracked independently', async () => {
    seedCategory('cat2', 'Salary', 'income')
    seedTransaction('tx1', 'acc1', { type: 'expense', amount: 100, categoryId: 'cat1', datetime: '2026-04-19T10:00:00+08:00' })
    seedTransaction('tx2', 'acc1', { type: 'income', amount: 5000, categoryId: 'cat2', datetime: '2026-04-19T11:00:00+08:00' })
    const { GET } = await import('@/app/api/dashboard/route')
    const res = await GET(req('/api/dashboard?range=custom&start=2026-04-19T00:00:00%2B08:00&end=2026-04-19T23:59:59%2B08:00'))
    const data = await res.json()
    expect(data.total_spend).toBeCloseTo(100)
    expect(data.total_income).toBeCloseTo(5000)
  })

  it('transactions with limit=5 respects limit param (regression for RecentTransactions)', async () => {
    for (let i = 1; i <= 8; i++) {
      seedTransaction(`tx${i}`, 'acc1', { datetime: `2026-04-19T${String(i).padStart(2, '0')}:00:00+08:00` })
    }
    const { GET } = await import('@/app/api/transactions/route')
    const res = await GET(req('/api/transactions?limit=5'))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.data).toHaveLength(5)
    expect(data.total).toBe(8)
  })
})
