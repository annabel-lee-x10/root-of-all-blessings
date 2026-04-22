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

describe('BUG-036: pnl extracted from HTML-entity-encoded URZ P&L column', () => {
  // The skill generates: <th>URZ P&amp;L</th> (HTML-encoded ampersand).
  // stripTags() must decode &amp; → & so the pnl regex can match "URZ P&L".
  const SKILL_HTML = `<table class="holdings">
    <thead><tr><th>Ticker</th><th>Price</th><th>1D %</th><th>Value</th><th>URZ P&amp;L</th><th>Qty</th><th>Weight</th></tr></thead>
    <tbody>
      <tr><td><strong>MU</strong> <span>US</span></td><td class="mono">$449.38</td><td class="mono">+0.21%</td><td class="mono">$2,246.90</td><td class="mono" style="color:#3DD68C">+$560.90</td><td class="mono">5</td><td>15.64%</td></tr>
      <tr><td><strong>ABBV</strong> <span>US</span></td><td class="mono">$205.12</td><td class="mono">+0.69%</td><td class="mono">$615.36</td><td class="mono" style="color:#FF5A5A">-$24.24</td><td class="mono">3</td><td>4.28%</td></tr>
    </tbody>
  </table>`

  it('extracts pnl from HTML-entity-encoded URZ P&L column header', async () => {
    const { POST } = await import('@/app/api/portfolio/route')
    const { GET } = await import('@/app/api/portfolio/snapshots/route')

    const postRes = await POST(req('/api/portfolio', 'POST', { html: SKILL_HTML }))
    expect(postRes.status).toBe(201)

    const snap = await (await GET()).json()
    const mu = snap?.holdings?.find((h: { ticker?: string }) => h.ticker === 'MU')
    // Fails before fix: URZ P&amp;L header not matched → pnl = undefined/null
    expect(mu?.pnl).toBeCloseTo(560.90)
  })

  it('extracts negative pnl correctly from skill HTML', async () => {
    const { POST } = await import('@/app/api/portfolio/route')
    const { GET } = await import('@/app/api/portfolio/snapshots/route')

    await POST(req('/api/portfolio', 'POST', { html: SKILL_HTML }))

    const snap = await (await GET()).json()
    const abbv = snap?.holdings?.find((h: { ticker?: string }) => h.ticker === 'ABBV')
    expect(abbv?.pnl).toBeCloseTo(-24.24)
  })

  it('computes total unrealised_pnl from holdings pnl values', async () => {
    const { POST } = await import('@/app/api/portfolio/route')
    const { GET } = await import('@/app/api/portfolio/snapshots/route')

    await POST(req('/api/portfolio', 'POST', { html: SKILL_HTML }))

    const snap = await (await GET()).json()
    // unrealised_pnl = sum of holdings pnl = 560.90 + (-24.24) = 536.66
    // Fails before fix: pnl is null for all holdings → unrealised_pnl = null
    expect(snap?.unrealised_pnl).toBeCloseTo(536.66)
  })
})

describe('BUG-037: HTML upload uses summary JSON block for exact financial values', () => {
  // The skill embeds <script type="application/json" id="portfolio-summary"> in its HTML.
  // parseSummary() must extract these values so total_value, unrealised_pnl, realised_pnl,
  // cash, and pending match the skill's output exactly — not computed/carried-forward approximations.
  const SUMMARY_HTML = `
    <script type="application/json" id="portfolio-summary">
    {"total_value":14369.02,"unrealised_pnl":411.38,"realised_pnl":469.50,"cash":224.63,"pending":6.34}
    </script>
    <table class="holdings">
      <thead><tr><th>Ticker</th><th>Price</th><th>1D %</th><th>Value</th><th>URZ P&amp;L</th><th>Qty</th><th>Weight</th></tr></thead>
      <tbody>
        <tr><td><strong>MU</strong> <span>US</span></td><td class="mono">$449.38</td><td class="mono">+0.21%</td><td class="mono">$2,246.90</td><td class="mono">+$560.90</td><td class="mono">5</td><td>15.64%</td></tr>
        <tr><td><strong>ABBV</strong> <span>US</span></td><td class="mono">$205.12</td><td class="mono">+0.69%</td><td class="mono">$615.36</td><td class="mono">-$24.24</td><td class="mono">3</td><td>4.28%</td></tr>
      </tbody>
    </table>`

  it('uses summary block total_value instead of computed holdings sum', async () => {
    const { POST } = await import('@/app/api/portfolio/route')
    const { GET } = await import('@/app/api/portfolio/snapshots/route')

    await POST(req('/api/portfolio', 'POST', { html: SUMMARY_HTML }))
    const snap = await (await GET()).json()
    // Holdings sum = 2246.90 + 615.36 = 2862.26. Summary says 14369.02 — must use summary.
    // Fails before fix: total_value = 2862.26 (computed from equity only)
    expect(snap?.total_value).toBeCloseTo(14369.02)
  })

  it('uses summary block unrealised_pnl exactly (not recomputed from holdings)', async () => {
    const { POST } = await import('@/app/api/portfolio/route')
    const { GET } = await import('@/app/api/portfolio/snapshots/route')

    await POST(req('/api/portfolio', 'POST', { html: SUMMARY_HTML }))
    const snap = await (await GET()).json()
    // Holdings pnl sum = 560.90 - 24.24 = 536.66. Summary says 411.38 — must use summary.
    // Fails before fix: unrealised_pnl = 536.66 (summed from holdings without FX)
    expect(snap?.unrealised_pnl).toBeCloseTo(411.38)
  })

  it('uses summary block realised_pnl (not carried forward from prev snapshot)', async () => {
    const { POST: postOld } = await import('@/app/api/portfolio/route')
    const { POST: postV2, GET } = await import('@/app/api/portfolio/snapshots/route')

    // Seed a previous v2 snapshot with stale values
    await postV2(req('/api/portfolio/snapshots', 'POST', {
      snap_label: 'Snap 27', total_value: 11656.18,
      realised_pnl: 430.88, cash: 87.45,
      snapshot_date: '2026-04-21T05:34:00.000Z',
      holdings: [],
    }))

    // Upload HTML with summary block that has updated realised/cash values
    await postOld(req('/api/portfolio', 'POST', { html: SUMMARY_HTML }))

    const snap = await (await GET()).json()
    // Fails before fix: carries forward 430.88 from Snap 27 instead of using summary 469.50
    expect(snap?.realised_pnl).toBeCloseTo(469.50)
    expect(snap?.cash).toBeCloseTo(224.63)
    expect(snap?.pending).toBeCloseTo(6.34)
  })

  it('explicit caller values still override summary block values', async () => {
    const { POST } = await import('@/app/api/portfolio/route')
    const { GET } = await import('@/app/api/portfolio/snapshots/route')

    await POST(req('/api/portfolio', 'POST', { html: SUMMARY_HTML, realised_pnl: 999.00, cash: 100.00 }))
    const snap = await (await GET()).json()
    expect(snap?.realised_pnl).toBeCloseTo(999.00)
    expect(snap?.cash).toBeCloseTo(100.00)
  })
})

