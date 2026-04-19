// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { initTestDb, clearTestDb, resetTestDb, req, seedAccount, seedCategory, seedTag, seedTransaction, seedTransactionTag } from '../helpers'

beforeAll(() => initTestDb())
afterAll(() => clearTestDb())
beforeEach(() => {
  resetTestDb()
  seedAccount('acc1', 'DBS', 'bank')
  seedCategory('cat1', 'Food', 'expense')
  seedCategory('cat2', 'Salary', 'income')
})

describe('GET /api/dashboard', () => {
  it('returns zero totals when no transactions', async () => {
    const { GET } = await import('@/app/api/dashboard/route')
    const res = await GET(req('/api/dashboard?range=daily'))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.total_spend).toBe(0)
    expect(data.total_income).toBe(0)
    expect(data.daily_average).toBe(0)
    expect(data.category_breakdown).toEqual([])
    expect(data.days_in_range).toBeGreaterThanOrEqual(1)
  })

  it('returns 400 for unknown range', async () => {
    const { GET } = await import('@/app/api/dashboard/route')
    const res = await GET(req('/api/dashboard?range=bogus'))
    expect(res.status).toBe(400)
  })

  it('sums expenses within date range', async () => {
    seedTransaction('tx1', 'acc1', {
      type: 'expense', amount: 50, categoryId: 'cat1',
      datetime: '2026-04-19T10:00:00+08:00',
    })
    seedTransaction('tx2', 'acc1', {
      type: 'expense', amount: 30, categoryId: 'cat1',
      datetime: '2026-04-19T14:00:00+08:00',
    })
    seedTransaction('tx_old', 'acc1', {
      type: 'expense', amount: 999,
      datetime: '2026-01-01T10:00:00+08:00',
    })
    const { GET } = await import('@/app/api/dashboard/route')
    const res = await GET(req('/api/dashboard?range=custom&start=2026-04-19T00:00:00%2B08:00&end=2026-04-19T23:59:59%2B08:00'))
    const data = await res.json()
    expect(data.total_spend).toBeCloseTo(80)
    expect(data.total_income).toBe(0)
  })

  it('sums income within date range', async () => {
    seedTransaction('tx1', 'acc1', {
      type: 'income', amount: 5000, categoryId: 'cat2',
      datetime: '2026-04-19T09:00:00+08:00',
    })
    const { GET } = await import('@/app/api/dashboard/route')
    const res = await GET(req('/api/dashboard?range=custom&start=2026-04-19T00:00:00%2B08:00&end=2026-04-19T23:59:59%2B08:00'))
    const data = await res.json()
    expect(data.total_income).toBeCloseTo(5000)
    expect(data.total_spend).toBe(0)
  })

  it('category_breakdown groups expenses by category name', async () => {
    seedTransaction('tx1', 'acc1', { type: 'expense', amount: 40, categoryId: 'cat1', datetime: '2026-04-19T10:00:00+08:00' })
    seedTransaction('tx2', 'acc1', { type: 'expense', amount: 60, categoryId: 'cat1', datetime: '2026-04-19T11:00:00+08:00' })
    const { GET } = await import('@/app/api/dashboard/route')
    const res = await GET(req('/api/dashboard?range=custom&start=2026-04-19T00:00:00%2B08:00&end=2026-04-19T23:59:59%2B08:00'))
    const data = await res.json()
    expect(data.category_breakdown).toHaveLength(1)
    expect(data.category_breakdown[0].category_name).toBe('Food')
    expect(data.category_breakdown[0].total).toBeCloseTo(100)
    expect(data.category_breakdown[0].pct).toBeCloseTo(100)
  })

  it('daily_average divides total_spend by days_in_range', async () => {
    seedTransaction('tx1', 'acc1', { type: 'expense', amount: 70, datetime: '2026-04-15T10:00:00+08:00' })
    seedTransaction('tx2', 'acc1', { type: 'expense', amount: 70, datetime: '2026-04-17T10:00:00+08:00' })
    const { GET } = await import('@/app/api/dashboard/route')
    const res = await GET(req('/api/dashboard?range=custom&start=2026-04-13T00:00:00%2B08:00&end=2026-04-19T23:59:59%2B08:00'))
    const data = await res.json()
    expect(data.total_spend).toBeCloseTo(140)
    expect(data.days_in_range).toBe(7)
    expect(data.daily_average).toBeCloseTo(20)
  })

  it('excludes transfers from totals', async () => {
    seedAccount('acc2', 'Cash', 'cash')
    seedTransaction('tx1', 'acc1', {
      type: 'transfer', amount: 200, toAccountId: 'acc2',
      datetime: '2026-04-19T10:00:00+08:00',
    })
    const { GET } = await import('@/app/api/dashboard/route')
    const res = await GET(req('/api/dashboard?range=custom&start=2026-04-19T00:00:00%2B08:00&end=2026-04-19T23:59:59%2B08:00'))
    const data = await res.json()
    expect(data.total_spend).toBe(0)
    expect(data.total_income).toBe(0)
  })

  it('category_breakdown entries include tag_breakdown array', async () => {
    seedTag('tag1', 'Lunch')
    seedTag('tag2', 'Work')
    seedTransaction('tx1', 'acc1', { type: 'expense', amount: 40, categoryId: 'cat1', datetime: '2026-04-19T10:00:00+08:00' })
    seedTransaction('tx2', 'acc1', { type: 'expense', amount: 60, categoryId: 'cat1', datetime: '2026-04-19T11:00:00+08:00' })
    seedTransactionTag('tx1', 'tag1')
    seedTransactionTag('tx2', 'tag2')
    const { GET } = await import('@/app/api/dashboard/route')
    const res = await GET(req('/api/dashboard?range=custom&start=2026-04-19T00:00:00%2B08:00&end=2026-04-19T23:59:59%2B08:00'))
    const data = await res.json()
    expect(data.category_breakdown[0].tag_breakdown).toBeDefined()
    expect(Array.isArray(data.category_breakdown[0].tag_breakdown)).toBe(true)
    expect(data.category_breakdown[0].tag_breakdown).toHaveLength(2)
    const tagNames = data.category_breakdown[0].tag_breakdown.map((t: { tag_name: string }) => t.tag_name)
    expect(tagNames).toContain('Lunch')
    expect(tagNames).toContain('Work')
  })

  it('tag_breakdown includes Untagged entry for transactions with no tags', async () => {
    seedTransaction('tx1', 'acc1', { type: 'expense', amount: 50, categoryId: 'cat1', datetime: '2026-04-19T10:00:00+08:00' })
    const { GET } = await import('@/app/api/dashboard/route')
    const res = await GET(req('/api/dashboard?range=custom&start=2026-04-19T00:00:00%2B08:00&end=2026-04-19T23:59:59%2B08:00'))
    const data = await res.json()
    expect(data.category_breakdown[0].tag_breakdown).toHaveLength(1)
    expect(data.category_breakdown[0].tag_breakdown[0].tag_name).toBe('Untagged')
    expect(data.category_breakdown[0].tag_breakdown[0].total).toBeCloseTo(50)
  })

  it('existing category_breakdown test still has tag_breakdown field', async () => {
    seedTransaction('tx1', 'acc1', { type: 'expense', amount: 40, categoryId: 'cat1', datetime: '2026-04-19T10:00:00+08:00' })
    seedTransaction('tx2', 'acc1', { type: 'expense', amount: 60, categoryId: 'cat1', datetime: '2026-04-19T11:00:00+08:00' })
    const { GET } = await import('@/app/api/dashboard/route')
    const res = await GET(req('/api/dashboard?range=custom&start=2026-04-19T00:00:00%2B08:00&end=2026-04-19T23:59:59%2B08:00'))
    const data = await res.json()
    expect(data.category_breakdown[0].tag_breakdown).toEqual([{ tag_name: 'Untagged', total: 100 }])
  })

  it('uses amount as fallback when sgd_equivalent is null for non-SGD expenses', async () => {
    seedTransaction('tx1', 'acc1', {
      type: 'expense', amount: 100, currency: 'USD',
      datetime: '2026-04-19T10:00:00+08:00',
    })
    const { GET } = await import('@/app/api/dashboard/route')
    const res = await GET(req('/api/dashboard?range=custom&start=2026-04-19T00:00:00%2B08:00&end=2026-04-19T23:59:59%2B08:00'))
    const data = await res.json()
    expect(data.total_spend).toBeCloseTo(100)
  })
})

