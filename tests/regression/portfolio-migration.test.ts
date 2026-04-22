// @vitest-environment node
// Regression tests for BUG-033: portfolio upload fails on prod because:
// 1. /api/migrate doesn't create portfolio_holdings — POST /api/portfolio throws on INSERT
// 2. /api/migrate creates portfolio_realised_trades (wrong name) — GET /api/portfolio/snapshots
//    throws "no such table: portfolio_realised" after finding a snap_label snapshot
// 3. API routes have no try-catch — DB failures return 500 HTML, client sees "Upload failed" /
//    "Failed to load portfolio" (res.json() throws on HTML bodies)
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { initTestDb, clearTestDb, resetTestDb, req } from '../helpers'

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

async function callMigrate() {
  const { POST } = await import('@/app/api/migrate/route')
  return POST()
}

describe('BUG-033 · migration creates portfolio_holdings', () => {
  it('POST /api/migrate reports portfolio_holdings in its migrations result', async () => {
    const res = await callMigrate()
    const data = await res.json()
    // Fails before fix: migration route never creates portfolio_holdings
    expect(Object.keys(data.migrations)).toContain('portfolio_holdings')
  })

  it('POST /api/migrate reports portfolio_realised (not portfolio_realised_trades)', async () => {
    const res = await callMigrate()
    const data = await res.json()
    // Fails before fix: migration creates wrong table name
    expect(Object.keys(data.migrations)).toContain('portfolio_realised')
    expect(Object.keys(data.migrations)).not.toContain('portfolio_realised_trades')
  })

  it('POST /api/migrate is idempotent — second call also reports portfolio_holdings', async () => {
    await callMigrate()
    const res = await callMigrate()
    const data = await res.json()
    expect(Object.keys(data.migrations)).toContain('portfolio_holdings')
  })
})

describe('BUG-033 · API routes return JSON errors instead of throwing', () => {
  it('GET /api/portfolio/snapshots returns JSON 500 when db.execute rejects', async () => {
    const { db } = await import('@/lib/db')
    vi.mocked(db.execute).mockRejectedValueOnce(new Error('no such table: portfolio_holdings'))

    const { GET } = await import('@/app/api/portfolio/snapshots/route')
    let res: Response | undefined
    try {
      res = await GET()
    } catch {
      throw new Error('Route threw instead of returning a JSON error response — add try-catch')
    }
    expect(res!.status).toBe(500)
    const body = await res!.json()
    expect(body.error).toBeDefined()
  })

  it('POST /api/portfolio returns JSON 500 when db.execute rejects', async () => {
    const html = `<table>
      <tr><th>Name</th><th>Value</th></tr>
      <tr><td>Micron Technology</td><td>1600.00</td></tr>
    </table>`
    const { db } = await import('@/lib/db')
    // The first db.execute succeeds (INSERT into portfolio_snapshots), second throws
    // Simulate portfolio_holdings not existing by making the second call throw
    const original = vi.mocked(db.execute).getMockImplementation()
    let callCount = 0
    vi.mocked(db.execute).mockImplementation((...args) => {
      callCount++
      if (callCount === 2) return Promise.reject(new Error('no such table: portfolio_holdings'))
      return original!(...args)
    })

    const { POST } = await import('@/app/api/portfolio/route')
    let res: Response | undefined
    try {
      res = await POST(req('/api/portfolio', 'POST', { html }))
    } catch {
      throw new Error('Route threw instead of returning a JSON error response — add try-catch')
    } finally {
      vi.mocked(db.execute).mockImplementation(original!)
    }
    expect(res!.status).toBe(500)
    const body = await res!.json()
    expect(body.error).toBeDefined()
  })
})