describe('BUG-035: HTML upload carries forward financial context from previous v2 snapshot', () => {
  it('carries forward realised_pnl, cash, net_invested when absent from HTML upload', async () => {
    const { POST: postOld } = await import('@/app/api/portfolio/route')
    const { POST: postV2, GET } = await import('@/app/api/portfolio/snapshots/route')

    // Seed a previous v2 snapshot with known financial context
    await postV2(req('/api/portfolio/snapshots', 'POST', {
      snap_label: 'Snap 27', total_value: 11656.18,
      realised_pnl: 430.88, cash: 87.45, net_invested: 11569.76,
      net_deposited: 11222.32, dividends: 4.77,
      snapshot_date: '2026-04-21T05:34:00.000Z',
      holdings: [],
    }))

    // Upload new HTML with no financial context provided
    await postOld(req('/api/portfolio', 'POST', { html: VALID_HTML }))

    const snap = await (await GET()).json()
    // Fails before fix: realised_pnl=0, cash=0, net_invested=null (defaulted from nullish)
    expect(snap?.realised_pnl).toBeCloseTo(430.88)
    expect(snap?.cash).toBeCloseTo(87.45)
    expect(snap?.net_invested).toBeCloseTo(11569.76)
  })

  it('sets prior_* from the previous snapshot so vs-prev comparisons work', async () => {
    const { POST: postOld } = await import('@/app/api/portfolio/route')
    const { POST: postV2, GET } = await import('@/app/api/portfolio/snapshots/route')

    await postV2(req('/api/portfolio/snapshots', 'POST', {
      snap_label: 'Snap 27', total_value: 11656.18,
      realised_pnl: 430.88, cash: 87.45,
      snapshot_date: '2026-04-21T05:34:00.000Z',
      holdings: [],
    }))

    await postOld(req('/api/portfolio', 'POST', { html: VALID_HTML }))

    const snap = await (await GET()).json()
    // prior_value should be the previous snapshot's total_value
    expect(snap?.prior_value).toBeCloseTo(11656.18)
    // prior_cash should be the previous snapshot's cash
    expect(snap?.prior_cash).toBeCloseTo(87.45)
  })

  it('does not overwrite financial context when caller provides it explicitly', async () => {
    const { POST: postOld } = await import('@/app/api/portfolio/route')
    const { POST: postV2, GET } = await import('@/app/api/portfolio/snapshots/route')

    await postV2(req('/api/portfolio/snapshots', 'POST', {
      snap_label: 'Snap 27', total_value: 11656.18,
      realised_pnl: 430.88, cash: 87.45,
      snapshot_date: '2026-04-21T05:34:00.000Z',
      holdings: [],
    }))

    // Caller explicitly provides different values
    await postOld(req('/api/portfolio', 'POST', {
      html: VALID_HTML, realised_pnl: 999.00, cash: 200.00,
    }))

    const snap = await (await GET()).json()
    // Explicit values win over carry-forward
    expect(snap?.realised_pnl).toBeCloseTo(999.00)
    expect(snap?.cash).toBeCloseTo(200.00)
  })
})
