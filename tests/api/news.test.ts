// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { initTestDb, clearTestDb, resetTestDb, req, seedNewsBrief } from '../helpers'

beforeAll(() => initTestDb())
afterAll(() => clearTestDb())
beforeEach(() => resetTestDb())

describe('GET /api/news', () => {
  it('returns null when no briefs exist', async () => {
    const { GET } = await import('@/app/api/news/route')
    const res = await GET()
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toBeNull()
  })

  it('returns the latest brief as brief_json + generated_at', async () => {
    const content = { world: [{ id: 'w1' }], sg: [], prop: [], jobsGlobal: [], jobsSg: [], port: [] }
    seedNewsBrief('b1', content)
    const { GET } = await import('@/app/api/news/route')
    const res = await GET()
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).not.toBeNull()
    expect(data.brief_json).toBeDefined()
    expect(data.generated_at).toBeDefined()
    expect(JSON.parse(data.brief_json)).toMatchObject({ world: [{ id: 'w1' }] })
  })

  it('returns tickers field when stored', async () => {
    const content = { world: [], sg: [], prop: [], jobsGlobal: [], jobsSg: [], port: [] }
    seedNewsBrief('b1', content, ['NVDA', 'MU'])
    const { GET } = await import('@/app/api/news/route')
    const res = await GET()
    const data = await res.json()
    expect(data.tickers).toBeDefined()
    expect(JSON.parse(data.tickers)).toEqual(['NVDA', 'MU'])
  })

  it('returns null tickers when not stored', async () => {
    const content = { world: [], sg: [], prop: [], jobsGlobal: [], jobsSg: [], port: [] }
    seedNewsBrief('b1', content)
    const { GET } = await import('@/app/api/news/route')
    const res = await GET()
    const data = await res.json()
    expect(data.tickers).toBeNull()
  })

  it('returns the most recently created brief when multiple exist', async () => {
    const old = { world: [{ id: 'old' }], sg: [], prop: [], jobsGlobal: [], jobsSg: [], port: [] }
    const fresh = { world: [{ id: 'fresh' }], sg: [], prop: [], jobsGlobal: [], jobsSg: [], port: [] }
    seedNewsBrief('b1', old, null, '2026-01-01T00:00:00.000Z')
    seedNewsBrief('b2', fresh, null, '2026-04-19T10:00:00.000Z')
    const { GET } = await import('@/app/api/news/route')
    const res = await GET()
    const data = await res.json()
    expect(JSON.parse(data.brief_json).world[0].id).toBe('fresh')
  })

  it('does not expose content_json or created_at raw field names', async () => {
    seedNewsBrief('b1', { world: [], sg: [], prop: [], jobsGlobal: [], jobsSg: [], port: [] })
    const { GET } = await import('@/app/api/news/route')
    const res = await GET()
    const data = await res.json()
    // The API should alias these fields
    expect(Object.keys(data)).toContain('brief_json')
    expect(Object.keys(data)).toContain('generated_at')
  })
})

describe('POST /api/news', () => {
  it('creates a brief and returns 201 with id + generated_at', async () => {
    const { POST } = await import('@/app/api/news/route')
    const body = { brief_json: { world: [], sg: [], prop: [], jobsGlobal: [], jobsSg: [], port: [] } }
    const res = await POST(req('/api/news', 'POST', body))
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.id).toBeDefined()
    expect(data.generated_at).toBeDefined()
  })

  it('persists brief so subsequent GET returns it', async () => {
    const { POST, GET } = await import('@/app/api/news/route')
    const body = {
      brief_json: { world: [{ id: 'x99' }], sg: [], prop: [], jobsGlobal: [], jobsSg: [], port: [] },
    }
    await POST(req('/api/news', 'POST', body))
    const res = await GET()
    const data = await res.json()
    expect(JSON.parse(data.brief_json).world[0].id).toBe('x99')
  })

  it('persists tickers when provided', async () => {
    const { POST, GET } = await import('@/app/api/news/route')
    await POST(req('/api/news', 'POST', {
      brief_json: { world: [], sg: [], prop: [], jobsGlobal: [], jobsSg: [], port: [] },
      tickers: ['NVDA', 'MU', 'D05'],
    }))
    const res = await GET()
    const data = await res.json()
    expect(JSON.parse(data.tickers)).toEqual(['NVDA', 'MU', 'D05'])
  })

  it('returns 400 when brief_json is missing', async () => {
    const { POST } = await import('@/app/api/news/route')
    const res = await POST(req('/api/news', 'POST', {}))
    expect(res.status).toBe(400)
  })

  it('returns 400 when brief_json is a string', async () => {
    const { POST } = await import('@/app/api/news/route')
    const res = await POST(req('/api/news', 'POST', { brief_json: 'not-an-object' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when brief_json is an array', async () => {
    const { POST } = await import('@/app/api/news/route')
    const res = await POST(req('/api/news', 'POST', { brief_json: [] }))
    expect(res.status).toBe(400)
  })

  it('stores null for tickers when tickers not provided', async () => {
    const { POST, GET } = await import('@/app/api/news/route')
    await POST(req('/api/news', 'POST', {
      brief_json: { world: [], sg: [], prop: [], jobsGlobal: [], jobsSg: [], port: [] },
    }))
    const res = await GET()
    const data = await res.json()
    expect(data.tickers).toBeNull()
  })
})
