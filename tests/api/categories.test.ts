// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { initTestDb, clearTestDb, resetTestDb, req, seedCategory } from '../helpers'

beforeAll(() => initTestDb())
afterAll(() => clearTestDb())
beforeEach(() => resetTestDb())

describe('GET /api/categories', () => {
  it('returns all categories', async () => {
    seedCategory('c1', 'Food', 'expense')
    seedCategory('c2', 'Salary', 'income')
    const { GET } = await import('@/app/api/categories/route')
    const res = await GET(req('/api/categories'))
    const data = await res.json()
    expect(data).toHaveLength(2)
  })

  it('filters by type=expense', async () => {
    seedCategory('c1', 'Food', 'expense')
    seedCategory('c2', 'Salary', 'income')
    const { GET } = await import('@/app/api/categories/route')
    const { req: makeReq } = await import('../helpers')
    const res = await GET(makeReq('/api/categories?type=expense'))
    const data = await res.json()
    expect(data).toHaveLength(1)
    expect(data[0].name).toBe('Food')
  })

  it('filters by type=income', async () => {
    seedCategory('c1', 'Food', 'expense')
    seedCategory('c2', 'Salary', 'income')
    const { GET } = await import('@/app/api/categories/route')
    const { req: makeReq } = await import('../helpers')
    const res = await GET(makeReq('/api/categories?type=income'))
    const data = await res.json()
    expect(data).toHaveLength(1)
    expect(data[0].name).toBe('Salary')
  })
})

describe('POST /api/categories', () => {
  it('creates an expense category', async () => {
    const { POST } = await import('@/app/api/categories/route')
    const res = await POST(req('/api/categories', 'POST', { name: 'Transport', type: 'expense' }))
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.name).toBe('Transport')
    expect(data.type).toBe('expense')
  })

  it('creates an income category with sort_order', async () => {
    const { POST } = await import('@/app/api/categories/route')
    const res = await POST(req('/api/categories', 'POST', { name: 'Freelance', type: 'income', sort_order: 5 }))
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.sort_order).toBe(5)
  })

  it('returns 400 when name missing', async () => {
    const { POST } = await import('@/app/api/categories/route')
    const res = await POST(req('/api/categories', 'POST', { type: 'expense' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid type', async () => {
    const { POST } = await import('@/app/api/categories/route')
    const res = await POST(req('/api/categories', 'POST', { name: 'X', type: 'transfer' }))
    expect(res.status).toBe(400)
  })
})

describe('PATCH /api/categories/[id]', () => {
  it('updates name', async () => {
    seedCategory('c1', 'OldName', 'expense')
    const { PATCH } = await import('@/app/api/categories/[id]/route')
    const res = await PATCH(
      req('/api/categories/c1', 'PATCH', { name: 'NewName' }),
      { params: Promise.resolve({ id: 'c1' }) }
    )
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.name).toBe('NewName')
  })

  it('returns 404 for unknown id', async () => {
    const { PATCH } = await import('@/app/api/categories/[id]/route')
    const res = await PATCH(
      req('/api/categories/nope', 'PATCH', { name: 'X' }),
      { params: Promise.resolve({ id: 'nope' }) }
    )
    expect(res.status).toBe(404)
  })

  it('returns 400 when no fields provided', async () => {
    seedCategory('c2', 'NoChange', 'income')
    const { PATCH } = await import('@/app/api/categories/[id]/route')
    const res = await PATCH(
      req('/api/categories/c2', 'PATCH', {}),
      { params: Promise.resolve({ id: 'c2' }) }
    )
    expect(res.status).toBe(400)
  })
})

describe('DELETE /api/categories/[id]', () => {
  it('deletes a category', async () => {
    seedCategory('c3', 'ToDelete', 'expense')
    const { DELETE } = await import('@/app/api/categories/[id]/route')
    const res = await DELETE(
      req('/api/categories/c3', 'DELETE'),
      { params: Promise.resolve({ id: 'c3' }) }
    )
    expect(res.status).toBe(200)
    expect((await res.json()).ok).toBe(true)
  })

  it('returns 404 for unknown id', async () => {
    const { DELETE } = await import('@/app/api/categories/[id]/route')
    const res = await DELETE(
      req('/api/categories/nope', 'DELETE'),
      { params: Promise.resolve({ id: 'nope' }) }
    )
    expect(res.status).toBe(404)
  })
})
