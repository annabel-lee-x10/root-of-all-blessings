// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import {
  initTestDb, clearTestDb, resetTestDb, req,
  seedAccount, seedCategory, seedTag, seedTransaction, seedTransactionTag,
} from '../helpers'
import { db } from '@/lib/db'

beforeAll(() => initTestDb())
afterAll(() => clearTestDb())
beforeEach(() => {
  resetTestDb()
  seedAccount('acc1', 'DBS', 'bank')
  seedAccount('acc2', 'Cash', 'cash')
  seedCategory('cat1', 'Food', 'expense')
  seedTag('tag1', 'lunch')
})

describe('POST /api/transactions/clone', () => {
  it('creates a new draft from supplied form fields', async () => {
    const { POST } = await import('@/app/api/transactions/clone/route')
    const body = {
      type: 'expense',
      amount: 12.5,
      currency: 'SGD',
      fx_rate: null,
      fx_date: null,
      sgd_equivalent: null,
      account_id: 'acc1',
      to_account_id: null,
      category_id: 'cat1',
      payee: 'Hawker',
      note: 'lunch',
      payment_method: 'bank',
      datetime: '2026-04-01T10:00:00.000+08:00',
      tag_ids: ['tag1'],
    }
    const res = await POST(req('/api/transactions/clone', 'POST', body))
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.id).toBeTruthy()
    expect(data.status).toBe('draft')
    expect(data.amount).toBe(12.5)
    expect(data.payee).toBe('Hawker')
    expect(data.account_name).toBe('DBS')
    expect(data.category_name).toBe('Food')
    expect(data.tags).toEqual([{ id: 'tag1', name: 'lunch', created_at: '' }])
  })

  it('preserves the original row unchanged when cloned', async () => {
    seedTransaction('orig1', 'acc1', {
      type: 'expense', amount: 99, payee: 'Original',
      categoryId: 'cat1', status: 'approved',
      datetime: '2026-04-01T10:00:00.000+08:00',
    })
    seedTransactionTag('orig1', 'tag1')
    const before = await db.execute({ sql: 'SELECT * FROM transactions WHERE id = ?', args: ['orig1'] })
    const beforeTags = await db.execute({
      sql: 'SELECT tag_id FROM transaction_tags WHERE transaction_id = ?', args: ['orig1'],
    })

    const { POST } = await import('@/app/api/transactions/clone/route')
    await POST(req('/api/transactions/clone', 'POST', {
      type: 'expense', amount: 99, currency: 'SGD',
      fx_rate: null, fx_date: null, sgd_equivalent: null,
      account_id: 'acc1', to_account_id: null, category_id: 'cat1',
      payee: 'Original', note: null, payment_method: 'bank',
      datetime: '2026-04-01T10:00:00.000+08:00', tag_ids: ['tag1'],
    }))

    const after = await db.execute({ sql: 'SELECT * FROM transactions WHERE id = ?', args: ['orig1'] })
    const afterTags = await db.execute({
      sql: 'SELECT tag_id FROM transaction_tags WHERE transaction_id = ?', args: ['orig1'],
    })
    expect(after.rows[0]).toEqual(before.rows[0])
    expect(afterTags.rows).toEqual(beforeTags.rows)
  })

  it('produces a row that appears in /api/transactions?status=draft', async () => {
    const { POST: cloneP } = await import('@/app/api/transactions/clone/route')
    await cloneP(req('/api/transactions/clone', 'POST', {
      type: 'expense', amount: 5, currency: 'SGD',
      fx_rate: null, fx_date: null, sgd_equivalent: null,
      account_id: 'acc1', to_account_id: null, category_id: null,
      payee: 'X', note: null, payment_method: null,
      datetime: '2026-04-01T10:00:00.000+08:00', tag_ids: [],
    }))
    const { GET } = await import('@/app/api/transactions/route')
    const res = await GET(req('/api/transactions?status=draft'))
    const data = await res.json()
    expect(data.data).toHaveLength(1)
    expect(data.data[0].status).toBe('draft')
    expect(data.data[0].payee).toBe('X')
  })

  it('returns 400 when required fields are missing', async () => {
    const { POST } = await import('@/app/api/transactions/clone/route')
    const res = await POST(req('/api/transactions/clone', 'POST', {
      currency: 'SGD',
    }))
    expect(res.status).toBe(400)
  })

  it('preserves transfer type and to_account_id', async () => {
    const { POST } = await import('@/app/api/transactions/clone/route')
    const res = await POST(req('/api/transactions/clone', 'POST', {
      type: 'transfer', amount: 50, currency: 'SGD',
      fx_rate: null, fx_date: null, sgd_equivalent: null,
      account_id: 'acc1', to_account_id: 'acc2', category_id: null,
      payee: null, note: null, payment_method: 'bank',
      datetime: '2026-04-01T10:00:00.000+08:00', tag_ids: [],
    }))
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.type).toBe('transfer')
    expect(data.to_account_id).toBe('acc2')
    expect(data.to_account_name).toBe('Cash')
    expect(data.status).toBe('draft')
  })

  it('preserves fx fields for non-SGD currencies', async () => {
    const { POST } = await import('@/app/api/transactions/clone/route')
    const res = await POST(req('/api/transactions/clone', 'POST', {
      type: 'expense', amount: 10, currency: 'USD',
      fx_rate: 1.35, fx_date: '2026-04-01', sgd_equivalent: 13.5,
      account_id: 'acc1', to_account_id: null, category_id: null,
      payee: null, note: null, payment_method: 'bank',
      datetime: '2026-04-01T10:00:00.000+08:00', tag_ids: [],
    }))
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.currency).toBe('USD')
    expect(data.fx_rate).toBe(1.35)
    expect(data.fx_date).toBe('2026-04-01')
    expect(data.sgd_equivalent).toBe(13.5)
  })
})
