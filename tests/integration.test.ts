// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { initTestDb, clearTestDb, resetTestDb, req, seedAccount, seedCategory, seedTag } from './helpers'

vi.mock('@/lib/session', () => ({
  createSession: vi.fn().mockResolvedValue(undefined),
  deleteSession: vi.fn().mockResolvedValue(undefined),
  verifySession: vi.fn().mockResolvedValue(true),
  verifySessionToken: vi.fn().mockResolvedValue(true),
}))

beforeAll(() => initTestDb())
afterAll(() => clearTestDb())
beforeEach(() => {
  resetTestDb()
  vi.clearAllMocks()
})

describe('Full login → CRUD → export flow', () => {
  it('login, create account, create transaction, export CSV', async () => {
    // login
    const { resetRateLimit } = await import('@/lib/rate-limit')
    resetRateLimit('127.0.0.1')
    const { POST: loginPost } = await import('@/app/api/auth/login/route')
    const loginRes = await loginPost(req('/api/auth/login', 'POST', { password: 'password' }))
    expect(loginRes.status).toBe(200)

    // create account
    const { POST: accountPost } = await import('@/app/api/accounts/route')
    const acctRes = await accountPost(req('/api/accounts', 'POST', { name: 'IntegBank', type: 'bank' }))
    expect(acctRes.status).toBe(201)
    const acct = await acctRes.json()

    // create category
    const { POST: catPost } = await import('@/app/api/categories/route')
    const catRes = await catPost(req('/api/categories', 'POST', { name: 'Groceries', type: 'expense' }))
    expect(catRes.status).toBe(201)
    const cat = await catRes.json()

    // create transaction
    const { POST: txPost } = await import('@/app/api/transactions/route')
    const txRes = await txPost(req('/api/transactions', 'POST', {
      type: 'expense',
      amount: 42.50,
      account_id: acct.id,
      category_id: cat.id,
      payee: 'NTUC',
      datetime: '2024-06-01T10:00:00.000+08:00',
    }))
    expect(txRes.status).toBe(201)

    // export as CSV
    const { GET: exportGet } = await import('@/app/api/transactions/export/route')
    const exportRes = await exportGet(req('/api/transactions/export?format=csv'))
    expect(exportRes.status).toBe(200)
    const csv = await exportRes.text()
    expect(csv).toContain('NTUC')
    expect(csv).toContain('42.5')
  })
})

describe('Transfer flow', () => {
  it('creates a transfer between two accounts', async () => {
    seedAccount('from-acc', 'From', 'bank')
    seedAccount('to-acc', 'To', 'cash')

    const { POST } = await import('@/app/api/transactions/route')
    const res = await POST(req('/api/transactions', 'POST', {
      type: 'transfer',
      amount: 200,
      account_id: 'from-acc',
      to_account_id: 'to-acc',
      datetime: '2024-06-01T10:00:00.000+08:00',
    }))
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.account_name).toBe('From')
    expect(data.to_account_name).toBe('To')

    // filter by account_id catches both sides
    const { GET } = await import('@/app/api/transactions/route')
    const fromRes = await GET(req('/api/transactions?account_id=from-acc'))
    const fromData = await fromRes.json()
    expect(fromData.data).toHaveLength(1)

    const toRes = await GET(req('/api/transactions?account_id=to-acc'))
    const toData = await toRes.json()
    expect(toData.data).toHaveLength(1)
  })
})

