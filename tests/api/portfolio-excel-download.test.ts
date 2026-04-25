// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import {
  initTestDb,
  clearTestDb,
  resetTestDb,
  seedPortfolioSnapshotV2,
  seedPortfolioHolding,
} from '../helpers'
import { db } from '@/lib/db'

vi.mock('@/lib/session', () => ({
  verifySession: vi.fn().mockResolvedValue({ userId: 'u1' }),
}))

vi.mock('@/lib/portfolio/excel-generator', () => ({
  generateExcel: vi.fn().mockReturnValue(Buffer.from('fake-xlsx')),
}))

beforeAll(() => initTestDb())
afterAll(() => clearTestDb())
beforeEach(() => {
  resetTestDb()
  vi.resetModules()
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

function makeGet(id: string): NextRequest {
  return new NextRequest(`http://localhost/api/portfolio/download/excel/${id}`, {
    method: 'GET',
  })
}

describe('BUG-055 – Excel download route', () => {
  it('exports maxDuration as 60', async () => {
    const routeModule = await import('@/app/api/portfolio/download/excel/[id]/route')
    expect((routeModule as Record<string, unknown>).maxDuration).toBe(60)
  })

  it('returns 401 without auth', async () => {
    const { verifySession } = await import('@/lib/session')
    vi.mocked(verifySession).mockResolvedValueOnce(null)
    const { GET } = await import('@/app/api/portfolio/download/excel/[id]/route')
    const res = await GET(makeGet('any-id'), { params: Promise.resolve({ id: 'any-id' }) })
    expect(res.status).toBe(401)
  })

  it('returns 404 for unknown snapshot id', async () => {
    const { GET } = await import('@/app/api/portfolio/download/excel/[id]/route')
    const res = await GET(makeGet('nonexistent'), { params: Promise.resolve({ id: 'nonexistent' }) })
    expect(res.status).toBe(404)
  })

  it('returns xlsx content-type for a known snapshot', async () => {
    seedPortfolioSnapshotV2('snap-1', { snap_label: 'Test', total_value: 1000 })
    const { GET } = await import('@/app/api/portfolio/download/excel/[id]/route')
    const res = await GET(makeGet('snap-1'), { params: Promise.resolve({ id: 'snap-1' }) })
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
  })

  it('fetches all holdings in one query (not N separate queries) for multiple snapshots', async () => {
    seedPortfolioSnapshotV2('snap-a', { snap_label: 'A', total_value: 5000 })
    seedPortfolioSnapshotV2('snap-b', { snap_label: 'B', total_value: 6000 })
    seedPortfolioSnapshotV2('snap-c', { snap_label: 'C', total_value: 7000 })
    seedPortfolioHolding('snap-a', { ticker: 'AAPL', name: 'Apple', value: 1000 })
    seedPortfolioHolding('snap-b', { ticker: 'MSFT', name: 'Microsoft', value: 2000 })
    seedPortfolioHolding('snap-c', { ticker: 'NVDA', name: 'Nvidia', value: 3000 })

    const { GET } = await import('@/app/api/portfolio/download/excel/[id]/route')
    const res = await GET(makeGet('snap-a'), { params: Promise.resolve({ id: 'snap-a' }) })
    expect(res.status).toBe(200)

    // db.execute is already a vi.fn() from wireDbMock — count holdings SELECTs
    const holdingsSelectCalls = vi.mocked(db.execute).mock.calls.filter((args) => {
      const q = args[0]
      const sql = typeof q === 'string' ? q : (q as { sql: string }).sql
      return /SELECT.*portfolio_holdings/i.test(sql)
    })

    // With N snapshots, only 1 holdings SELECT should fire (not N)
    expect(holdingsSelectCalls).toHaveLength(1)
  })

  it('passes correct holdings per snapshot to generateExcel', async () => {
    seedPortfolioSnapshotV2('snap-x', { snap_label: 'X', total_value: 10000 })
    seedPortfolioSnapshotV2('snap-y', { snap_label: 'Y', total_value: 20000 })
    seedPortfolioHolding('snap-x', { ticker: 'AMZN', name: 'Amazon', value: 5000, pnl: 100 })
    seedPortfolioHolding('snap-y', { ticker: 'GOOG', name: 'Alphabet', value: 8000, pnl: 200 })

    const { generateExcel } = await import('@/lib/portfolio/excel-generator')
    const { GET } = await import('@/app/api/portfolio/download/excel/[id]/route')
    await GET(makeGet('snap-x'), { params: Promise.resolve({ id: 'snap-x' }) })

    const [snapshots] = vi.mocked(generateExcel).mock.calls.at(-1)!
    const snapX = snapshots.find((s) => s.id === 'snap-x')
    const snapY = snapshots.find((s) => s.id === 'snap-y')
    expect(snapX?.holdings).toHaveLength(1)
    expect(snapX?.holdings[0].ticker).toBe('AMZN')
    expect(snapY?.holdings).toHaveLength(1)
    expect(snapY?.holdings[0].ticker).toBe('GOOG')
  })
})
