// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { generateHtmlReport } from '@/lib/portfolio/report-generator'
import type { SnapData, SnapSummary } from '@/lib/portfolio/report-generator'

const SNAP: SnapData = {
  id: 's1',
  snapshot_date: '2026-04-23T00:00:00.000Z',
  snap_label: 'Snap 29',
  snap_time: '04:34 SGT',
  total_value: 15000,
  unrealised_pnl: 500,
  realised_pnl: 480,
  cash: 40,
  pending: 6,
  net_deposited: 511,
  holdings: [
    {
      ticker: 'MU', name: 'Micron Technology', geo: 'US', sector: 'Technology',
      currency: 'USD', price: 487, change_1d: 8.48, value: 2437, pnl: 751, qty: 5,
      sell_limit: 500, buy_limit: null,
    },
    {
      ticker: 'V', name: 'Visa Inc', geo: 'US', sector: 'Financials',
      currency: 'USD', price: 311, change_1d: 0.44, value: 2179, pnl: -4, qty: 7,
      sell_limit: 321, buy_limit: null,
    },
    {
      ticker: 'KO', name: 'Coca-Cola', geo: 'US', sector: 'Consumer Staples',
      currency: 'USD', price: 74, change_1d: -0.09, value: 374, pnl: -14, qty: 5,
      sell_limit: null, buy_limit: null,
    },
  ],
  orders: [
    {
      ticker: 'MU', type: 'SELL LIMIT', price: 500, qty: 5, currency: 'USD',
      placed: '04:58 SGT 23 Apr', note: '2.6% away', new_flag: 1, snapshot_id: 's1',
    },
    {
      ticker: 'KO', type: 'SELL LIMIT', price: 79, qty: 5, currency: 'USD',
      placed: '22:42 SGT 16 Apr', note: '6.1% away', new_flag: 0, snapshot_id: 's1',
    },
  ],
  realised: [
    { key: 'QQQ', value: 20.50 },
    { key: 'AAPL', value: -11.03 },
  ],
  growth: [],
}

const PREV_SNAP: SnapData = {
  ...SNAP,
  id: 's0',
  snap_label: 'Snap 28',
  total_value: 14369,
  unrealised_pnl: 411,
  cash: 224,
  net_deposited: null,
  holdings: [
    {
      ticker: 'MU', name: 'Micron Technology', geo: 'US', sector: 'Technology',
      currency: 'USD', price: 449, change_1d: 0, value: 2248, pnl: 560, qty: 5,
      sell_limit: null, buy_limit: null,
    },
  ],
  orders: [],
  realised: [],
  growth: [],
}

const ALL_SNAPS: SnapSummary[] = [
  { id: 'sx', snap_label: 'Snap 27', snapshot_date: '2026-04-21T00:00:00.000Z' },
  { id: 's0', snap_label: 'Snap 28', snapshot_date: '2026-04-22T00:00:00.000Z' },
  { id: 's1', snap_label: 'Snap 29', snapshot_date: '2026-04-23T00:00:00.000Z' },
]