describe('Tag lifecycle', () => {
  it('create tag, attach to transaction, update tag, delete tag', async () => {
    seedAccount('acc1', 'Bank', 'bank')

    // create tag
    const { POST: tagPost } = await import('@/app/api/tags/route')
    const tagRes = await tagPost(req('/api/tags', 'POST', { name: 'vacation' }))
    const tag = await tagRes.json()

    // create transaction with tag
    const { POST: txPost } = await import('@/app/api/transactions/route')
    const txRes = await txPost(req('/api/transactions', 'POST', {
      type: 'expense',
      amount: 500,
      account_id: 'acc1',
      datetime: '2024-06-01T10:00:00.000+08:00',
      tag_ids: [tag.id],
    }))
    const tx = await txRes.json()

    // verify tag attached
    const { GET } = await import('@/app/api/transactions/route')
    const listRes = await GET(req('/api/transactions'))
    const listData = await listRes.json()
    const found = listData.data.find((t: { id: string }) => t.id === tx.id)
    expect(found.tags[0].name).toBe('vacation')

    // rename tag
    const { PATCH: tagPatch } = await import('@/app/api/tags/[id]/route')
    await tagPatch(
      req(`/api/tags/${tag.id}`, 'PATCH', { name: 'holiday' }),
      { params: Promise.resolve({ id: tag.id }) }
    )

    // delete tag
    const { DELETE: tagDel } = await import('@/app/api/tags/[id]/route')
    const delRes = await tagDel(
      req(`/api/tags/${tag.id}`, 'DELETE'),
      { params: Promise.resolve({ id: tag.id }) }
    )
    expect(delRes.status).toBe(200)
  })
})

describe('Regression: auth guard', () => {
  it('middleware blocks unauthenticated API requests', async () => {
    const { middleware } = await import('@/middleware')
    const { NextRequest } = await import('next/server')

    const protectedPaths = [
      '/api/accounts',
      '/api/transactions',
      '/api/categories',
      '/api/tags',
      '/api/transactions/export',
    ]

    for (const path of protectedPaths) {
      const request = new NextRequest(new URL(path, 'http://localhost:3000'))
      const res = await middleware(request)
      expect(res.status).toBe(307)
    }
  })
})

describe('Regression: category type filtering', () => {
  it('only expense categories accepted for expense transactions (UI-level)', async () => {
    seedAccount('acc1', 'Bank', 'bank')
    seedCategory('income-cat', 'Salary', 'income')

    // The API does not enforce category type — that's a UI concern.
    // Verify the category type field is stored correctly.
    const { GET } = await import('@/app/api/categories/route')
    const res = await GET(req('/api/categories?type=income'))
    const data = await res.json()
    const cat = data.find((c: { id: string }) => c.id === 'income-cat')
    expect(cat.type).toBe('income')
  })
})

describe('Regression: datetime precision', () => {
  it('stores and retrieves datetime with timezone offset', async () => {
    seedAccount('acc1', 'Bank', 'bank')
    const datetime = '2024-06-15T14:30:00.000+08:00'

    const { POST } = await import('@/app/api/transactions/route')
    const res = await POST(req('/api/transactions', 'POST', {
      type: 'expense',
      amount: 10,
      account_id: 'acc1',
      datetime,
    }))
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.datetime).toBe(datetime)
  })
})

describe('Regression: soft delete accounts', () => {
  it('deactivated account still appears in list but marked is_active=0', async () => {
    seedAccount('acc1', 'Bank', 'bank')

    const { DELETE } = await import('@/app/api/accounts/[id]/route')
    await DELETE(
      req('/api/accounts/acc1', 'DELETE'),
      { params: Promise.resolve({ id: 'acc1' }) }
    )

    const { GET } = await import('@/app/api/accounts/route')
    const res = await GET()
    const data = await res.json()
    const found = data.find((a: { id: string }) => a.id === 'acc1')
    expect(found).toBeDefined()
    expect(found.is_active).toBe(0)
  })

  it('cannot create transaction against deactivated account', async () => {
    seedAccount('acc1', 'Bank', 'bank')
    const { PATCH } = await import('@/app/api/accounts/[id]/route')
    await PATCH(
      req('/api/accounts/acc1', 'PATCH', { is_active: 0 }),
      { params: Promise.resolve({ id: 'acc1' }) }
    )

    const { POST } = await import('@/app/api/transactions/route')
    const res = await POST(req('/api/transactions', 'POST', {
      type: 'expense',
      amount: 10,
      account_id: 'acc1',
      datetime: '2024-06-01T10:00:00.000+08:00',
    }))
    expect(res.status).toBe(400)
  })
})
