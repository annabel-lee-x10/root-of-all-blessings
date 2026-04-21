import { config } from 'dotenv'
config({ path: new URL('../.env.local', import.meta.url).pathname })
import { createClient } from '@libsql/client'

// Inline client so dotenv is loaded before any db import
const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
})

// ── Snap 27 data (sourced from portfolio_dashboard_snap27.jsx) ────────────────

const SNAPSHOT_ID = 'snap27-seed-2026-04-21'

const PORTFOLIO = {
  totalValue: 12165.28, cash: 87.45, pending: 508.07, netInvested: 11569.76,
  unrealisedPnL: 593.25, realisedPnL: 430.88, netDeposited: 11222.32, dividends: 4.77,
  snapTime: '05:34 SGT Tue 21 Apr 2026', snapLabel: 'Snap 27',
  priorValue: 12013.65, priorUnrealised: 521.11, priorRealised: 357.36,
  priorCash: 889.14, priorHoldings: 20,
}

const HOLDINGS = [
  { ticker: 'MU',   name: 'Micron Technology',        geo: 'US', sector: 'Technology',       currency: 'USD', market_value: 2242.10, pnl: 556.10,  units: 5,       avg_cost: 337.20,  current_price: 448.42, change_1d_pct: -1.46, target: 500,    sell_limit: null,  buy_limit: null,  is_new: false, approx: false, note: '89.7% to $500 target. No sell limit (deliberate).' },
  { ticker: 'V',    name: 'Visa Inc',                  geo: 'US', sector: 'Financials',       currency: 'USD', market_value: 1255.76, pnl: 5.88,    units: 4,       avg_cost: 312.47,  current_price: 313.94, change_1d_pct: -0.97, target: null,   sell_limit: null,  buy_limit: 312.42, is_new: true,  approx: false, note: 'NEW position · market buy 02:56 SGT 21 Apr. BUY LIMIT $312.42 × 1 pending.' },
  { ticker: 'MOO',  name: 'VanEck Agribusiness ETF',   geo: 'US', sector: 'Agriculture ETF',  currency: 'USD', market_value: 1172.92, pnl: -17.41,  units: 14,      avg_cost: 85.02,   current_price: 83.78,  change_1d_pct:  0.60, target: null,   sell_limit: null,  buy_limit: null,  is_new: false, approx: true,  note: 'Conviction hold · avg ~APPROX' },
  { ticker: 'Z74',  name: 'Singtel',                   geo: 'SG', sector: 'Telecommunications', currency: 'SGD', market_value: 968.00, pnl: -19.00, units: 200,     avg_cost: 4.935,   current_price: 4.840,  change_1d_pct:  0.62, target: null,   sell_limit: 5.170, buy_limit: null,  is_new: false, approx: true,  note: 'SELL LIMIT S$5.170 active' },
  { ticker: 'BUD',  name: 'Anheuser-Busch InBev',      geo: 'US', sector: 'Consumer Staples', currency: 'USD', market_value: 750.50,  pnl: -6.43,   units: 10,      avg_cost: 75.69,   current_price: 75.05,  change_1d_pct: -0.94, target: null,   sell_limit: 77.50, buy_limit: null,  is_new: false, approx: true,  note: 'SELL LIMIT $77.50 · 3.3% away' },
  { ticker: 'SLB',  name: 'SLB (Schlumberger)',        geo: 'US', sector: 'Energy',           currency: 'USD', market_value: 730.80,  pnl: 11.04,   units: 14,      avg_cost: 51.41,   current_price: 52.20,  change_1d_pct: -0.87, target: null,   sell_limit: 53.67, buy_limit: null,  is_new: false, approx: true,  note: 'SELL LIMIT $53.67 · 2.8% away' },
  { ticker: 'ABBV', name: 'AbbVie Inc',                geo: 'US', sector: 'Healthcare',       currency: 'USD', market_value: 611.13,  pnl: -28.47,  units: 3,       avg_cost: 213.20,  current_price: 203.71, change_1d_pct: -2.24, target: null,   sell_limit: 218,   buy_limit: null,  is_new: false, approx: true,  note: 'Sell limit $218 ASSUMED active. Earnings 29 Apr.', dividend: { amount: 1.73, date: '15 May 2026' } },
  { ticker: 'NFLX', name: 'Netflix Inc',               geo: 'US', sector: 'Media',            currency: 'USD', market_value: 474.15,  pnl: 1.05,    units: 5,       avg_cost: 94.62,   current_price: 94.83,  change_1d_pct: -2.55, target: null,   sell_limit: 105,   buy_limit: 94.65, is_new: true,  approx: false, note: 'NEW · both-ends set: BUY LIMIT $94.65 × 2 + SELL LIMIT $105 × 5' },
  { ticker: 'PM',   name: 'Philip Morris',             geo: 'US', sector: 'Consumer Staples', currency: 'USD', market_value: 472.65,  pnl: -2.42,   units: 3,       avg_cost: null,    current_price: 157.55, change_1d_pct: -0.15, target: null,   sell_limit: 162,   buy_limit: null,  is_new: false, approx: false, note: 'SELL LIMIT $162' },
  { ticker: 'RING', name: 'iShares Gold Miners ETF',   geo: 'US', sector: 'Metals',           currency: 'USD', market_value: 428.85,  pnl: -0.38,   units: 5,       avg_cost: 85.85,   current_price: 85.77,  change_1d_pct: -1.15, target: null,   sell_limit: 99.50, buy_limit: null,  is_new: true,  approx: false, note: 'RE-ENTRY · prior sold $87.50 on 18 Apr. SELL LIMIT $99.50 × 5' },
  { ticker: 'ULVR', name: 'Unilever PLC',              geo: 'UK', sector: 'Consumer Staples', currency: 'GBP', market_value: 426.90,  pnl: -5.60,   units: 10,      avg_cost: null,    current_price: 42.69,  change_1d_pct: -0.70, target: null,   sell_limit: 45,    buy_limit: null,  is_new: false, approx: true,  note: 'SELL LIMIT £45 · qty 10 flag unresolved' },
  { ticker: 'NVDA', name: 'NVIDIA Corp',               geo: 'US', sector: 'Technology',       currency: 'USD', market_value: 404.12,  pnl: 11.93,   units: 2,       avg_cost: 196.10,  current_price: 202.06, change_1d_pct:  0.19, target: null,   sell_limit: 220,   buy_limit: null,  is_new: false, approx: true,  note: 'SELL LIMIT $220 × 2 placed 03:02 SGT 21 Apr' },
  { ticker: 'AGIX', name: 'KraneShares AI ETF',        geo: 'US', sector: 'ETF',              currency: 'USD', market_value: 388.30,  pnl: 57.80,   units: 10,      avg_cost: 33.05,   current_price: 38.83,  change_1d_pct:  1.33, target: null,   sell_limit: null,  buy_limit: null,  is_new: false, approx: false, note: 'Anthropic IPO thesis · deliberate hold to Q4 2026' },
  { ticker: 'KO',   name: 'Coca-Cola',                 geo: 'US', sector: 'Consumer Staples', currency: 'USD', market_value: 378.41,  pnl: -10.09,  units: 5.0133,  avg_cost: 77.50,   current_price: 75.48,  change_1d_pct: -0.34, target: null,   sell_limit: 78.25, buy_limit: null,  is_new: false, approx: true,  note: 'SELL LIMIT $78.25 ASSUMED active' },
  { ticker: 'D05',  name: 'DBS Group Holdings',        geo: 'SG', sector: 'Financials',       currency: 'SGD', market_value: 286.20,  pnl: 0.35,    units: 5,       avg_cost: 57.17,   current_price: 57.24,  change_1d_pct: -0.02, target: null,   sell_limit: null,  buy_limit: null,  is_new: false, approx: false, note: 'Long-term SGX hold' },
  { ticker: 'DD',   name: 'DuPont de Nemours',         geo: 'US', sector: 'Materials',        currency: 'USD', market_value: 235.00,  pnl: -3.33,   units: 5,       avg_cost: 47.67,   current_price: 47.00,  change_1d_pct: -0.74, target: null,   sell_limit: 50,    buy_limit: null,  is_new: false, approx: false, note: 'SELL LIMIT $50 · 6.4% away' },
  { ticker: 'TEAM', name: 'Atlassian Corp',            geo: 'US', sector: 'Software',         currency: 'USD', market_value: 214.44,  pnl: 7.17,    units: 3,       avg_cost: 69.09,   current_price: 71.48,  change_1d_pct:  6.78, target: null,   sell_limit: null,  buy_limit: null,  is_new: false, approx: true,  note: '+6.78% today · largest daily gainer · no sell limit' },
  { ticker: 'WISE', name: 'Wise PLC',                  geo: 'UK', sector: 'Financials',       currency: 'GBP', market_value: 108.25,  pnl: 18.75,   units: 10,      avg_cost: 8.95,    current_price: 10.82,  change_1d_pct: -0.73, target: null,   sell_limit: 11.28, buy_limit: null,  is_new: false, approx: true,  note: 'SELL LIMIT £11.28 ASSUMED active' },
  { ticker: 'FXI',  name: 'iShares China Large-Cap',   geo: 'HK', sector: 'ETF',              currency: 'USD', market_value: 107.70,  pnl: 7.70,    units: 2.8597,  avg_cost: 34.97,   current_price: 37.66,  change_1d_pct:  0.16, target: null,   sell_limit: null,  buy_limit: null,  is_new: false, approx: false, note: 'China hedge' },
]

