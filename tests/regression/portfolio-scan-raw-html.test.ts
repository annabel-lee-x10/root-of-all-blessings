// @vitest-environment node
// BUG-051: scan route and snapshots POST inserted NULL for raw_html, violating NOT NULL constraint
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { initTestDb, clearTestDb, resetTestDb, req } from '../helpers'
import { db } from '@/lib/db'

vi.mock('@/lib/session', () => ({
  verifySession: vi.fn().mockResolvedValue({ userId: 'u1' }),
}))

beforeAll(() => initTestDb())
afterAll(() => clearTestDb())
beforeEach(() => {
  resetTestDb()
  vi.resetModules()
  vi.restoreAllMocks()
  process.env.ANTHROPIC_API_KEY = 'test-api-key'
})

describe('BUG-051: raw_html NOT NULL constraint on portfolio_snapshots', () => {
  it('POST /api/portfolio/scan creates snapshot without violating raw_html NOT NULL', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        content: [{ text: JSON.stringify([
          { type: 'summary', data: { total_value: 50000, unrealised_pnl: 1500, cash: 3000 } },
        ]) }],
      }),
    }))

    const formData = new FormData()
    formData.append('images', new File([Buffer.from('fake')], 'shot.jpg', { type: 'image/jpeg' }))
    const request = new NextRequest('http://localhost/api/portfolio/scan', {
      method: 'POST',
      body: formData,
    })

    const { POST } = await import('@/app/api/portfolio/scan/route')
    const res = await POST(request)
    expect(res.status).toBe(200)

    const { snapshot_id } = await res.json()
    const snap = (await db.execute({
      sql: 'SELECT raw_html FROM portfolio_snapshots WHERE id = ?',
      args: [snapshot_id],
    })).rows[0]
    expect(snap.raw_html).toBe('')
  })

  it('POST /api/portfolio/snapshots creates snapshot without violating raw_html NOT NULL', async () => {
    const { POST } = await import('@/app/api/portfolio/snapshots/route')
    const res = await POST(req('/api/portfolio/snapshots', 'POST', {
      snap_label: 'Test Snap',
      total_value: 10000,
      holdings: [],
    }))
    expect(res.status).toBe(201)

    const { id } = await res.json()
    const snap = (await db.execute({
      sql: 'SELECT raw_html FROM portfolio_snapshots WHERE id = ?',
      args: [id],
    })).rows[0]
    expect(snap.raw_html).toBe('')
  })
})
