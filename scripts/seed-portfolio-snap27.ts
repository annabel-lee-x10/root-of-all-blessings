import { config } from 'dotenv'
config({ path: new URL('../.env.local', import.meta.url).pathname })
import { db } from '../lib/db'
import type { Holding } from '../lib/types'

const SNAPSHOT_DATE = '2026-04-21T05:34:00.000+08:00'
const SNAP_LABEL = 'Snap 27'

// ── Holdings ──────────────────────────────────────────────────────────────────
const RAW_HOLDINGS = [
  { ticker: 'MU',   name: 'Micron Technology',          geo: 'US', sector: 'Technology',        currency: 'USD', price: 448.42, change1d: -1.46, value: 2242.10, pnl:  556.10, qty: 5,      avgCost: 337.20, target: 500,  sellLimit: null,   buyLimit: null  },
  { ticker: 'V',    name: 'Visa Inc',                   geo: 'US', sector: 'Financials',         currency: 'USD', price: 313.94, change1d: -0.97, value: 1255.76, pnl:    5.88, qty: 4,      avgCost: 312.47, target: null, sellLimit: null,   buyLimit: 312.42, isNew: true },
  { ticker: 'MOO',  name: 'VanEck Agribusiness ETF',    geo: 'US', sector: 'Agriculture ETF',    currency: 'USD', price:  83.78, change1d:  0.60, value: 1172.92, pnl:  -17.41, qty: 14,     avgCost:  85.02, target: null, sellLimit: null,   buyLimit: null,   approx: true },
  { ticker: 'Z74',  name: 'Singtel',                    geo: 'SG', sector: 'Telecommunications', currency: 'SGD', price:   4.84, change1d:  0.62, value:  968.00, pnl:  -19.00, qty: 200,    avgCost:   4.935,target: null, sellLimit: 5.170,  buyLimit: null,   approx: true },
  { ticker: 'BUD',  name: 'Anheuser-Busch InBev',       geo: 'US', sector: 'Consumer Staples',   currency: 'USD', price:  75.05, change1d: -0.94, value:  750.50, pnl:   -6.43, qty: 10,     avgCost:  75.69, target: null, sellLimit: 77.50,  buyLimit: null,   approx: true },
  { ticker: 'SLB',  name: 'SLB (Schlumberger)',         geo: 'US', sector: 'Energy',              currency: 'USD', price:  52.20, change1d: -0.87, value:  730.80, pnl:   11.04, qty: 14,     avgCost:  51.41, target: null, sellLimit: 53.67,  buyLimit: null,   approx: true },
  { ticker: 'ABBV', name: 'AbbVie Inc',                 geo: 'US', sector: 'Healthcare',          currency: 'USD', price: 203.71, change1d: -2.24, value:  611.13, pnl:  -28.47, qty: 3,      avgCost: 213.20, target: null, sellLimit: 218,    buyLimit: null,   approx: true },
  { ticker: 'NFLX', name: 'Netflix Inc',                geo: 'US', sector: 'Media',               currency: 'USD', price:  94.83, change1d: -2.55, value:  474.15, pnl:    1.05, qty: 5,      avgCost:  94.62, target: null, sellLimit: 105,    buyLimit: 94.65,  isNew: true },
  { ticker: 'PM',   name: 'Philip Morris',              geo: 'US', sector: 'Consumer Staples',   currency: 'USD', price: 157.55, change1d: -0.15, value:  472.65, pnl:   -2.42, qty: 3,      avgCost: null,   target: null, sellLimit: 162,    buyLimit: null  },
  { ticker: 'RING', name: 'iShares Gold Miners ETF',    geo: 'US', sector: 'Metals',              currency: 'USD', price:  85.77, change1d: -1.15, value:  428.85, pnl:   -0.38, qty: 5,      avgCost:  85.85, target: null, sellLimit: 99.50,  buyLimit: null,   isNew: true },
  { ticker: 'ULVR', name: 'Unilever PLC',               geo: 'UK', sector: 'Consumer Staples',   currency: 'GBP', price:  42.69, change1d: -0.70, value:  426.90, pnl:   -5.60, qty: 10,     avgCost: null,   target: null, sellLimit: 45,     buyLimit: null,   approx: true },
  { ticker: 'NVDA', name: 'NVIDIA Corp',                geo: 'US', sector: 'Technology',          currency: 'USD', price: 202.06, change1d:  0.19, value:  404.12, pnl:   11.93, qty: 2,      avgCost: 196.10, target: null, sellLimit: 220,    buyLimit: null,   approx: true },
  { ticker: 'AGIX', name: 'KraneShares AI ETF',         geo: 'US', sector: 'ETF',                 currency: 'USD', price:  38.83, change1d:  1.33, value:  388.30, pnl:   57.80, qty: 10,     avgCost:  33.05, target: null, sellLimit: null,   buyLimit: null  },
  { ticker: 'KO',   name: 'Coca-Cola',                  geo: 'US', sector: 'Consumer Staples',   currency: 'USD', price:  75.48, change1d: -0.34, value:  378.41, pnl:  -10.09, qty: 5.0133, avgCost:  77.50, target: null, sellLimit: 78.25,  buyLimit: null,   approx: true },
  { ticker: 'D05',  name: 'DBS Group Holdings',         geo: 'SG', sector: 'Financials',          currency: 'SGD', price:  57.24, change1d: -0.02, value:  286.20, pnl:    0.35, qty: 5,      avgCost:  57.17, target: null, sellLimit: null,   buyLimit: null  },
  { ticker: 'DD',   name: 'DuPont de Nemours',          geo: 'US', sector: 'Materials',           currency: 'USD', price:  47.00, change1d: -0.74, value:  235.00, pnl:   -3.33, qty: 5,      avgCost:  47.67, target: null, sellLimit: 50,     buyLimit: null  },
  { ticker: 'TEAM', name: 'Atlassian Corp',             geo: 'US', sector: 'Software',            currency: 'USD', price:  71.48, change1d:  6.78, value:  214.44, pnl:    7.17, qty: 3,      avgCost:  69.09, target: null, sellLimit: null,   buyLimit: null,   approx: true },
  { ticker: 'WISE', name: 'Wise PLC',                   geo: 'UK', sector: 'Financials',          currency: 'GBP', price:  10.82, change1d: -0.73, value:  108.25, pnl:   18.75, qty: 10,     avgCost:   8.95, target: null, sellLimit: 11.28,  buyLimit: null,   approx: true },
  { ticker: 'FXI',  name: 'iShares China Large-Cap',    geo: 'HK', sector: 'ETF',                 currency: 'USD', price:  37.66, change1d:  0.16, value:  107.70, pnl:    7.70, qty: 2.8597, avgCost:  34.97, target: null, sellLimit: null,   buyLimit: null  },
] as const

