// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { initTestDb, clearTestDb, resetTestDb, req, seedPortfolioSnapshot } from '../helpers'

beforeAll(initTestDb)
afterAll(clearTestDb)
beforeEach(resetTestDb)

describe('GET /api/portfolio — snap27 snapshot', () => {
  it('returns null when no snapshot exists', async () => {
    const { GET } = await import('@/app/api/portfolio/route')
    const res = await GET()
    const body = await res.json()
    expect(body).toBeNull()
  })

  it('returns snapshot fields including snap_label, cash and prior fields when present', async () => {
    seedPortfolioSnapshot('snap-1', [{ name: 'MU', market_value: 2242 }], {
      total_value: 12165.28, total_pnl: 593.25,
      cash: 87.45, pending: 508.07, realised_pnl: 430.88,
      snap_label: 'Snap 27',
      prior_value: 12013.65, prior_unrealised: 521.11, prior_realised: 357.36,
      prior_cash: 889.14, prior_holdings_count: 20,
    })
    const { GET } = await import('@/app/api/portfolio/route')
    const res = await GET()
    const body = await res.json()
    expect(body.snap_label).toBe('Snap 27')
    expect(body.cash).toBe(87.45)
    expect(body.prior_value).toBe(12013.65)
    expect(body.prior_holdings_count).toBe(20)
  })

  it('returns the most recent snapshot when multiple exist', async () => {
    seedPortfolioSnapshot('snap-old', [], { snapshot_date: '2026-04-20T00:00:00Z' })
    seedPortfolioSnapshot('snap-new', [], { snapshot_date: '2026-04-21T00:00:00Z' })
    const { GET } = await import('@/app/api/portfolio/route')
    const res = await GET()
    const body = await res.json()
    expect(body.id).toBe('snap-new')
  })

  it('enriches holdings with geo/sector from ticker metadata', async () => {
    seedPortfolioSnapshot('snap-1', [{ name: 'MU US', ticker: 'MU US', market_value: 100 }])
    const { GET } = await import('@/app/api/portfolio/route')
    const res = await GET()
    const body = await res.json()
    const mu = body.holdings.find((h: { ticker?: string }) => h.ticker === 'MU')
    expect(mu).toBeDefined()
    expect(mu.geo).toBe('US')
    expect(mu.sector).toBe('Technology')
  })

  it('sanitizes holdings with outlier pnl values', async () => {
    seedPortfolioSnapshot('snap-1', [
      { name: 'MU', ticker: 'MU', market_value: 100, pnl: 99999 },
    ])
    const { GET } = await import('@/app/api/portfolio/route')
    const res = await GET()
    const body = await res.json()
    const mu = body.holdings.find((h: { ticker?: string }) => h.ticker === 'MU')
    expect(mu.pnl).toBeUndefined()
    expect(mu.pnl_pct).toBeUndefined()
  })
})

describe('POST /api/portfolio — HTML import', () => {
  it('returns 400 when html is missing', async () => {
    const { POST } = await import('@/app/api/portfolio/route')
    const res = await POST(req('/api/portfolio', 'POST', { snapshot_date: '2026-04-21' }))
    expect(res.status).toBe(400)
  })

  it('returns 422 when html has no parseable holdings', async () => {
    const { POST } = await import('@/app/api/portfolio/route')
    const res = await POST(req('/api/portfolio', 'POST', { html: '<html><body>nothing</body></html>' }))
    expect(res.status).toBe(422)
  })

  it('creates snapshot from valid HTML and returns holdings_count', async () => {
    const { POST } = await import('@/app/api/portfolio/route')
    const html = `<html><body>
      <table>
        <tr><th>Name</th><th>Market Value</th><th>P&amp;L</th></tr>
        <tr><td>MU US</td><td>2242.10</td><td>556.10</td></tr>
      </table>
    </body></html>`
    const res = await POST(req('/api/portfolio', 'POST', { html, snapshot_date: '2026-04-21' }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.holdings_count).toBeGreaterThan(0)
  })
})
