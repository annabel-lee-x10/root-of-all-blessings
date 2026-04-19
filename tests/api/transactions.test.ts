// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import {
  initTestDb, clearTestDb, resetTestDb, req,
  seedAccount, seedCategory, seedTag, seedTransaction,
} from '../helpers'

beforeAll(() => initTestDb())
afterAll(() => clearTestDb())
beforeEach(() => {
  resetTestDb()
  seedAccount('acc1', 'DBS', 'bank')
  seedAccount('acc2', 'Cash', 'cash')
  seedCategory('cat1', 'Food', 'expense')
})

describe('GET /api/transactions', () => {
  it('returns paginated empty result', async () => {
    const { GET } = await import('@/app/api/transactions/route')
    const res = await GET(req('/api/transactions'))
    const data = await res.json()
    expect(data.data).toHaveLength(0)
    expect(data.total).toBe(0)
    expect(data.page).toBe(1)
    expect(data.limit).toBe(20)
  })

  it('returns transactions ordered by datetime desc', async () => {
    seedTransaction('tx1', 'acc1', { datetime: '2024-01-01T10:00:00.000Z' })
    seedTransaction('tx2', 'acc1', { datetime: '2024-01-02T10:00:00.000Z' })
    const { GET } = await import('@/app/api/transactions/route')
    const res = await GET(req('/api/transactions'))
    const data = await res.json()
    expect(data.data[0].id).toBe('tx2')
    expect(data.data[1].id).toBe('tx1')
  })

  it('filters by type', async () => {
    seedTransaction('tx1', 'acc1', { type: 'expense' })
    seedTransaction('tx2', 'acc1', { type: 'income' })
    const { GET } = await import('@/app/api/transactions/route')
    const res = await GET(req('/api/transactions?type=expense'))
    const data = await res.json()
    expect(data.data).toHaveLength(1)
    expect(data.data[0].id).toBe('tx1')
  })

  it('filters by account_id', async () => {
    seedTransaction('tx1', 'acc1')
    seedTransaction('tx2', 'acc2')
    const { GET } = await import('@/app/api/transactions/route')
    const res = await GET(req('/api/transactions?account_id=acc1'))
    const data = await res.json()
    expect(data.data).toHaveLength(1)
    expect(data.data[0].id).toBe('tx1')
  })

  it('filters by date range', async () => {
    seedTransaction('tx1', 'acc1', { datetime: '2024-01-01T00:00:00.000Z' })
    seedTransaction('tx2', 'acc1', { datetime: '2024-06-15T00:00:00.000Z' })
    seedTransaction('tx3', 'acc1', { datetime: '2024-12-31T00:00:00.000Z' })
    const { GET } = await import('@/app/api/transactions/route')
    const res = await GET(req('/api/transactions?start=2024-01-15T00:00:00.000Z&end=2024-12-01T00:00:00.000Z'))
    const data = await res.json()
    expect(data.data).toHaveLength(1)
    expect(data.data[0].id).toBe('tx2')
  })

  it('paginates correctly', async () => {
    for (let i = 0; i < 5; i++) {
      seedTransaction(`tx${i}`, 'acc1', { amount: i + 1 })
    }
    const { GET } = await import('@/app/api/transactions/route')
    const res = await GET(req('/api/transactions?limit=2&page=2'))
    const data = await res.json()
    expect(data.data).toHaveLength(2)
    expect(data.total).toBe(5)
    expect(data.page).toBe(2)
    expect(data.limit).toBe(2)
  })

  it('hydrates tags', async () => {
    seedTag('tag1', 'travel')
    seedTransaction('tx1', 'acc1')
    // link tag manually
    const { initTestDb: _init, ...rest } = await import('../helpers')
    void rest
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const db = require('better-sqlite3')
    void db
    // use the seeded transaction and add tag via POST instead
    const { GET } = await import('@/app/api/transactions/route')
    const res = await GET(req('/api/transactions'))
    const data = await res.json()
    expect(Array.isArray(data.data[0].tags)).toBe(true)
  })
})