// ── Orders ────────────────────────────────────────────────────────────────────
const ORDERS = [
  { ticker: 'NFLX', geo: 'US', type: 'BUY LIMIT',  price: 94.65,  qty: 2,   currency: 'USD', placed: '03:22 SGT 21 Apr', currentPrice: 94.83,  note: 'NEW · below market · conviction add',               newFlag: true  },
  { ticker: 'V',    geo: 'US', type: 'BUY LIMIT',  price: 312.42, qty: 1,   currency: 'USD', placed: '03:07 SGT 21 Apr', currentPrice: 313.94, note: 'NEW · below market · double-down',                   newFlag: true  },
  { ticker: 'NVDA', geo: 'US', type: 'SELL LIMIT', price: 220,    qty: 2,   currency: 'USD', placed: '03:02 SGT 21 Apr', currentPrice: 202.06, note: 'NEW · 8.9% away · rationale undocumented',           newFlag: true  },
  { ticker: 'RING', geo: 'US', type: 'SELL LIMIT', price: 99.50,  qty: 5,   currency: 'USD', placed: '03:00 SGT 21 Apr', currentPrice: 85.77,  note: 'NEW · 16.0% away · on re-entry position',            newFlag: true  },
  { ticker: 'NFLX', geo: 'US', type: 'SELL LIMIT', price: 105,    qty: 5,   currency: 'USD', placed: '03:00 SGT 21 Apr', currentPrice: 94.83,  note: 'NEW · 10.7% away · on new position',                 newFlag: true  },
  { ticker: 'ULVR', geo: 'UK', type: 'SELL LIMIT', price: 45,     qty: 10,  currency: 'GBP', placed: '22:45 SGT 16 Apr', currentPrice: 42.69,  note: '5.4% away',                                          newFlag: false },
  { ticker: 'BUD',  geo: 'US', type: 'SELL LIMIT', price: 77.50,  qty: 10,  currency: 'USD', placed: '22:42 SGT 16 Apr', currentPrice: 75.05,  note: '3.3% away',                                          newFlag: false },
  { ticker: 'SLB',  geo: 'US', type: 'SELL LIMIT', price: 53.67,  qty: 14,  currency: 'USD', placed: '22:54 SGT 15 Apr', currentPrice: 52.20,  note: '2.8% away',                                          newFlag: false },
  { ticker: 'PM',   geo: 'US', type: 'SELL LIMIT', price: 162,    qty: 3,   currency: 'USD', placed: '23:48 SGT 14 Apr', currentPrice: 157.55, note: '2.8% away',                                          newFlag: false },
  { ticker: 'Z74',  geo: 'SG', type: 'SELL LIMIT', price: 5.170,  qty: 200, currency: 'SGD', placed: '04:34 SGT 14 Apr', currentPrice: 4.840,  note: '6.8% away',                                          newFlag: false },
  { ticker: 'DD',   geo: 'US', type: 'SELL LIMIT', price: 50,     qty: 5,   currency: 'USD', placed: '21:43 SGT 10 Apr', currentPrice: 47.00,  note: '6.4% away',                                          newFlag: false },
]

