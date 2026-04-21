// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { initTestDb, clearTestDb, resetTestDb, req, seedPortfolioGrowth, seedPortfolioMilestone } from '../helpers'

beforeAll(() => initTestDb())
afterAll(() => clearTestDb())
beforeEach(() => resetTestDb())

describe('GET /api/portfolio/growth', () => {
  it('returns empty arrays when no data', async () => {
    const { GET } = await import('@/app/api/portfolio/growth/route')
    const res = await GET()
    const data = await res.json()
    expect(data.scores).toEqual([])
    expect(data.milestones).toEqual([])
  })

  it('returns growth scores with parsed items array', async () => {
    seedPortfolioGrowth('K', 4, 'Knowledge', 'Developing', ['P/E understood', 'ETF basics'], 'Next step')
    const { GET } = await import('@/app/api/portfolio/growth/route')
    const res = await GET()
    const data = await res.json()
    expect(data.scores).toHaveLength(1)
    const k = data.scores[0]
    expect(k.dimension).toBe('K')
    expect(k.score).toBe(4)
    expect(k.label).toBe('Knowledge')
    expect(k.level).toBe('Developing')
    expect(Array.isArray(k.items)).toBe(true)
    expect(k.items).toHaveLength(2)
    expect(k.next_action).toBe('Next step')
  })

  it('returns milestones sorted by sort_order', async () => {
    seedPortfolioMilestone('m2', '02 Apr', ['S'], 'Second event', 1)
    seedPortfolioMilestone('m1', '27 Mar', ['E'], 'First event', 0)
    const { GET } = await import('@/app/api/portfolio/growth/route')
    const res = await GET()
    const data = await res.json()
    expect(data.milestones).toHaveLength(2)
    expect(data.milestones[0].text).toBe('First event')
    expect(data.milestones[1].text).toBe('Second event')
  })

  it('returns milestones with parsed tags array', async () => {
    seedPortfolioMilestone('m1', '27 Mar', ['E', 'S'], 'Multi-tag event', 0)
    const { GET } = await import('@/app/api/portfolio/growth/route')
    const res = await GET()
    const data = await res.json()
    expect(data.milestones[0].tags).toEqual(['E', 'S'])
  })
})

describe('PUT /api/portfolio/growth', () => {
  it('upserts a growth score dimension', async () => {
    const { PUT } = await import('@/app/api/portfolio/growth/route')
    const res = await PUT(req('/api/portfolio/growth', 'PUT', {
      dimension: 'K', score: 5, label: 'Knowledge', level: 'Competent',
      items: ['P/E understood'], next_action: 'Next',
    }))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.dimension).toBe('K')
    expect(data.score).toBe(5)
  })

  it('updates existing dimension score', async () => {
    seedPortfolioGrowth('K', 4, 'Knowledge', 'Developing', [])
    const { PUT } = await import('@/app/api/portfolio/growth/route')
    await PUT(req('/api/portfolio/growth', 'PUT', {
      dimension: 'K', score: 6, label: 'Knowledge', level: 'Proficient', items: [],
    }))
    const { GET } = await import('@/app/api/portfolio/growth/route')
    const res = await GET()
    const { scores } = await res.json()
    expect(scores[0].score).toBe(6)
  })

  it('rejects missing dimension with 400', async () => {
    const { PUT } = await import('@/app/api/portfolio/growth/route')
    const res = await PUT(req('/api/portfolio/growth', 'PUT', { score: 5 }))
    expect(res.status).toBe(400)
  })
})

describe('POST /api/portfolio/growth/milestones', () => {
  it('creates a milestone and returns 201', async () => {
    const { POST } = await import('@/app/api/portfolio/growth/milestones/route')
    const res = await POST(req('/api/portfolio/growth/milestones', 'POST', {
      date: '21 Apr', tags: ['E', 'S'], text: 'New milestone', sort_order: 0,
    }))
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.text).toBe('New milestone')
    expect(data.id).toBeTruthy()
  })

  it('rejects missing text with 400', async () => {
    const { POST } = await import('@/app/api/portfolio/growth/milestones/route')
    const res = await POST(req('/api/portfolio/growth/milestones', 'POST', { date: '21 Apr', tags: [] }))
    expect(res.status).toBe(400)
  })
})

describe('DELETE /api/portfolio/growth/milestones/[id]', () => {
  it('deletes a milestone and returns 204', async () => {
    seedPortfolioMilestone('m1', '27 Mar', ['E'], 'First', 0)
    const { DELETE } = await import('@/app/api/portfolio/growth/milestones/[id]/route')
    const res = await DELETE(
      req('/api/portfolio/growth/milestones/m1', 'DELETE'),
      { params: Promise.resolve({ id: 'm1' }) }
    )
    expect(res.status).toBe(204)
  })

  it('returns 404 for unknown id', async () => {
    const { DELETE } = await import('@/app/api/portfolio/growth/milestones/[id]/route')
    const res = await DELETE(
      req('/api/portfolio/growth/milestones/none', 'DELETE'),
      { params: Promise.resolve({ id: 'none' }) }
    )
    expect(res.status).toBe(404)
  })
})