describe('GET /api/dashboard (drilldown)', () => {
  it('returns tag breakdown for a category', async () => {
    seedTag('tag1', 'Dining Out')
    seedTag('tag2', 'Groceries')
    seedTransaction('tx1', 'acc1', { type: 'expense', amount: 50, categoryId: 'cat1', datetime: '2026-04-19T10:00:00+08:00' })
    seedTransaction('tx2', 'acc1', { type: 'expense', amount: 30, categoryId: 'cat1', datetime: '2026-04-19T12:00:00+08:00' })
    seedTransactionTag('tx1', 'tag1')
    seedTransactionTag('tx2', 'tag2')
    const { GET } = await import('@/app/api/dashboard/route')
    const res = await GET(req('/api/dashboard?range=custom&start=2026-04-19T00:00:00%2B08:00&end=2026-04-19T23:59:59%2B08:00&drilldown=Food'))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.category_name).toBe('Food')
    expect(data.total).toBeCloseTo(80)
    expect(data.tag_breakdown).toHaveLength(2)
    expect(data.tag_breakdown[0].tag_name).toBe('Dining Out')
    expect(data.tag_breakdown[0].total).toBeCloseTo(50)
    expect(data.tag_breakdown[0].pct).toBeCloseTo(62.5)
  })

  it('groups multiple transactions under the same tag', async () => {
    seedTag('tag1', 'Dining Out')
    seedTransaction('tx1', 'acc1', { type: 'expense', amount: 20, categoryId: 'cat1', datetime: '2026-04-19T10:00:00+08:00' })
    seedTransaction('tx2', 'acc1', { type: 'expense', amount: 30, categoryId: 'cat1', datetime: '2026-04-19T12:00:00+08:00' })
    seedTransactionTag('tx1', 'tag1')
    seedTransactionTag('tx2', 'tag1')
    const { GET } = await import('@/app/api/dashboard/route')
    const res = await GET(req('/api/dashboard?range=custom&start=2026-04-19T00:00:00%2B08:00&end=2026-04-19T23:59:59%2B08:00&drilldown=Food'))
    const data = await res.json()
    expect(data.tag_breakdown).toHaveLength(1)
    expect(data.tag_breakdown[0].tag_name).toBe('Dining Out')
    expect(data.tag_breakdown[0].total).toBeCloseTo(50)
  })

  it('shows untagged transactions as "(untagged)"', async () => {
    seedTransaction('tx1', 'acc1', { type: 'expense', amount: 40, categoryId: 'cat1', datetime: '2026-04-19T10:00:00+08:00' })
    const { GET } = await import('@/app/api/dashboard/route')
    const res = await GET(req('/api/dashboard?range=custom&start=2026-04-19T00:00:00%2B08:00&end=2026-04-19T23:59:59%2B08:00&drilldown=Food'))
    const data = await res.json()
    expect(data.tag_breakdown).toHaveLength(1)
    expect(data.tag_breakdown[0].tag_name).toBe('(untagged)')
    expect(data.tag_breakdown[0].total).toBeCloseTo(40)
    expect(data.tag_breakdown[0].pct).toBeCloseTo(100)
  })

  it('excludes transfers from drilldown totals', async () => {
    seedAccount('acc2', 'Cash', 'cash')
    seedTransaction('tx1', 'acc1', { type: 'transfer', amount: 100, toAccountId: 'acc2', datetime: '2026-04-19T10:00:00+08:00' })
    const { GET } = await import('@/app/api/dashboard/route')
    const res = await GET(req('/api/dashboard?range=custom&start=2026-04-19T00:00:00%2B08:00&end=2026-04-19T23:59:59%2B08:00&drilldown=Food'))
    const data = await res.json()
    expect(data.total).toBe(0)
    expect(data.tag_breakdown).toHaveLength(0)
  })

  it('respects date range — excludes transactions outside range', async () => {
    seedTransaction('tx1', 'acc1', { type: 'expense', amount: 50, categoryId: 'cat1', datetime: '2026-01-01T10:00:00+08:00' })
    const { GET } = await import('@/app/api/dashboard/route')
    const res = await GET(req('/api/dashboard?range=custom&start=2026-04-19T00:00:00%2B08:00&end=2026-04-19T23:59:59%2B08:00&drilldown=Food'))
    const data = await res.json()
    expect(data.total).toBe(0)
    expect(data.tag_breakdown).toHaveLength(0)
  })

  it('returns total 0 and empty breakdown when category has no spend in range', async () => {
    const { GET } = await import('@/app/api/dashboard/route')
    const res = await GET(req('/api/dashboard?range=custom&start=2026-04-19T00:00:00%2B08:00&end=2026-04-19T23:59:59%2B08:00&drilldown=Food'))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.category_name).toBe('Food')
    expect(data.total).toBe(0)
    expect(data.tag_breakdown).toEqual([])
  })
})