describe('generateHtmlReport', () => {
  it('returns a valid HTML document', () => {
    const html = generateHtmlReport(SNAP, null, ALL_SNAPS)
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('</html>')
  })

  it('includes the snap label in the masthead', () => {
    const html = generateHtmlReport(SNAP, null, ALL_SNAPS)
    expect(html).toContain('Snap 29')
  })

  it('renders all holdings as table rows', () => {
    const html = generateHtmlReport(SNAP, null, ALL_SNAPS)
    expect(html).toContain('<strong>MU</strong>')
    expect(html).toContain('<strong>V</strong>')
    expect(html).toContain('<strong>KO</strong>')
  })

  it('renders allocation bar segments for each holding', () => {
    const html = generateHtmlReport(SNAP, null, ALL_SNAPS)
    expect(html).toContain('class="alloc-seg"')
    expect(html).toContain('MU')
    expect(html).toContain('V ·')
  })

  it('renders realised chips with correct gain/loss classes', () => {
    const html = generateHtmlReport(SNAP, null, ALL_SNAPS)
    expect(html).toContain('class="r-chip gain"')
    expect(html).toContain('QQQ')
    expect(html).toContain('class="r-chip loss"')
    expect(html).toContain('AAPL')
  })

  it('renders pills for all snapshots with current one marked active', () => {
    const html = generateHtmlReport(SNAP, null, ALL_SNAPS)
    expect(html).toContain('class="pill active"')
    expect(html).toContain('Snap 27')
    expect(html).toContain('Snap 28')
  })

  it('renders delta section when prevSnap provided', () => {
    const html = generateHtmlReport(SNAP, PREV_SNAP, ALL_SNAPS)
    expect(html).toContain('Delta vs Snap 28')
  })

  it('omits delta section when no prevSnap', () => {
    const html = generateHtmlReport(SNAP, null, ALL_SNAPS)
    expect(html).not.toContain('Delta vs')
  })

  it('separates post-snap and at-snap orders in the orders table', () => {
    const html = generateHtmlReport(SNAP, null, ALL_SNAPS)
    expect(html).toContain('POST-SNAP')
    expect(html).toContain('AT SNAP')
  })

  it('omits orders section when there are no orders', () => {
    const html = generateHtmlReport({ ...SNAP, orders: [] }, null, ALL_SNAPS)
    expect(html).not.toContain('Open Orders')
  })

  it('omits realised section when there is no realised data', () => {
    const html = generateHtmlReport({ ...SNAP, realised: [] }, null, ALL_SNAPS)
    expect(html).not.toContain('Realised P&amp;L')
  })

  it('embeds machine-readable JSON block with correct snapshot_id', () => {
    const html = generateHtmlReport(SNAP, null, ALL_SNAPS)
    expect(html).toContain('id="portfolio-data"')
    const match = html.match(/<script type="application\/json" id="portfolio-data">([\s\S]*?)<\/script>/)
    expect(match).not.toBeNull()
    const parsed = JSON.parse(match![1])
    expect(parsed.snapshot_id).toBe('s1')
    expect(parsed.total_value).toBe(15000)
  })

  it('auto-generates key observations for top movers', () => {
    const html = generateHtmlReport(SNAP, null, ALL_SNAPS)
    expect(html).toContain('Key Observations')
    // MU has highest |change_1d| (+8.48%)
    expect(html).toContain('MU')
  })

  it('auto-generates risk flags for holdings without sell orders', () => {
    const html = generateHtmlReport(SNAP, null, ALL_SNAPS)
    // KO has no sell_limit and no sell order
    expect(html).toContain('Risk Flags')
    expect(html).toContain('KO')
  })

  it('uses exact CSS variables from SAMPLE_REPORT.html', () => {
    const html = generateHtmlReport(SNAP, null, ALL_SNAPS)
    expect(html).toContain('--bg:#0E1117')
    expect(html).toContain('--orange:#E8520A')
    expect(html).toContain("'Sora'")
    expect(html).toContain("'DM Mono'")
  })

  it('renders summary stats 5-grid', () => {
    const html = generateHtmlReport(SNAP, null, ALL_SNAPS)
    expect(html).toContain('Total Value')
    expect(html).toContain('Unrealised P')
    expect(html).toContain('Realised P')
    expect(html).toContain('Cash')
    expect(html).toContain('Gainers')
  })

  it('renders geo badge for each holding', () => {
    const html = generateHtmlReport(SNAP, null, ALL_SNAPS)
    expect(html).toContain('class="geo-badge"')
    expect(html).toContain('>US<')
  })

  it('renders weight bar for each holding', () => {
    const html = generateHtmlReport(SNAP, null, ALL_SNAPS)
    expect(html).toContain('class="weight-bar"')
    expect(html).toContain('class="weight-fill"')
  })

  it('includes Google Fonts link for Sora and DM Mono', () => {
    const html = generateHtmlReport(SNAP, null, ALL_SNAPS)
    expect(html).toContain('fonts.googleapis.com')
    expect(html).toContain('DM+Mono')
    expect(html).toContain('Sora')
  })

  it('includes footer text', () => {
    const html = generateHtmlReport(SNAP, null, ALL_SNAPS)
    expect(html).toContain('<footer>')
    expect(html).toContain('not financial advice')
  })
})
