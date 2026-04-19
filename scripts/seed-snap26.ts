import { config } from 'dotenv'
config({ path: new URL('../.env.local', import.meta.url).pathname })
import { db } from '../lib/db'
import type { Holding } from '../lib/types'

const SNAPSHOT_DATE = '2026-04-18T09:00:00.000+08:00'

const raw: Array<{
  ticker: string
  name: string
  geo: 'US' | 'SG' | 'UK' | 'HK'
  sector: string
  currency: string
  price: number
  change1d: number
  value: number
  pnl: number | null
  qty: number
  avgCost: number | null
}> = [
  { ticker: 'MU',   name: 'Micron Technology',            geo: 'US', sector: 'Technology',       currency: 'USD', price: 455.07, change1d: -0.47, value: 2275.35, pnl:  589.35, qty:  5,      avgCost: 337.20 },
  { ticker: 'MOO',  name: 'VanEck Agribusiness ETF',       geo: 'US', sector: 'Agriculture ETF',  currency: 'USD', price:  83.28, change1d: -0.62, value: 1165.92, pnl:  -24.41, qty: 14,      avgCost:  85.02 },
  { ticker: 'VCX',  name: 'Virtus Private Credit ETF',     geo: 'US', sector: 'Private Fund',     currency: 'USD', price:  84.47, change1d:  9.87, value:  929.17, pnl: -156.63, qty: 11,      avgCost:  98.71 },
  { ticker: 'BUD',  name: 'Anheuser-Busch InBev',          geo: 'US', sector: 'Consumer Staples', currency: 'USD', price:  75.76, change1d:  0.46, value:  757.60, pnl:    0.67, qty: 10,      avgCost:  75.69 },
  { ticker: 'SLB',  name: 'SLB (Schlumberger)',            geo: 'US', sector: 'Energy',           currency: 'USD', price:  52.66, change1d:  1.80, value:  737.24, pnl:   17.48, qty: 14,      avgCost:  51.41 },
  { ticker: 'Z74',  name: 'Singtel',                       geo: 'SG', sector: 'Telecommunications',currency: 'SGD', price:   4.81, change1d: -0.41, value:  962.00, pnl:  -25.00, qty: 200,     avgCost:   4.935 },
  { ticker: 'ABBV', name: 'AbbVie Inc.',                   geo: 'US', sector: 'Healthcare',       currency: 'USD', price: 208.38, change1d: -0.29, value:  625.14, pnl:  -14.46, qty:  3,      avgCost: 213.20 },
  { ticker: 'ULVR', name: 'Unilever PLC',                  geo: 'UK', sector: 'Consumer Staples', currency: 'GBP', price:  42.99, change1d:  2.07, value:  429.90, pnl:   -2.60, qty: 10,      avgCost: null },
  { ticker: 'PM',   name: 'Philip Morris International',   geo: 'US', sector: 'Consumer Staples', currency: 'USD', price: 157.79, change1d:  0.99, value:  473.37, pnl:   -1.70, qty:  3,      avgCost: null },
  { ticker: 'NVDA', name: 'NVIDIA Corporation',            geo: 'US', sector: 'Technology',       currency: 'USD', price: 201.68, change1d:  1.68, value:  403.36, pnl:   11.17, qty:  2,      avgCost: 196.10 },
  { ticker: 'MNST', name: 'Monster Beverage Corporation',  geo: 'US', sector: 'Consumer Staples', currency: 'USD', price:  76.72, change1d:  1.80, value:  383.60, pnl:    3.90, qty:  5,      avgCost: null },
  { ticker: 'AGIX', name: 'KraneShares AI ETF',            geo: 'US', sector: 'ETF',              currency: 'USD', price:  38.32, change1d:  1.30, value:  383.20, pnl:   52.70, qty: 10,      avgCost:  33.05 },
  { ticker: 'KO',   name: 'Coca-Cola Company',             geo: 'US', sector: 'Consumer Staples', currency: 'USD', price:  75.74, change1d:  0.74, value:  379.71, pnl:   -8.79, qty:  5.0133, avgCost:  77.50 },
  { ticker: 'D05',  name: 'DBS Group Holdings',            geo: 'SG', sector: 'Financials',       currency: 'SGD', price:  57.25, change1d: -0.09, value:  286.25, pnl:    0.40, qty:  5,      avgCost:  57.17 },
  { ticker: 'CMCL', name: 'Caledonia Mining',              geo: 'US', sector: 'Metals',           currency: 'USD', price:  26.19, change1d:  2.83, value:  261.90, pnl:   42.98, qty: 10,      avgCost:  21.89 },
  { ticker: 'DD',   name: 'DuPont de Nemours',             geo: 'US', sector: 'Materials',        currency: 'USD', price:  47.35, change1d:  1.28, value:  236.75, pnl:   -1.58, qty:  5,      avgCost:  47.67 },
  { ticker: 'TEAM', name: 'Atlassian Corporation',         geo: 'US', sector: 'Software',         currency: 'USD', price:  66.94, change1d: -2.60, value:  200.82, pnl:   -6.45, qty:  3,      avgCost:  69.09 },
  { ticker: 'WISE', name: 'Wise PLC',                      geo: 'UK', sector: 'Financials',       currency: 'GBP', price:  10.90, change1d:  0.41, value:  109.05, pnl:   19.55, qty: 10,      avgCost:   8.95 },
  { ticker: 'FXI',  name: 'iShares China Large-Cap ETF',   geo: 'HK', sector: 'ETF',              currency: 'USD', price:  37.60, change1d:  0.99, value:  107.53, pnl:    7.53, qty:  2.8597, avgCost:  34.97 },
  { ticker: 'ICLN', name: 'iShares Global Clean Energy ETF',geo:'US', sector: 'ETF',              currency: 'USD', price:  19.40, change1d:  0.26, value:   97.00, pnl:    5.87, qty:  5,      avgCost:  18.23 },
]

