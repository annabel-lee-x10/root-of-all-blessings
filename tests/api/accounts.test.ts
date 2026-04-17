// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { initTestDb, clearTestDb, resetTestDb, req, seedAccount } from '../helpers'

beforeAll(() => initTestDb())
afterAll(() => clearTestDb())
beforeEach(() => resetTestDb())

describe('GET /api/accounts', () => {
  it('returns empty array when no accounts', async () => {
    const { GET } = await import('@/app/api/accounts/route')
    const res = await GET()
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(Array.isArray(data)).toBe(true)
    expect(data).toHaveLength(0)
  })

  it('returns seeded accounts', async () => {
    seedAccount('a1', 'DBS', 'bank')
    seedAccount('a2', 'Cash', 'cash')
    const { GET } = await import('@/app/api/accounts/route')
    const res = await GET()
    const data = await res.json()
    expect(data).toHaveLength(2)
    const names = data.map((r: { name: string }) => r.name)
    expect(names).toContain('DBS')
    expect(names).toContain('Cash')
  })
})

describe('POST /api/accounts', () => {
  it('creates an account and returns 201', async () => {
    const { POST } = await import('@/app/api/accounts/route')
    const res = await POST(req('/api/accounts', 'POST', { name: 'OCBC', type: 'bank' }))
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.name).toBe('OCBC')
    expect(data.type).toBe('bank')
    expect(data.currency).toBe('SGD')
    expect(data.is_active).toBe(1)
  })

  it('returns 400 when name is missing', async () => {
    const { POST } = await import('@/app/api/accounts/route')
    const res = await POST(req('/api/accounts', 'POST', { type: 'bank' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid type', async () => {
    const { POST } = await import('@/app/api/accounts/route')
    const res = await POST(req('/api/accounts', 'POST', { name: 'X', type: 'invalid' }))
    expect(res.status).toBe(400)
  })

  it('sets custom currency', async () => {
    const { POST } = await import('@/app/api/accounts/route')
    const res = await POST(req('/api/accounts', 'POST', { name: 'US Bank', type: 'bank', currency: 'USD' }))
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.currency).toBe('USD')
  })
})

describe('PATCH /api/accounts/[id]', () => {
  it('updates name', async () => {
    seedAccount('a1', 'OldName', 'bank')
    const { PATCH } = await import('@/app/api/accounts/[id]/route')
    const res = await PATCH(
      req('/api/accounts/a1', 'PATCH', { name: 'NewName' }),
      { params: Promise.resolve({ id: 'a1' }) }
    )
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.name).toBe('NewName')
  })

  it('soft-deactivates via is_active=0', async () => {
    seedAccount('a2', 'ToDeactivate', 'bank')
    const { PATCH } = await import('@/app/api/accounts/[id]/route')
    const res = await PATCH(
      req('/api/accounts/a2', 'PATCH', { is_active: 0 }),
      { params: Promise.resolve({ id: 'a2' }) }
    )
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.is_active).toBe(0)
  })

  it('returns 404 for unknown id', async () => {
    const { PATCH } = await import('@/app/api/accounts/[id]/route')
    const res = await PATCH(
      req('/api/accounts/nope', 'PATCH', { name: 'X' }),
      { params: Promise.resolve({ id: 'nope' }) }
    )
    expect(res.status).toBe(404)
  })

  it('returns 400 when no fields provided', async () => {
    seedAccount('a3', 'NoChange', 'bank')
    const { PATCH } = await import('@/app/api/accounts/[id]/route')
    const res = await PATCH(
      req('/api/accounts/a3', 'PATCH', {}),
      { params: Promise.resolve({ id: 'a3' }) }
    )
    expect(res.status).toBe(400)
  })
})

describe('DELETE /api/accounts/[id]', () => {
  it('soft-deletes (sets is_active=0)', async () => {
    seedAccount('a4', 'ToDelete', 'bank')
    const { DELETE } = await import('@/app/api/accounts/[id]/route')
    const res = await DELETE(
      req('/api/accounts/a4', 'DELETE'),
      { params: Promise.resolve({ id: 'a4' }) }
    )
    expect(res.status).toBe(200)

    // verify it's deactivated, not removed
    const { GET } = await import('@/app/api/accounts/route')
    const listRes = await GET()
    const data = await listRes.json()
    const found = data.find((r: { id: string }) => r.id === 'a4')
    expect(found).toBeDefined()
    expect(found.is_active).toBe(0)
  })

  it('returns 404 for unknown id', async () => {
    const { DELETE } = await import('@/app/api/accounts/[id]/route')
    const res = await DELETE(
      req('/api/accounts/nope', 'DELETE'),
      { params: Promise.resolve({ id: 'nope' }) }
    )
    expect(res.status).toBe(404)
  })
})