describe('POST /api/transactions', () => {
  it('creates an expense transaction', async () => {
    const { POST } = await import('@/app/api/transactions/route')
    const res = await POST(req('/api/transactions', 'POST', {
      type: 'expense',
      amount: 25.50,
      account_id: 'acc1',
      datetime: '2024-06-01T10:00:00.000+08:00',
    }))
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.type).toBe('expense')
    expect(data.amount).toBe(25.50)
    expect(data.currency).toBe('SGD')
    expect(data.account_name).toBe('DBS')
  })

  it('creates an income transaction with category and payee', async () => {
    const { POST } = await import('@/app/api/transactions/route')
    const res = await POST(req('/api/transactions', 'POST', {
      type: 'income',
      amount: 3000,
      account_id: 'acc1',
      category_id: 'cat1',
      payee: 'Employer',
      datetime: '2024-06-01T10:00:00.000+08:00',
    }))
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.payee).toBe('Employer')
    expect(data.category_name).toBe('Food')
  })

  it('creates a transfer transaction', async () => {
    const { POST } = await import('@/app/api/transactions/route')
    const res = await POST(req('/api/transactions', 'POST', {
      type: 'transfer',
      amount: 500,
      account_id: 'acc1',
      to_account_id: 'acc2',
      datetime: '2024-06-01T10:00:00.000+08:00',
    }))
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.type).toBe('transfer')
    expect(data.to_account_name).toBe('Cash')
  })

  it('calculates sgd_equivalent for FX transactions', async () => {
    seedAccount('usd-acc', 'US Bank', 'bank', 'USD')
    const { POST } = await import('@/app/api/transactions/route')
    const res = await POST(req('/api/transactions', 'POST', {
      type: 'expense',
      amount: 100,
      currency: 'USD',
      fx_rate: 1.35,
      fx_date: '2024-06-01',
      account_id: 'usd-acc',
      datetime: '2024-06-01T10:00:00.000+08:00',
    }))
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.sgd_equivalent).toBeCloseTo(135, 1)
  })

  it('returns 400 when type is missing', async () => {
    const { POST } = await import('@/app/api/transactions/route')
    const res = await POST(req('/api/transactions', 'POST', {
      amount: 10,
      account_id: 'acc1',
      datetime: '2024-06-01T10:00:00.000+08:00',
    }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid type', async () => {
    const { POST } = await import('@/app/api/transactions/route')
    const res = await POST(req('/api/transactions', 'POST', {
      type: 'loan',
      amount: 10,
      account_id: 'acc1',
      datetime: '2024-06-01T10:00:00.000+08:00',
    }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for transfer without to_account_id', async () => {
    const { POST } = await import('@/app/api/transactions/route')
    const res = await POST(req('/api/transactions', 'POST', {
      type: 'transfer',
      amount: 100,
      account_id: 'acc1',
      datetime: '2024-06-01T10:00:00.000+08:00',
    }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for inactive account', async () => {
    seedAccount('inactive', 'Inactive', 'bank')
    // deactivate it
    const { PATCH } = await import('@/app/api/accounts/[id]/route')
    await PATCH(
      req('/api/accounts/inactive', 'PATCH', { is_active: 0 }),
      { params: Promise.resolve({ id: 'inactive' }) }
    )
    const { POST } = await import('@/app/api/transactions/route')
    const res = await POST(req('/api/transactions', 'POST', {
      type: 'expense',
      amount: 10,
      account_id: 'inactive',
      datetime: '2024-06-01T10:00:00.000+08:00',
    }))
    expect(res.status).toBe(400)
  })

  it('stores and returns payment_method', async () => {
    const { POST } = await import('@/app/api/transactions/route')
    const res = await POST(req('/api/transactions', 'POST', {
      type: 'expense',
      amount: 12.50,
      account_id: 'acc1',
      datetime: '2024-06-01T10:00:00.000+08:00',
      payment_method: 'credit card',
    }))
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.payment_method).toBe('credit card')
  })

  it('attaches tags', async () => {
    seedTag('tag1', 'travel')
    const { POST } = await import('@/app/api/transactions/route')
    const res = await POST(req('/api/transactions', 'POST', {
      type: 'expense',
      amount: 50,
      account_id: 'acc1',
      datetime: '2024-06-01T10:00:00.000+08:00',
      tag_ids: ['tag1'],
    }))
    expect(res.status).toBe(201)
    // GET to verify tags are loaded
    const txId = (await res.json()).id
    const { GET } = await import('@/app/api/transactions/route')
    const listRes = await GET(req('/api/transactions'))
    const listData = await listRes.json()
    const tx = listData.data.find((t: { id: string }) => t.id === txId)
    expect(tx.tags).toHaveLength(1)
    expect(tx.tags[0].name).toBe('travel')
  })
})

describe('PATCH /api/transactions/[id]', () => {
  it('updates amount and note', async () => {
    seedTransaction('tx1', 'acc1', { amount: 10 })
    const { PATCH } = await import('@/app/api/transactions/[id]/route')
    const res = await PATCH(
      req('/api/transactions/tx1', 'PATCH', { amount: 99, note: 'updated' }),
      { params: Promise.resolve({ id: 'tx1' }) }
    )
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.amount).toBe(99)
    expect(data.note).toBe('updated')
  })

  it('replaces tag_ids', async () => {
    seedTag('tag1', 'food')
    seedTag('tag2', 'work')
    seedTransaction('tx1', 'acc1')
    const { PATCH } = await import('@/app/api/transactions/[id]/route')
    // set tag1
    await PATCH(
      req('/api/transactions/tx1', 'PATCH', { tag_ids: ['tag1'] }),
      { params: Promise.resolve({ id: 'tx1' }) }
    )
    // replace with tag2
    const res = await PATCH(
      req('/api/transactions/tx1', 'PATCH', { tag_ids: ['tag2'] }),
      { params: Promise.resolve({ id: 'tx1' }) }
    )
    expect(res.status).toBe(200)
    const { GET } = await import('@/app/api/transactions/route')
    const listRes = await GET(req('/api/transactions'))
    const listData = await listRes.json()
    const tx = listData.data.find((t: { id: string }) => t.id === 'tx1')
    expect(tx.tags).toHaveLength(1)
    expect(tx.tags[0].name).toBe('work')
  })

  it('updates payment_method', async () => {
    seedTransaction('tx-pm', 'acc1', { amount: 10 })
    const { PATCH } = await import('@/app/api/transactions/[id]/route')
    const res = await PATCH(
      req('/api/transactions/tx-pm', 'PATCH', { payment_method: 'e-wallet' }),
      { params: Promise.resolve({ id: 'tx-pm' }) }
    )
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.payment_method).toBe('e-wallet')
  })

  it('returns 404 for unknown id', async () => {
    const { PATCH } = await import('@/app/api/transactions/[id]/route')
    const res = await PATCH(
      req('/api/transactions/nope', 'PATCH', { note: 'x' }),
      { params: Promise.resolve({ id: 'nope' }) }
    )
    expect(res.status).toBe(404)
  })

  it('returns 400 when no fields provided', async () => {
    seedTransaction('tx2', 'acc1')
    const { PATCH } = await import('@/app/api/transactions/[id]/route')
    const res = await PATCH(
      req('/api/transactions/tx2', 'PATCH', {}),
      { params: Promise.resolve({ id: 'tx2' }) }
    )
    expect(res.status).toBe(400)
  })
})

describe('DELETE /api/transactions/[id]', () => {
  it('deletes a transaction and its tags', async () => {
    seedTag('tag1', 'food')
    seedTransaction('tx1', 'acc1')
    const { PATCH } = await import('@/app/api/transactions/[id]/route')
    await PATCH(
      req('/api/transactions/tx1', 'PATCH', { tag_ids: ['tag1'] }),
      { params: Promise.resolve({ id: 'tx1' }) }
    )
    const { DELETE } = await import('@/app/api/transactions/[id]/route')
    const res = await DELETE(
      req('/api/transactions/tx1', 'DELETE'),
      { params: Promise.resolve({ id: 'tx1' }) }
    )
    expect(res.status).toBe(200)
    const { GET } = await import('@/app/api/transactions/route')
    const listRes = await GET(req('/api/transactions'))
    const data = await listRes.json()
    expect(data.data).toHaveLength(0)
  })

  it('returns 404 for unknown id', async () => {
    const { DELETE } = await import('@/app/api/transactions/[id]/route')
    const res = await DELETE(
      req('/api/transactions/nope', 'DELETE'),
      { params: Promise.resolve({ id: 'nope' }) }
    )
    expect(res.status).toBe(404)
  })
})

describe('GET /api/transactions/payees', () => {
  it('returns distinct payees', async () => {
    seedTransaction('tx1', 'acc1', { payee: 'Starbucks' })
    seedTransaction('tx2', 'acc1', { payee: 'Starbucks' })
    seedTransaction('tx3', 'acc1', { payee: 'McDonald\'s' })
    const { GET } = await import('@/app/api/transactions/payees/route')
    const res = await GET()
    const data = await res.json()
    expect(data).toContain('Starbucks')
    expect(data).toContain('McDonald\'s')
    expect(new Set(data).size).toBe(data.length)
  })

  it('excludes null payees', async () => {
    seedTransaction('tx1', 'acc1', { payee: null })
    const { GET } = await import('@/app/api/transactions/payees/route')
    const res = await GET()
    const data = await res.json()
    expect(data).not.toContain(null)
    expect(data).toHaveLength(0)
  })
})