// Compute allocation_pct
const totalValue = HOLDINGS.reduce((s, h) => s + h.market_value, 0)
const FX: Record<string, number> = { USD: 1, SGD: 0.74, GBP: 1.29 }
const holdingsWithAlloc = HOLDINGS.map(h => {
  const valueUSD = h.market_value * (FX[h.currency] ?? 1)
  const pnl_pct = h.pnl !== null && h.pnl !== undefined
    ? (h.pnl / (h.market_value - h.pnl)) * 100
    : undefined
  return {
    ...h,
    allocation_pct: (h.market_value / totalValue) * 100,
    pnl_pct,
    value_usd: valueUSD,
  }
})

const OPEN_ORDERS = [
  { ticker: 'NFLX', geo: 'US', type: 'BUY LIMIT',  price: 94.65,  qty: 2,   currency: 'USD', placed: '03:22 SGT 21 Apr', current_price: 94.83,  note: 'NEW · below market · conviction add',            new_flag: 1 },
  { ticker: 'V',    geo: 'US', type: 'BUY LIMIT',  price: 312.42, qty: 1,   currency: 'USD', placed: '03:07 SGT 21 Apr', current_price: 313.94, note: 'NEW · below market · double-down',               new_flag: 1 },
  { ticker: 'NVDA', geo: 'US', type: 'SELL LIMIT', price: 220,    qty: 2,   currency: 'USD', placed: '03:02 SGT 21 Apr', current_price: 202.06, note: 'NEW · 8.9% away · rationale undocumented',       new_flag: 1 },
  { ticker: 'RING', geo: 'US', type: 'SELL LIMIT', price: 99.50,  qty: 5,   currency: 'USD', placed: '03:00 SGT 21 Apr', current_price: 85.77,  note: 'NEW · 16.0% away · on re-entry position',        new_flag: 1 },
  { ticker: 'NFLX', geo: 'US', type: 'SELL LIMIT', price: 105,    qty: 5,   currency: 'USD', placed: '03:00 SGT 21 Apr', current_price: 94.83,  note: 'NEW · 10.7% away · on new position',             new_flag: 1 },
  { ticker: 'ULVR', geo: 'UK', type: 'SELL LIMIT', price: 45,     qty: 10,  currency: 'GBP', placed: '22:45 SGT 16 Apr', current_price: 42.69,  note: '5.4% away',                                      new_flag: 0 },
  { ticker: 'BUD',  geo: 'US', type: 'SELL LIMIT', price: 77.50,  qty: 10,  currency: 'USD', placed: '22:42 SGT 16 Apr', current_price: 75.05,  note: '3.3% away',                                      new_flag: 0 },
  { ticker: 'SLB',  geo: 'US', type: 'SELL LIMIT', price: 53.67,  qty: 14,  currency: 'USD', placed: '22:54 SGT 15 Apr', current_price: 52.20,  note: '2.8% away',                                      new_flag: 0 },
  { ticker: 'PM',   geo: 'US', type: 'SELL LIMIT', price: 162,    qty: 3,   currency: 'USD', placed: '23:48 SGT 14 Apr', current_price: 157.55, note: '2.8% away',                                      new_flag: 0 },
  { ticker: 'Z74',  geo: 'SG', type: 'SELL LIMIT', price: 5.170,  qty: 200, currency: 'SGD', placed: '04:34 SGT 14 Apr', current_price: 4.840,  note: '6.8% away',                                      new_flag: 0 },
  { ticker: 'DD',   geo: 'US', type: 'SELL LIMIT', price: 50,     qty: 5,   currency: 'USD', placed: '21:43 SGT 10 Apr', current_price: 47.00,  note: '6.4% away',                                      new_flag: 0 },
]

