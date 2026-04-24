// @vitest-environment node
// Regression: BUG-038 data fix — POST /api/migrate strips "(HTML import)" from existing
// snap_labels and backfills NULL snap_labels using the correct SGT timezone.
// GET /api/migrate provides a diagnostic view of recent snapshots.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { initTestDb, clearTestDb, resetTestDb, seedPortfolioSnapshot } from '../helpers'

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

async function callMigrateGet() {
  const { GET } = await import('@/app/api/migrate/route')
  return GET!()
}

describe('BUG-038 · migrate strips "(HTML import)" from snap_label', () => {
  it('POST /api/migrate reports snap_label.strip_html_import in migrations result', async () => {
    seedPortfolioSnapshot('snap-1', [], {
      snap_label: '22 Apr 2026 (HTML import)',
      snapshot_date: '2026-04-22T10:00:00.000Z',
    })
    const res = await callMigrate()
    const data = await res.json()
    expect(Object.keys(data.migrations)).toContain('snap_label.strip_html_import')
  })

  it('strips "(HTML import)" and keeps correct SGT date (10:00 UTC = same calendar day)', async () => {
    // 2026-04-22T10:00:00Z = 2026-04-22T18:00:00+08:00 — still 22 Apr in SGT
    seedPortfolioSnapshot('snap-1', [], {
      snap_label: '22 Apr 2026 (HTML import)',
      snapshot_date: '2026-04-22T10:00:00.000Z',
    })
    await callMigrate()
    const { db } = await import('@/lib/db')
    const result = await db.execute({
      sql: 'SELECT snap_label FROM portfolio_snapshots WHERE id = ?',
      args: ['snap-1'],
    })
    expect(result.rows[0].snap_label).toBe('22 Apr 2026')
  })

  it('corrects UTC-vs-SGT error — T20:00Z on 22 Apr is 23 Apr in SGT', async () => {
    // 2026-04-22T20:00:00Z = 2026-04-23T04:00:00+08:00 — 23 Apr in SGT
    seedPortfolioSnapshot('snap-2', [], {
      snap_label: '22 Apr 2026 (HTML import)',
      snapshot_date: '2026-04-22T20:00:00.000Z',
    })
    await callMigrate()
    const { db } = await import('@/lib/db')
    const result = await db.execute({
      sql: 'SELECT snap_label FROM portfolio_snapshots WHERE id = ?',
      args: ['snap-2'],
    })
    expect(result.rows[0].snap_label).toBe('23 Apr 2026')
  })

  it('is idempotent — second POST does not corrupt labels', async () => {
    seedPortfolioSnapshot('snap-1', [], {
      snap_label: '22 Apr 2026 (HTML import)',
      snapshot_date: '2026-04-22T10:00:00.000Z',
    })
    await callMigrate()
    await callMigrate()
    const { db } = await import('@/lib/db')
    const result = await db.execute({
      sql: 'SELECT snap_label FROM portfolio_snapshots WHERE id = ?',
      args: ['snap-1'],
    })
    expect(result.rows[0].snap_label).toBe('22 Apr 2026')
  })
})

describe('BUG-038 · migrate backfills NULL snap_labels', () => {
  it('POST /api/migrate reports snap_label.backfill_nulls in migrations result', async () => {
    seedPortfolioSnapshot('snap-null', [], {
      snapshot_date: '2026-04-21T05:34:00.000Z',
      // snap_label defaults to null
    })
    const res = await callMigrate()
    const data = await res.json()
    expect(Object.keys(data.migrations)).toContain('snap_label.backfill_nulls')
  })

  it('backfills NULL snap_label with SGT date', async () => {
    // 2026-04-21T05:34:00Z = 2026-04-21T13:34:00+08:00 — 21 Apr in SGT
    seedPortfolioSnapshot('snap-null', [], {
      snapshot_date: '2026-04-21T05:34:00.000Z',
    })
    await callMigrate()
    const { db } = await import('@/lib/db')
    const result = await db.execute({
      sql: 'SELECT snap_label FROM portfolio_snapshots WHERE id = ?',
      args: ['snap-null'],
    })
    expect(result.rows[0].snap_label).toBe('21 Apr 2026')
  })

  it('backfill uses SGT timezone — T20:00Z gives next calendar day', async () => {
    // 2026-04-22T20:00:00Z = 2026-04-23T04:00:00+08:00
    seedPortfolioSnapshot('snap-null', [], {
      snapshot_date: '2026-04-22T20:00:00.000Z',
    })
    await callMigrate()
    const { db } = await import('@/lib/db')
    const result = await db.execute({
      sql: 'SELECT snap_label FROM portfolio_snapshots WHERE id = ?',
      args: ['snap-null'],
    })
    expect(result.rows[0].snap_label).toBe('23 Apr 2026')
  })

  it('does not overwrite existing custom snap_labels', async () => {
    seedPortfolioSnapshot('snap-custom', [], {
      snap_label: 'Snap 27',
      snapshot_date: '2026-04-21T05:34:00.000Z',
    })
    await callMigrate()
    const { db } = await import('@/lib/db')
    const result = await db.execute({
      sql: 'SELECT snap_label FROM portfolio_snapshots WHERE id = ?',
      args: ['snap-custom'],
    })
    expect(result.rows[0].snap_label).toBe('Snap 27')
  })
})

// BUG-045 fixed the GET handler — it now runs migrations (not returns snapshots).
describe('BUG-045 · GET /api/migrate runs migrations (not snapshot diagnostics)', () => {
  it('GET /api/migrate returns ok:true with a migrations object', async () => {
    const res = await callMigrateGet()
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(typeof data.migrations).toBe('object')
  })

  it('GET /api/migrate returns 401 when not authenticated', async () => {
    vi.mocked((await import('@/lib/session')).verifySession).mockResolvedValueOnce(false as never)
    const res = await callMigrateGet()
    expect(res.status).toBe(401)
  })
})
