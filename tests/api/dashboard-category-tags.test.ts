// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import {
  initTestDb, clearTestDb, resetTestDb, req,
  seedAccount, seedCategory, seedTag, seedTransaction, seedTransactionTag,
} from '../helpers'

beforeAll(() => initTestDb())
afterAll(() => clearTestDb())
beforeEach(() => {
  resetTestDb()
  seedAccount('acc1', 'DBS', 'bank')
  seedCategory('cat1', 'Food', 'expense')
  seedTag('tag1', 'Lunch')
  seedTag('tag2', 'Dinner')
})

describe('GET /api/dashboard/category-tags', () => {
  it('returns empty tag_breakdown when no transactions', async () => {
    const { GET } = await import('@/app/api/dashboard/category-tags/route')
    const res = await GET(req('/api/dashboard/category-tags?category_id=cat1&start=2026-04-19T00:00:00%2B08:00&end=2026-04-19T23:59:59%2B08:00'))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.tag_breakdown).toEqual([])
    expect(data.total).toBe(0)
  })

  it('returns 400 when start or end is missing', async () => {
    const { GET } = await import('@/app/api/dashboard/category-tags/route')
    const res = await GET(req('/api/dashboard/category-tags?category_id=cat1'))
    expect(res.status).toBe(400)
  })

  it('groups tagged transactions by tag name', async () => {
    seedTransaction('tx1', 'acc1', { type: 'expense', amount: 30, categoryId: 'cat1', datetime: '2026-04-19T10:00:00+08:00' })
    seedTransaction('tx2', 'acc1', { type: 'expense', amount: 50, categoryId: 'cat1', datetime: '2026-04-19T11:00:00+08:00' })
    seedTransactionTag('tx1', 'tag1')
    seedTransactionTag('tx2', 'tag1')
    const { GET } = await import('@/app/api/dashboard/category-tags/route')
    const res = await GET(req('/api/dashboard/category-tags?category_id=cat1&start=2026-04-19T00:00:00%2B08:00&end=2026-04-19T23:59:59%2B08:00'))
    const data = await res.json()
    expect(data.tag_breakdown).toHaveLength(1)
    expect(data.tag_breakdown[0].tag_name).toBe('Lunch')
    expect(data.tag_breakdown[0].total).toBeCloseTo(80)
    expect(data.tag_breakdown[0].pct).toBeCloseTo(100)
  })

  it('includes untagged transactions as "Untagged" bucket', async () => {
    seedTransaction('tx1', 'acc1', { type: 'expense', amount: 30, categoryId: 'cat1', datetime: '2026-04-19T10:00:00+08:00' })
    seedTransaction('tx2', 'acc1', { type: 'expense', amount: 20, categoryId: 'cat1', datetime: '2026-04-19T11:00:00+08:00' })
    seedTransactionTag('tx1', 'tag1')
    // tx2 has no tags
    const { GET } = await import('@/app/api/dashboard/category-tags/route')
    const res = await GET(req('/api/dashboard/category-tags?category_id=cat1&start=2026-04-19T00:00:00%2B08:00&end=2026-04-19T23:59:59%2B08:00'))
    const data = await res.json()
    const names = data.tag_breakdown.map((e: { tag_name: string }) => e.tag_name)
    expect(names).toContain('Lunch')
    expect(names).toContain('Untagged')
    const untagged = data.tag_breakdown.find((e: { tag_name: string }) => e.tag_name === 'Untagged')
    expect(untagged.total).toBeCloseTo(20)
  })

  it('excludes transactions outside date range', async () => {
    seedTransaction('tx1', 'acc1', { type: 'expense', amount: 100, categoryId: 'cat1', datetime: '2026-04-01T10:00:00+08:00' })
    seedTransactionTag('tx1', 'tag1')
    const { GET } = await import('@/app/api/dashboard/category-tags/route')
    const res = await GET(req('/api/dashboard/category-tags?category_id=cat1&start=2026-04-19T00:00:00%2B08:00&end=2026-04-19T23:59:59%2B08:00'))
    const data = await res.json()
    expect(data.total).toBe(0)
    expect(data.tag_breakdown).toEqual([])
  })

  it('excludes transactions from other categories', async () => {
    seedCategory('cat2', 'Transport', 'expense')
    seedTransaction('tx1', 'acc1', { type: 'expense', amount: 50, categoryId: 'cat2', datetime: '2026-04-19T10:00:00+08:00' })
    seedTransactionTag('tx1', 'tag1')
    const { GET } = await import('@/app/api/dashboard/category-tags/route')
    const res = await GET(req('/api/dashboard/category-tags?category_id=cat1&start=2026-04-19T00:00:00%2B08:00&end=2026-04-19T23:59:59%2B08:00'))
    const data = await res.json()
    expect(data.total).toBe(0)
    expect(data.tag_breakdown).toEqual([])
  })

  it('total equals sum of all expense transactions in the category', async () => {
    seedTransaction('tx1', 'acc1', { type: 'expense', amount: 30, categoryId: 'cat1', datetime: '2026-04-19T10:00:00+08:00' })
    seedTransaction('tx2', 'acc1', { type: 'expense', amount: 20, categoryId: 'cat1', datetime: '2026-04-19T11:00:00+08:00' })
    seedTransactionTag('tx1', 'tag1')
    // tx2 untagged — both still count toward total
    const { GET } = await import('@/app/api/dashboard/category-tags/route')
    const res = await GET(req('/api/dashboard/category-tags?category_id=cat1&start=2026-04-19T00:00:00%2B08:00&end=2026-04-19T23:59:59%2B08:00'))
    const data = await res.json()
    expect(data.total).toBeCloseTo(50)
  })
})