const REALISED_BREAKDOWN = [
  { k: 'QQQ', v: 20.50 }, { k: 'AAPL', v: -11.03 }, { k: 'GOOG', v: 54.50 },
  { k: 'NFLX prior', v: 22.23 }, { k: 'NEE', v: 15.90 }, { k: 'PG', v: 5.19 },
  { k: 'BUD day', v: 5.00 }, { k: 'KO partial', v: 2.35 }, { k: 'SLB', v: 30.42 },
  { k: 'WDC prior', v: 30.00 }, { k: 'NVDA prior', v: 49.90 }, { k: 'BUD re-entry', v: 5.95 },
  { k: 'INTC ~APPROX', v: 21.90 }, { k: 'BSTZ ~APPROX', v: 27.80 },
  { k: 'RING first', v: 58.10 }, { k: 'COPX', v: 29.80 },
  { k: 'VCX ~APPROX', v: 11.25 }, { k: 'CMCL', v: 42.25 }, { k: 'ICLN', v: 6.91 },
  { k: 'WDC day', v: 13.11 },
]

const GROWTH = {
  K: { score: 4, level: 'Developing', next: 'MU cycle-stage valuation · payments/media (V, NFLX) thesis docs', items: [
    'P/E, P/B, EV/EBITDA understood', 'ETF open vs closed-end, NAV premium/discount',
    'Pharma 5-factor framework', 'Trailing stop vs hard exit',
    'Fundrise private quarterly NAV mechanics', 'S232 + MFN tariff pharma moat thesis',
    'Frequency of mention as implicit signal', 'Pre-commit vs market-execute tradeoffs',
  ]},
  S: { score: 4, level: 'Developing', next: 'MU take-profit plan · NVDA $220 rationale · V/NFLX thesis documentation', items: [
    'Pre-committed sell limits over market-chasing', 'Geographic + sector diversification US/SG/UK/HK',
    'Pharma framework → ABBV selected', 'AGIX Anthropic IPO thesis',
    'MU $500 target (89.7% there, no exit plan yet)', 'Both-ends order pattern (NFLX: buy limit + sell limit)',
    'RING round-trip trade (exit + re-entry)',
  ]},
  E: { score: 4, level: 'Developing', next: 'Process audit on cancel-then-market pattern · MU trailing stop mechanic', items: [
    'First SGX odd-lot (D05)', 'Multi-market simultaneous sell limits',
    'MOO overnight trade', 'Clean sell-limit fills (RING, COPX)',
    'WDC intraday day trade +$13.11', '3 limits cancelled then market-sold (VCX, CMCL, ICLN)',
    '5 new orders in single 25-min session 21 Apr',
  ]},
}