// ── Realised breakdown ────────────────────────────────────────────────────────
const REALISED = [
  { ticker: 'QQQ',          pnl:  20.50 },
  { ticker: 'AAPL',         pnl: -11.03 },
  { ticker: 'GOOG',         pnl:  54.50 },
  { ticker: 'NFLX prior',   pnl:  22.23 },
  { ticker: 'NEE',          pnl:  15.90 },
  { ticker: 'PG',           pnl:   5.19 },
  { ticker: 'BUD day',      pnl:   5.00 },
  { ticker: 'KO partial',   pnl:   2.35 },
  { ticker: 'SLB',          pnl:  30.42 },
  { ticker: 'WDC prior',    pnl:  30.00 },
  { ticker: 'NVDA prior',   pnl:  49.90 },
  { ticker: 'BUD re-entry', pnl:   5.95 },
  { ticker: 'INTC ~APPROX', pnl:  21.90 },
  { ticker: 'BSTZ ~APPROX', pnl:  27.80 },
  { ticker: 'RING first',   pnl:  58.10 },
  { ticker: 'COPX',         pnl:  29.80 },
  { ticker: 'VCX ~APPROX',  pnl:  11.25 },
  { ticker: 'CMCL',         pnl:  42.25 },
  { ticker: 'ICLN',         pnl:   6.91 },
  { ticker: 'WDC day',      pnl:  13.11 },
]

// ── Growth scores ─────────────────────────────────────────────────────────────
const GROWTH = [
  {
    dimension: 'K', score: 4, label: 'Knowledge', level: 'Developing',
    items: [
      'P/E, P/B, EV/EBITDA understood',
      'ETF open vs closed-end, NAV premium/discount',
      'Pharma 5-factor framework',
      'Trailing stop vs hard exit',
      'Fundrise private quarterly NAV mechanics',
      'S232 + MFN tariff pharma moat thesis',
      'Frequency of mention as implicit signal',
      'Pre-commit vs market-execute tradeoffs',
    ],
    next: 'MU cycle-stage valuation · payments/media (V, NFLX) thesis docs',
  },
  {
    dimension: 'S', score: 4, label: 'Strategy', level: 'Developing',
    items: [
      'Pre-committed sell limits over market-chasing',
      'Geographic + sector diversification US/SG/UK/HK',
      'Pharma framework → ABBV selected',
      'AGIX Anthropic IPO thesis',
      'MU $500 target (89.7% there, no exit plan yet)',
      'Both-ends order pattern (NFLX: buy limit + sell limit)',
      'RING round-trip trade (exit + re-entry)',
    ],
    next: 'MU take-profit plan · NVDA $220 rationale · V/NFLX thesis documentation',
  },
  {
    dimension: 'E', score: 4, label: 'Execution', level: 'Developing',
    items: [
      'First SGX odd-lot (D05)',
      'Multi-market simultaneous sell limits',
      'MOO overnight trade',
      'Clean sell-limit fills (RING, COPX)',
      'WDC intraday day trade +$13.11',
      '3 limits cancelled then market-sold (VCX, CMCL, ICLN)',
      '5 new orders in single 25-min session 21 Apr',
    ],
    next: 'Process audit on cancel-then-market pattern · MU trailing stop mechanic',
  },
]

