// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { initTestDb, clearTestDb, resetTestDb, req, seedTag } from '../helpers'

beforeAll(() => initTestDb())
afterAll(() => clearTestDb())
beforeEach(() => resetTestDb())

describe('GET /api/tags', () => {
  it('returns empty array', async () => {
    const { GET } = await import('@/app/api/tags/route')
    const res = await GET()
    const data = await res.json()
    expect(Array.isArray(data)).toBe(true)
    expect(data).toHaveLength(0)
  })

  it('returns seeded tags in alphabetical order', async () => {
    seedTag('t1', 'Zebra')
    seedTag('t2', 'Apple')
    const { GET } = await import('@/app/api/tags/route')
    const res = await GET()
    const data = await res.json()
    expect(data[0].name).toBe('Apple')
    expect(data[1].name).toBe('Zebra')
  })
})

describe('POST /api/tags', () => {
  it('creates a tag', async () => {
    const { POST } = await import('@/app/api/tags/route')
    const res = await POST(req('/api/tags', 'POST', { name: 'travel' }))
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.name).toBe('travel')
    expect(data.id).toBeTruthy()
  })

  it('returns 400 when name missing', async () => {
    const { POST } = await import('@/app/api/tags/route')
    const res = await POST(req('/api/tags', 'POST', {}))
    expect(res.status).toBe(400)
  })
})

describe('PATCH /api/tags/[id]', () => {
  it('renames a tag', async () => {
    seedTag('t1', 'old')
    const { PATCH } = await import('@/app/api/tags/[id]/route')
    const res = await PATCH(
      req('/api/tags/t1', 'PATCH', { name: 'new' }),
      { params: Promise.resolve({ id: 't1' }) }
    )
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.name).toBe('new')
  })

  it('returns 400 when name missing', async () => {
    seedTag('t2', 'test')
    const { PATCH } = await import('@/app/api/tags/[id]/route')
    const res = await PATCH(
      req('/api/tags/t2', 'PATCH', {}),
      { params: Promise.resolve({ id: 't2' }) }
    )
    expect(res.status).toBe(400)
  })

  it('returns 404 for unknown id', async () => {
    const { PATCH } = await import('@/app/api/tags/[id]/route')
    const res = await PATCH(
      req('/api/tags/nope', 'PATCH', { name: 'x' }),
      { params: Promise.resolve({ id: 'nope' }) }
    )
    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/tags/[id]', () => {
  it('deletes a tag', async () => {
    seedTag('t3', 'todelete')
    const { DELETE } = await import('@/app/api/tags/[id]/route')
    const res = await DELETE(
      req('/api/tags/t3', 'DELETE'),
      { params: Promise.resolve({ id: 't3' }) }
    )
    expect(res.status).toBe(200)
  })

  it('returns 404 for unknown id', async () => {
    const { DELETE } = await import('@/app/api/tags/[id]/route')
    const res = await DELETE(
      req('/api/tags/nope', 'DELETE'),
      { params: Promise.resolve({ id: 'nope' }) }
    )
    expect(res.status).toBe(404)
  })
})