const MILESTONES = [
  { date: '27 Mar', tags: ['E'],      text: 'First position - MU entry' },
  { date: '02 Apr', tags: ['S', 'E'], text: 'QQQ take-profit first green trade +$20.50' },
  { date: '07 Apr', tags: ['K'],      text: 'Tariff deep dive · S232 pharma moat thesis' },
  { date: '09 Apr', tags: ['S'],      text: 'AGIX Anthropic IPO thesis formed' },
  { date: '17 Apr', tags: ['E'],      text: 'Snap 25 · INTC + BSTZ exits · VCX drawdown adds' },
  { date: '18 Apr', tags: ['E'],      text: 'Snap 26 · RING + COPX sell limits filled · CMCL div' },
  { date: '20 Apr', tags: ['E'],      text: 'WDC day trade (2-min intraday) +$13.11 · VCX exit $99.25' },
  { date: '21 Apr', tags: ['E', 'S'], text: 'Snap 27 · 4 exits · 3 new positions (V, NFLX, RING re-entry) · 5 new orders in 25 min' },
  { date: '21 Apr', tags: ['S'],      text: 'NVDA SELL LIMIT $220 set · rationale undocumented · first NVDA exit plan since re-entry' },
]

// ── Seed ──────────────────────────────────────────────────────────────────────

