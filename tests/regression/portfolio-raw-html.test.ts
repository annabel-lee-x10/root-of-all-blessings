// @vitest-environment node
// BUG-051: scan/route and snapshots/route inserted NULL for raw_html,
// violating the NOT NULL constraint on the production Turso schema.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { initTestDb, clearTestDb, resetTestDb } from '../helpers'
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
  process.env.ANTHROPIC_API_KEY = 'test-key'
})

describe('BUG-051 – raw_html must be empty string, not NULL', () => {
  it('scan route stores raw_html as empty string on new snapshot', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        content: [{ text: JSON.stringify([
          { type: 'summary', data: { total_value: 10000 } },
        ]) }],
      }),
    }))

    const form = new FormData()
    form.append('images', new File([Buffer.from('img')], 'ss.jpg', { type: 'image/jpeg' }))
    const { POST } = await import('@/app/api/portfolio/scan/route')
    const res = await POST(new NextRequest('http://localhost/api/portfolio/scan', { method: 'POST', body: form }))
    expect(res.status).toBe(200)
    const { snapshot_id } = await res.json()

    const snap = (await db.execute({
      sql: 'SELECT raw_html FROM portfolio_snapshots WHERE id = ?',
      args: [snapshot_id],
    })).rows[0]

    expect(snap.raw_html).toBe('')
  })

  it('snapshots POST stores raw_html as empty string', async () => {
    const { POST } = await import('@/app/api/portfolio/snapshots/route')
    const res = await POST(new NextRequest('http://localhost/api/portfolio/snapshots', {
      method: 'POST',
      body: JSON.stringify({ total_value: 20000, snap_label: '24 Apr 2026' }),
      headers: { 'Content-Type': 'application/json' },
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
