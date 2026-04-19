// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { initTestDb, clearTestDb, resetTestDb, req, seedPortfolioSnapshot } from '../helpers'

beforeAll(() => initTestDb())
afterAll(() => clearTestDb())
beforeEach(() => resetTestDb())

describe('GET /api/portfolio', () => {
  it('returns null when no snapshots exist', async () => {
    const { GET } = await import('@/app/api/portfolio/route')
    const res = await GET()
    const data = await res.json()
    expect(data).toBeNull()
  })

  it('returns latest snapshot with enriched geo/sector/currency on holdings', async () => {
    seedPortfolioSnapshot('snap1', [
      { name: 'Micron Technology', ticker: 'MU', market_value: 1600 },
    ])
    const { GET } = await import('@/app/api/portfolio/route')
    const res = await GET()
    const snap = await res.json()
    expect(snap).not.toBeNull()
    const mu = snap.holdings.find((h: { ticker?: string }) => h.ticker === 'MU')
    expect(mu?.geo).toBe('US')
    expect(mu?.sector).toBe('Technology')
    expect(mu?.currency).toBe('USD')
  })

  it('infers ticker from name when name is a known symbol (Syfe stores ticker in name col)', async () => {
    // Syfe HTML uses a "Stock" column header → matches `name` pattern, not `ticker`.
    // Holdings are stored with name="MU" and no ticker field. GET must infer the ticker.
    seedPortfolioSnapshot('snap1', [
      { name: 'MU', market_value: 1600 },
    ])
    const { GET } = await import('@/app/api/portfolio/route')
    const res = await GET()
    const snap = await res.json()
    const mu = snap.holdings.find((h: { ticker?: string }) => h.ticker === 'MU')
    expect(mu).toBeDefined()
    expect(mu?.geo).toBe('US')
    expect(mu?.sector).toBe('Technology')
    expect(mu?.currency).toBe('USD')
  })

  it('returns change_1d_pct when stored in holdings_json', async () => {
    seedPortfolioSnapshot('snap1', [
      { name: 'Micron Technology', ticker: 'MU', market_value: 1600, change_1d_pct: -2.5 },
    ])
    const { GET } = await import('@/app/api/portfolio/route')
    const res = await GET()
    const snap = await res.json()
    const mu = snap.holdings.find((h: { ticker?: string }) => h.ticker === 'MU')
    expect(mu?.change_1d_pct).toBeCloseTo(-2.5, 1)
  })
})

describe('POST /api/portfolio', () => {
  it('rejects empty body', async () => {
    const { POST } = await import('@/app/api/portfolio/route')
    const res = await POST(req('/api/portfolio', 'POST', { html: '' }))
    expect(res.status).toBe(400)
  })

  it('rejects HTML with no recognisable holdings table', async () => {
    const { POST } = await import('@/app/api/portfolio/route')
    const res = await POST(req('/api/portfolio', 'POST', { html: '<html><body>No tables</body></html>' }))
    expect(res.status).toBe(422)
  })

  it('parses holdings from HTML table and returns count', async () => {
    const html = `<table>
      <tr><th>Name</th><th>Value</th></tr>
      <tr><td>Micron Technology</td><td>1600.00</td></tr>
      <tr><td>AbbVie Inc.</td><td>640.00</td></tr>
    </table>`
    const { POST } = await import('@/app/api/portfolio/route')
    const res = await POST(req('/api/portfolio', 'POST', { html }))
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.holdings_count).toBe(2)
  })

  it('parses change_1d_pct from HTML with a 1D% column header', async () => {
    const html = `<table>
      <tr><th>Ticker</th><th>Value</th><th>1D %</th></tr>
      <tr><td>MU</td><td>1600.00</td><td>-2.50%</td></tr>
    </table>`
    const { POST, GET } = await import('@/app/api/portfolio/route')
    const postRes = await POST(req('/api/portfolio', 'POST', { html }))
    expect(postRes.status).toBe(201)

    const getRes = await GET()
    const snap = await getRes.json()
    const mu = snap.holdings.find((h: { ticker?: string }) => h.ticker === 'MU')
    expect(mu?.change_1d_pct).toBeCloseTo(-2.5, 1)
  })

  it('parses change_1d_pct from HTML with a "Daily Chg" column header', async () => {
    const html = `<table>
      <tr><th>Ticker</th><th>Value</th><th>Daily Chg</th></tr>
      <tr><td>ABBV</td><td>640.00</td><td>+1.20%</td></tr>
    </table>`
    const { POST, GET } = await import('@/app/api/portfolio/route')
    await POST(req('/api/portfolio', 'POST', { html }))

    const getRes = await GET()
    const snap = await getRes.json()
    const abbv = snap.holdings.find((h: { ticker?: string }) => h.ticker === 'ABBV')
    expect(abbv?.change_1d_pct).toBeCloseTo(1.2, 1)
  })

  it('stores snapshot with provided snapshot_date', async () => {
    const html = `<table>
      <tr><th>Name</th><th>Value</th></tr>
      <tr><td>Micron Technology</td><td>1600.00</td></tr>
    </table>`
    const { POST, GET } = await import('@/app/api/portfolio/route')
    await POST(req('/api/portfolio', 'POST', { html, snapshot_date: '2026-04-09T07:19:00.000Z' }))

    const getRes = await GET()
    const snap = await getRes.json()
    expect(snap.snapshot_date).toBe('2026-04-09T07:19:00.000Z')
  })
})
