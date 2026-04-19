// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { initTestDb, clearTestDb, resetTestDb, req, seedAccount, seedCategory, seedTransaction, seedTag, seedTransactionTag } from '../helpers'

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

  it('includes category_id in category_breakdown entries', async () => {
    seedTransaction('tx1', 'acc1', {
      type: 'expense', amount: 50, categoryId: 'cat1',
      datetime: '2026-04-19T10:00:00+08:00',
    })
    const { GET } = await import('@/app/api/dashboard/route')
    const res = await GET(req('/api/dashboard?range=custom&start=2026-04-19T00:00:00%2B08:00&end=2026-04-19T23:59:59%2B08:00'))
    const data = await res.json()
    expect(data.category_breakdown[0].category_id).toBe('cat1')
  })

  it('returns tag breakdown grouped by tag name when drilldown param is provided', async () => {
    seedTag('tag1', 'Lunch')
    seedTag('tag2', 'Coffee')
    seedTransaction('tx1', 'acc1', { type: 'expense', amount: 40, categoryId: 'cat1', datetime: '2026-04-19T10:00:00+08:00' })
    seedTransaction('tx2', 'acc1', { type: 'expense', amount: 20, categoryId: 'cat1', datetime: '2026-04-19T11:00:00+08:00' })
    seedTransactionTag('tx1', 'tag1')
    seedTransactionTag('tx2', 'tag2')
    const { GET } = await import('@/app/api/dashboard/route')
    const res = await GET(req('/api/dashboard?range=custom&start=2026-04-19T00:00:00%2B08:00&end=2026-04-19T23:59:59%2B08:00&drilldown=cat1'))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.tag_breakdown).toBeDefined()
    const lunch = data.tag_breakdown.find((t: { tag_name: string }) => t.tag_name === 'Lunch')
    const coffee = data.tag_breakdown.find((t: { tag_name: string }) => t.tag_name === 'Coffee')
    expect(lunch?.total).toBeCloseTo(40)
    expect(coffee?.total).toBeCloseTo(20)
  })

  it('groups untagged transactions as Untagged in drill-down', async () => {
    seedTransaction('tx1', 'acc1', { type: 'expense', amount: 30, categoryId: 'cat1', datetime: '2026-04-19T10:00:00+08:00' })
    const { GET } = await import('@/app/api/dashboard/route')
    const res = await GET(req('/api/dashboard?range=custom&start=2026-04-19T00:00:00%2B08:00&end=2026-04-19T23:59:59%2B08:00&drilldown=cat1'))
    const data = await res.json()
    expect(data.tag_breakdown).toHaveLength(1)
    expect(data.tag_breakdown[0].tag_name).toBe('Untagged')
    expect(data.tag_breakdown[0].total).toBeCloseTo(30)
  })

  it('drill-down excludes transactions outside the date range', async () => {
    seedTag('tag1', 'Lunch')
    seedTransaction('tx_in', 'acc1', { type: 'expense', amount: 50, categoryId: 'cat1', datetime: '2026-04-19T10:00:00+08:00' })
    seedTransaction('tx_out', 'acc1', { type: 'expense', amount: 999, categoryId: 'cat1', datetime: '2026-01-01T10:00:00+08:00' })
    seedTransactionTag('tx_in', 'tag1')
    seedTransactionTag('tx_out', 'tag1')
    const { GET } = await import('@/app/api/dashboard/route')
    const res = await GET(req('/api/dashboard?range=custom&start=2026-04-19T00:00:00%2B08:00&end=2026-04-19T23:59:59%2B08:00&drilldown=cat1'))
    const data = await res.json()
    const lunch = data.tag_breakdown.find((t: { tag_name: string }) => t.tag_name === 'Lunch')
    expect(lunch?.total).toBeCloseTo(50)
  })

  it('drill-down excludes transactions from other categories', async () => {
    seedTag('tag1', 'Eating out')
    seedTransaction('tx1', 'acc1', { type: 'expense', amount: 100, categoryId: 'cat1', datetime: '2026-04-19T10:00:00+08:00' })
    seedTransaction('tx2', 'acc1', { type: 'expense', amount: 200, categoryId: 'cat2', datetime: '2026-04-19T11:00:00+08:00' })
    seedTransactionTag('tx1', 'tag1')
    seedTransactionTag('tx2', 'tag1')
    const { GET } = await import('@/app/api/dashboard/route')
    const res = await GET(req('/api/dashboard?range=custom&start=2026-04-19T00:00:00%2B08:00&end=2026-04-19T23:59:59%2B08:00&drilldown=cat1'))
    const data = await res.json()
    const row = data.tag_breakdown.find((t: { tag_name: string }) => t.tag_name === 'Eating out')
    expect(row?.total).toBeCloseTo(100)
    const untagged = data.tag_breakdown.find((t: { tag_name: string }) => t.tag_name === 'Untagged')
    expect(untagged).toBeUndefined()
  })

  it('drill-down excludes transfer transactions', async () => {
    seedAccount('acc2', 'Cash', 'cash')
    seedTag('tag1', 'Move')
    seedTransaction('tx1', 'acc1', { type: 'transfer', amount: 500, toAccountId: 'acc2', datetime: '2026-04-19T10:00:00+08:00' })
    seedTransactionTag('tx1', 'tag1')
    const { GET } = await import('@/app/api/dashboard/route')
    const res = await GET(req('/api/dashboard?range=custom&start=2026-04-19T00:00:00%2B08:00&end=2026-04-19T23:59:59%2B08:00&drilldown=cat1'))
    const data = await res.json()
    expect(data.tag_breakdown).toHaveLength(0)
  })
})