// ── Milestones ────────────────────────────────────────────────────────────────
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

  // ── portfolio_snapshots ────────────────────────────────────────────────────
  const existingSnap = await db.execute({
    sql: 'SELECT id FROM portfolio_snapshots WHERE snapshot_date = ?',
    args: [SNAPSHOT_DATE],
  })
  let snapId: string
  if (existingSnap.rows.length > 0) {
    snapId = existingSnap.rows[0].id as string
    console.log(`– Snapshot already exists: ${snapId}`)
  } else {
    const total_value = RAW_HOLDINGS.reduce((s, h) => s + h.value, 0)
    const holdings: Holding[] = RAW_HOLDINGS.map(h => {
      const holding: Holding = {
        name: h.name, ticker: h.ticker, units: h.qty,
        current_price: h.price, market_value: h.value,
        change_1d_pct: h.change1d,
        allocation_pct: (h.value / total_value) * 100,
        geo: h.geo, sector: h.sector, currency: h.currency,
      }
      if (h.avgCost !== null) holding.avg_cost = h.avgCost
      if (h.pnl !== null) {
        holding.pnl = h.pnl
        const cost = h.value - h.pnl
        if (cost > 0) holding.pnl_pct = (h.pnl / cost) * 100
      }
      if (h.target) holding.target = h.target
      if (h.sellLimit) holding.sell_limit = h.sellLimit
      if (h.buyLimit) holding.buy_limit = h.buyLimit
      if ('approx' in h && h.approx) holding.approx = true
      if ('isNew' in h && h.isNew) holding.is_new = true
      return holding
    })
    const pnlValues = holdings.filter(h => h.pnl !== undefined).map(h => h.pnl!)
    const total_pnl = pnlValues.reduce((s, v) => s + v, 0)
    snapId = crypto.randomUUID()
    await db.execute({
      sql: `INSERT INTO portfolio_snapshots
              (id, snapshot_date, total_value, total_pnl, holdings_json, raw_html, created_at,
               cash, pending, realised_pnl, net_invested, net_deposited, dividends_received,
               prior_value, prior_unrealised, prior_realised, prior_cash, snap_label, prior_holdings_count)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      args: [
        snapId, SNAPSHOT_DATE, total_value, total_pnl, JSON.stringify(holdings), '', now,
        87.45, 508.07, 430.88, 11569.76, 11222.32, 4.77,
        12013.65, 521.11, 357.36, 889.14, SNAP_LABEL, 20,
      ],
    })
    console.log(`✓ Snapshot: ${snapId}`)
  }

  // ── portfolio_orders ───────────────────────────────────────────────────────
  const existingOrders = await db.execute('SELECT COUNT(*) as n FROM portfolio_orders')
  if ((existingOrders.rows[0].n as number) > 0) {
    console.log(`– Orders already seeded`)
  } else {
    for (const o of ORDERS) {
      await db.execute({
        sql: `INSERT INTO portfolio_orders (id, ticker, geo, type, price, qty, currency, placed, current_price, note, new_flag, status, created_at)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        args: [crypto.randomUUID(), o.ticker, o.geo, o.type, o.price, o.qty, o.currency, o.placed, o.currentPrice, o.note, o.newFlag ? 1 : 0, 'open', now],
      })
    }
    console.log(`✓ Orders: ${ORDERS.length}`)
  }

  // ── portfolio_realised ─────────────────────────────────────────────────────
  const existingRealised = await db.execute('SELECT COUNT(*) as n FROM portfolio_realised')
  if ((existingRealised.rows[0].n as number) > 0) {
    console.log(`– Realised trades already seeded`)
  } else {
    for (const r of REALISED) {
      await db.execute({
        sql: `INSERT INTO portfolio_realised (id, ticker, pnl, note, trade_date, created_at) VALUES (?,?,?,?,?,?)`,
        args: [crypto.randomUUID(), r.ticker, r.pnl, null, null, now],
      })
    }
    console.log(`✓ Realised: ${REALISED.length}`)
  }

  // ── portfolio_growth ───────────────────────────────────────────────────────
  const existingGrowth = await db.execute('SELECT COUNT(*) as n FROM portfolio_growth')
  if ((existingGrowth.rows[0].n as number) > 0) {
    console.log(`– Growth scores already seeded`)
  } else {
    for (const g of GROWTH) {
      await db.execute({
        sql: `INSERT INTO portfolio_growth (dimension, score, label, level, items_json, next_action, updated_at) VALUES (?,?,?,?,?,?,?)`,
        args: [g.dimension, g.score, g.label, g.level, JSON.stringify(g.items), g.next, now],
      })
    }
    console.log(`✓ Growth: ${GROWTH.length} dimensions`)
  }

  // ── portfolio_milestones ───────────────────────────────────────────────────
  const existingMilestones = await db.execute('SELECT COUNT(*) as n FROM portfolio_milestones')
  if ((existingMilestones.rows[0].n as number) > 0) {
    console.log(`– Milestones already seeded`)
  } else {
    for (let i = 0; i < MILESTONES.length; i++) {
      const m = MILESTONES[i]
      await db.execute({
        sql: `INSERT INTO portfolio_milestones (id, date, tags_json, text, sort_order, created_at) VALUES (?,?,?,?,?,?)`,
        args: [crypto.randomUUID(), m.date, JSON.stringify(m.tags), m.text, i, now],
      })
    }
    console.log(`✓ Milestones: ${MILESTONES.length}`)
  }

  console.log('Snap 27 seed complete.')
  process.exit(0)
}

seed().catch(err => { console.error(err); process.exit(1) })