async function seed() {
  const existing = await db.execute({
    sql: `SELECT id FROM portfolio_snapshots WHERE snapshot_date = ?`,
    args: [SNAPSHOT_DATE],
  })
  if (existing.rows.length > 0) {
    console.log(`Snap 26 already exists (id=${existing.rows[0].id}). Nothing to do.`)
    process.exit(0)
  }

  const total_value = raw.reduce((s, h) => s + h.value, 0)

  const holdings: Holding[] = raw.map(h => {
    const holding: Holding = {
      name:          h.name,
      ticker:        h.ticker,
      units:         h.qty,
      current_price: h.price,
      market_value:  h.value,
      change_1d_pct: h.change1d,
      allocation_pct: (h.value / total_value) * 100,
      geo:           h.geo,
      sector:        h.sector,
      currency:      h.currency,
    }
    if (h.avgCost !== null) holding.avg_cost = h.avgCost
    if (h.pnl !== null) {
      holding.pnl = h.pnl
      const costBasis = h.value - h.pnl
      if (costBasis > 0) holding.pnl_pct = (h.pnl / costBasis) * 100
    }
    return holding
  })

  const pnlValues = holdings.filter(h => h.pnl !== undefined).map(h => h.pnl!)
  const total_pnl = pnlValues.reduce((s, v) => s + v, 0)

  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  await db.execute({
    sql: `INSERT INTO portfolio_snapshots (id, snapshot_date, total_value, total_pnl, holdings_json, raw_html, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [id, SNAPSHOT_DATE, total_value, total_pnl, JSON.stringify(holdings), '', now],
  })

  console.log(`Snap 26 seeded.`)
  console.log(`  id:          ${id}`)
  console.log(`  snapshot_date: ${SNAPSHOT_DATE}`)
  console.log(`  total_value:   ${total_value.toFixed(2)} (naive sum, mixed currencies)`)
  console.log(`  total_pnl:     ${total_pnl.toFixed(2)}`)
  console.log(`  holdings:      ${holdings.length}`)
  process.exit(0)
}

seed().catch(err => {
  console.error('Seed failed:', err)
  process.exit(1)
})