async function seed() {
  const now = new Date().toISOString()

  // Wipe existing seed row so script is idempotent
  await db.execute({ sql: 'DELETE FROM portfolio_milestones WHERE snapshot_id = ?', args: [SNAPSHOT_ID] })
  await db.execute({ sql: 'DELETE FROM portfolio_growth     WHERE snapshot_id = ?', args: [SNAPSHOT_ID] })
  await db.execute({ sql: 'DELETE FROM portfolio_realised_trades WHERE snapshot_id = ?', args: [SNAPSHOT_ID] })
  await db.execute({ sql: 'DELETE FROM portfolio_orders     WHERE snapshot_id = ?', args: [SNAPSHOT_ID] })
  await db.execute({ sql: 'DELETE FROM portfolio_snapshots  WHERE id = ?', args: [SNAPSHOT_ID] })

  // Snapshot
  await db.execute({
    sql: `INSERT INTO portfolio_snapshots
      (id, snapshot_date, total_value, total_pnl, holdings_json, raw_html, created_at,
       cash, pending, net_invested, realised_pnl, net_deposited, dividends,
       snap_label, snap_time, prior_value, prior_unrealised, prior_realised, prior_cash, prior_holdings)
     VALUES (?,?,?,?,?,NULL,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    args: [
      SNAPSHOT_ID, '2026-04-21T05:34:00.000Z',
      PORTFOLIO.totalValue, PORTFOLIO.unrealisedPnL,
      JSON.stringify(holdingsWithAlloc), now,
      PORTFOLIO.cash, PORTFOLIO.pending, PORTFOLIO.netInvested,
      PORTFOLIO.realisedPnL, PORTFOLIO.netDeposited, PORTFOLIO.dividends,
      PORTFOLIO.snapLabel, PORTFOLIO.snapTime,
      PORTFOLIO.priorValue, PORTFOLIO.priorUnrealised, PORTFOLIO.priorRealised,
      PORTFOLIO.priorCash, PORTFOLIO.priorHoldings,
    ],
  })
  console.log('✓ snapshot')

  // Orders
  for (const o of OPEN_ORDERS) {
    await db.execute({
      sql: `INSERT INTO portfolio_orders
        (id, snapshot_id, ticker, geo, type, price, qty, currency, placed, current_price, note, new_flag, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      args: [crypto.randomUUID(), SNAPSHOT_ID, o.ticker, o.geo, o.type, o.price, o.qty,
             o.currency, o.placed, o.current_price, o.note, o.new_flag, now],
    })
  }
  console.log(`✓ ${OPEN_ORDERS.length} orders`)

  // Realised trades
  for (const r of REALISED_BREAKDOWN) {
    await db.execute({
      sql: 'INSERT INTO portfolio_realised_trades (id, snapshot_id, ticker, amount, created_at) VALUES (?,?,?,?,?)',
      args: [crypto.randomUUID(), SNAPSHOT_ID, r.k, r.v, now],
    })
  }
  console.log(`✓ ${REALISED_BREAKDOWN.length} realised trades`)

  // Growth scores
  for (const [dim, g] of Object.entries(GROWTH)) {
    await db.execute({
      sql: `INSERT INTO portfolio_growth (id, snapshot_id, dimension, score, level, items_json, next, created_at)
            VALUES (?,?,?,?,?,?,?,?)`,
      args: [crypto.randomUUID(), SNAPSHOT_ID, dim, g.score, g.level, JSON.stringify(g.items), g.next, now],
    })
  }
  console.log('✓ growth scores (K, S, E)')

  // Milestones
  for (let i = 0; i < MILESTONES.length; i++) {
    const m = MILESTONES[i]
    await db.execute({
      sql: `INSERT INTO portfolio_milestones (id, snapshot_id, date, tags_json, text, sort_order, created_at)
            VALUES (?,?,?,?,?,?,?)`,
      args: [crypto.randomUUID(), SNAPSHOT_ID, m.date, JSON.stringify(m.tags), m.text, i, now],
    })
  }
  console.log(`✓ ${MILESTONES.length} milestones`)

  console.log('\nSnap 27 seed complete.')
}

seed().catch(err => { console.error(err); process.exit(1) })
