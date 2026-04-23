// @vitest-environment node
// Fix 3: GET /api/{accounts,categories,tags,dashboard} must include Cache-Control header
// so the browser skips redundant refetches on repeated navigation within 30 s.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { initTestDb, clearTestDb, resetTestDb, req } from '../helpers'

beforeAll(() => initTestDb())
afterAll(() => clearTestDb())
beforeEach(() => resetTestDb())

describe('Fix 3: Cache-Control headers on read-only GET routes', () => {
  it('GET /api/accounts returns Cache-Control: private, max-age=30', async () => {
    const { GET } = await import('@/app/api/accounts/route')
    const res = await GET()
    expect(res.headers.get('Cache-Control')).toBe('private, max-age=30')
  })

  it('GET /api/categories returns Cache-Control: private, max-age=30', async () => {
    const { GET } = await import('@/app/api/categories/route')
    const res = await GET(req('/api/categories', 'GET'))
    expect(res.headers.get('Cache-Control')).toBe('private, max-age=30')
  })

  it('GET /api/tags returns Cache-Control: private, max-age=30', async () => {
    const { GET } = await import('@/app/api/tags/route')
    const res = await GET()
    expect(res.headers.get('Cache-Control')).toBe('private, max-age=30')
  })

  it('GET /api/dashboard returns Cache-Control: private, max-age=30', async () => {
    const { GET } = await import('@/app/api/dashboard/route')
    const res = await GET(req('/api/dashboard?range=1m', 'GET'))
    expect(res.headers.get('Cache-Control')).toBe('private, max-age=30')
  })
})
