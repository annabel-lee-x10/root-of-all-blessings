// @vitest-environment node
// Regression: BUG-032 — POST /api/portfolio (HTML upload) creates snapshots with snap_label=null,
// which are invisible to GET /api/portfolio/snapshots (v2 route filters WHERE snap_label IS NOT NULL).
// The v2 route is what portfolio-client.tsx uses to populate the UI after upload.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { initTestDb, clearTestDb, resetTestDb, req } from '../helpers'

beforeAll(() => initTestDb())
afterAll(() => clearTestDb())
beforeEach(() => resetTestDb())

const VALID_HTML = `<table>
  <tr><th>Ticker</th><th>Name</th><th>Value</th></tr>
  <tr><td>MU</td><td>Micron Technology</td><td>1600.00</td></tr>
  <tr><td>ABBV</td><td>AbbVie Inc.</td><td>640.00</td></tr>
</table>`

describe('BUG-032: HTML upload visible via /api/portfolio/snapshots', () => {
  it('GET /api/portfolio/snapshots returns non-null after HTML upload', async () => {
    const { POST } = await import('@/app/api/portfolio/route')
    const { GET } = await import('@/app/api/portfolio/snapshots/route')

    const postRes = await POST(req('/api/portfolio', 'POST', { html: VALID_HTML }))
    expect(postRes.status).toBe(201)

    const snap = await (await GET()).json()
    // Fails before fix: snap_label=null so v2 GET returns null
    expect(snap).not.toBeNull()
  })

  it('holdings are populated in /api/portfolio/snapshots after HTML upload', async () => {
    const { POST } = await import('@/app/api/portfolio/route')
    const { GET } = await import('@/app/api/portfolio/snapshots/route')

    await POST(req('/api/portfolio', 'POST', { html: VALID_HTML }))

    const snap = await (await GET()).json()
    // Fails before fix: snap is null, so snap.holdings throws
    expect(snap?.holdings).toHaveLength(2)
    const mu = snap?.holdings?.find((h: { ticker?: string }) => h.ticker === 'MU')
    expect(mu?.market_value).toBeCloseTo(1600)
  })

  it('snapshot has auto-generated snap_label after HTML upload', async () => {
    const { POST } = await import('@/app/api/portfolio/route')
    const { GET } = await import('@/app/api/portfolio/snapshots/route')

    await POST(req('/api/portfolio', 'POST', { html: VALID_HTML }))

    const snap = await (await GET()).json()
    // Fails before fix: snap is null
    expect(snap?.snap_label).toBeTruthy()
  })
})
