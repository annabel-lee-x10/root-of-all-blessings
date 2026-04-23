// @vitest-environment node
// Regression: BUG-038 — auto-generated snap_label has "(HTML import)" suffix and uses UTC date.
// 1. Label should show clean date only, e.g. "22 Apr 2026"
// 2. Date should use SGT (Asia/Singapore, UTC+8), not UTC
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { initTestDb, clearTestDb, resetTestDb, req } from '../helpers'

beforeAll(() => initTestDb())
afterAll(() => clearTestDb())
beforeEach(() => resetTestDb())

const MINIMAL_HTML = `<table>
  <tr><th>Ticker</th><th>Value</th></tr>
  <tr><td>MU</td><td>1600.00</td></tr>
</table>`

describe('BUG-038: auto-generated snap_label format', () => {
  it('snap_label does not contain "(HTML import)"', async () => {
    const { POST } = await import('@/app/api/portfolio/route')
    const { GET } = await import('@/app/api/portfolio/snapshots/route')

    await POST(req('/api/portfolio', 'POST', { html: MINIMAL_HTML }))
    const snap = await (await GET()).json()

    expect(snap?.snap_label).not.toContain('(HTML import)')
  })

  it('snap_label shows only the date in "D Mon YYYY" format', async () => {
    const { POST } = await import('@/app/api/portfolio/route')
    const { GET } = await import('@/app/api/portfolio/snapshots/route')

    // 10:00 UTC = 18:00 SGT — same calendar date in both timezones
    await POST(req('/api/portfolio', 'POST', {
      html: MINIMAL_HTML,
      snapshot_date: '2026-04-22T10:00:00.000Z',
    }))
    const snap = await (await GET()).json()

    expect(snap?.snap_label).toBe('22 Apr 2026')
  })

  it('snap_label uses SGT timezone — UTC 20:00 on 22 Apr is 23 Apr in SGT', async () => {
    const { POST } = await import('@/app/api/portfolio/route')
    const { GET } = await import('@/app/api/portfolio/snapshots/route')

    // 2026-04-22T20:00:00Z = 2026-04-23T04:00:00+08:00 in Singapore
    await POST(req('/api/portfolio', 'POST', {
      html: MINIMAL_HTML,
      snapshot_date: '2026-04-22T20:00:00.000Z',
    }))
    const snap = await (await GET()).json()

    // UTC interpretation would give "22 Apr 2026" — SGT gives "23 Apr 2026"
    expect(snap?.snap_label).toBe('23 Apr 2026')
  })

  it('snap_label provided by caller is preserved unchanged', async () => {
    const { POST } = await import('@/app/api/portfolio/route')
    const { GET } = await import('@/app/api/portfolio/snapshots/route')

    await POST(req('/api/portfolio', 'POST', {
      html: MINIMAL_HTML,
      snap_label: 'My Custom Label',
    }))
    const snap = await (await GET()).json()

    expect(snap?.snap_label).toBe('My Custom Label')
  })
})
