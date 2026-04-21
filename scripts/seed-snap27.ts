import { config } from 'dotenv'
config({ path: new URL('../.env.local', import.meta.url).pathname })
import { createClient } from '@libsql/client'

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

const FX: Record<string, number> = { USD: 1, SGD: 0.74, GBP: 1.29 }

const HOLDINGS = [
  { ticker: 'MU',   name: 'Micron Technology',          geo: 'US', sector: 'Technology',       currency: 'USD', value: 2242.10, pnl: 556.10,  qty: 5,       avg_cost: 337.20, price: 448.42, change_1d: -1.46, target: 500,    sell_limit: null,  buy_limit: null,  is_new: false, approx: false, note: '89.7% to $500 target. No sell limit (deliberate).' },
  { ticker: 'V',    name: 'Visa Inc',                    geo: 'US', sector: 'Financials',       currency: 'USD', value: 1255.76, pnl: 5.88,    qty: 4,       avg_cost: 312.47, price: 313.94, change_1d: -0.97, target: null,   sell_limit: null,  buy_limit: 312.42, is_new: true,  approx: false, note: 'NEW position · market buy 02:56 SGT 21 Apr. BUY LIMIT $312.42 × 1 pending.' },
  { ticker: 'MOO',  name: 'VanEck Agribusiness ETF',     geo: 'US', sector: 'Agriculture ETF',  currency: 'USD', value: 1172.92, pnl: -17.41,  qty: 14,      avg_cost: 85.02,  price: 83.78,  change_1d:  0.60, target: null,   sell_limit: null,  buy_limit: null,  is_new: false, approx: true,  note: 'Conviction hold · avg ~APPROX' },
  { ticker: 'Z74',  name: 'Singtel',                     geo: 'SG', sector: 'Telecommunications', currency: 'SGD', value: 968.00, pnl: -19.00, qty: 200,     avg_cost: 4.935,  price: 4.840,  change_1d:  0.62, target: null,   sell_limit: 5.170, buy_limit: null,  is_new: false, approx: true,  note: 'SELL LIMIT S$5.170 active' },
  { ticker: 'BUD',  name: 'Anheuser-Busch InBev',        geo: 'US', sector: 'Consumer Staples', currency: 'USD', value: 750.50,  pnl: -6.43,   qty: 10,      avg_cost: 75.69,  price: 75.05,  change_1d: -0.94, target: null,   sell_limit: 77.50, buy_limit: null,  is_new: false, approx: true,  note: 'SELL LIMIT $77.50 · 3.3% away' },
  { ticker: 'SLB',  name: 'SLB (Schlumberger)',           geo: 'US', sector: 'Energy',           currency: 'USD', value: 730.80,  pnl: 11.04,   qty: 14,      avg_cost: 51.41,  price: 52.20,  change_1d: -0.87, target: null,   sell_limit: 53.67, buy_limit: null,  is_new: false, approx: true,  note: 'SELL LIMIT $53.67 · 2.8% away' },
  { ticker: 'ABBV', name: 'AbbVie Inc',                   geo: 'US', sector: 'Healthcare',       currency: 'USD', value: 611.13,  pnl: -28.47,  qty: 3,       avg_cost: 213.20, price: 203.71, change_1d: -2.24, target: null,   sell_limit: 218,   buy_limit: null,  is_new: false, approx: true,  note: 'Sell limit $218 ASSUMED active. Earnings 29 Apr.', dividend_amount: 1.73, dividend_date: '15 May 2026' },
  { ticker: 'NFLX', name: 'Netflix Inc',                  geo: 'US', sector: 'Media',            currency: 'USD', value: 474.15,  pnl: 1.05,    qty: 5,       avg_cost: 94.62,  price: 94.83,  change_1d: -2.55, target: null,   sell_limit: 105,   buy_limit: 94.65, is_new: true,  approx: false, note: 'NEW · both-ends set: BUY LIMIT $94.65 × 2 + SELL LIMIT $105 × 5' },
  { ticker: 'PM',   name: 'Philip Morris',                geo: 'US', sector: 'Consumer Staples', currency: 'USD', value: 472.65,  pnl: -2.42,   qty: 3,       avg_cost: null,   price: 157.55, change_1d: -0.15, target: null,   sell_limit: 162,   buy_limit: null,  is_new: false, approx: false, note: 'SELL LIMIT $162' },
  { ticker: 'RING', name: 'iShares Gold Miners ETF',      geo: 'US', sector: 'Metals',           currency: 'USD', value: 428.85,  pnl: -0.38,   qty: 5,       avg_cost: 85.85,  price: 85.77,  change_1d: -1.15, target: null,   sell_limit: 99.50, buy_limit: null,  is_new: true,  approx: false, note: 'RE-ENTRY · prior sold $87.50 on 18 Apr. SELL LIMIT $99.50 × 5' },
  { ticker: 'ULVR', name: 'Unilever PLC',                 geo: 'UK', sector: 'Consumer Staples', currency: 'GBP', value: 426.90,  pnl: -5.60,   qty: 10,      avg_cost: null,   price: 42.69,  change_1d: -0.70, target: null,   sell_limit: 45,    buy_limit: null,  is_new: false, approx: true,  note: 'SELL LIMIT £45 · qty 10 flag unresolved' },
  { ticker: 'NVDA', name: 'NVIDIA Corp',                  geo: 'US', sector: 'Technology',       currency: 'USD', value: 404.12,  pnl: 11.93,   qty: 2,       avg_cost: 196.10, price: 202.06, change_1d:  0.19, target: null,   sell_limit: 220,   buy_limit: null,  is_new: false, approx: true,  note: 'SELL LIMIT $220 × 2 placed 03:02 SGT 21 Apr' },
  { ticker: 'AGIX', name: 'KraneShares AI ETF',           geo: 'US', sector: 'ETF',              currency: 'USD', value: 388.30,  pnl: 57.80,   qty: 10,      avg_cost: 33.05,  price: 38.83,  change_1d:  1.33, target: null,   sell_limit: null,  buy_limit: null,  is_new: false, approx: false, note: 'Anthropic IPO thesis · deliberate hold to Q4 2026' },
  { ticker: 'KO',   name: 'Coca-Cola',                    geo: 'US', sector: 'Consumer Staples', currency: 'USD', value: 378.41,  pnl: -10.09,  qty: 5.0133,  avg_cost: 77.50,  price: 75.48,  change_1d: -0.34, target: null,   sell_limit: 78.25, buy_limit: null,  is_new: false, approx: true,  note: 'SELL LIMIT $78.25 ASSUMED active' },
  { ticker: 'D05',  name: 'DBS Group Holdings',           geo: 'SG', sector: 'Financials',       currency: 'SGD', value: 286.20,  pnl: 0.35,    qty: 5,       avg_cost: 57.17,  price: 57.24,  change_1d: -0.02, target: null,   sell_limit: null,  buy_limit: null,  is_new: false, approx: false, note: 'Long-term SGX hold' },
  { ticker: 'DD',   name: 'DuPont de Nemours',            geo: 'US', sector: 'Materials',        currency: 'USD', value: 235.00,  pnl: -3.33,   qty: 5,       avg_cost: 47.67,  price: 47.00,  change_1d: -0.74, target: null,   sell_limit: 50,    buy_limit: null,  is_new: false, approx: false, note: 'SELL LIMIT $50 · 6.4% away' },
  { ticker: 'TEAM', name: 'Atlassian Corp',               geo: 'US', sector: 'Software',         currency: 'USD', value: 214.44,  pnl: 7.17,    qty: 3,       avg_cost: 69.09,  price: 71.48,  change_1d:  6.78, target: null,   sell_limit: null,  buy_limit: null,  is_new: false, approx: true,  note: '+6.78% today · largest daily gainer · no sell limit' },
  { ticker: 'WISE', name: 'Wise PLC',                     geo: 'UK', sector: 'Financials',       currency: 'GBP', value: 108.25,  pnl: 18.75,   qty: 10,      avg_cost: 8.95,   price: 10.82,  change_1d: -0.73, target: null,   sell_limit: 11.28, buy_limit: null,  is_new: false, approx: true,  note: 'SELL LIMIT £11.28 ASSUMED active' },
  { ticker: 'FXI',  name: 'iShares China Large-Cap',      geo: 'HK', sector: 'ETF',              currency: 'USD', value: 107.70,  pnl: 7.70,    qty: 2.8597,  avg_cost: 34.97,  price: 37.66,  change_1d:  0.16, target: null,   sell_limit: null,  buy_limit: null,  is_new: false, approx: false, note: 'China hedge' },
]

const OPEN_ORDERS = [
  { ticker: 'NFLX', geo: 'US', type: 'BUY LIMIT',  price: 94.65,  qty: 2,   currency: 'USD', placed: '03:22 SGT 21 Apr', current_price: 94.83,  note: 'NEW · below market · conviction add',       new_flag: 1 },
  { ticker: 'V',    geo: 'US', type: 'BUY LIMIT',  price: 312.42, qty: 1,   currency: 'USD', placed: '03:07 SGT 21 Apr', current_price: 313.94, note: 'NEW · below market · double-down',          new_flag: 1 },
  { ticker: 'NVDA', geo: 'US', type: 'SELL LIMIT', price: 220,    qty: 2,   currency: 'USD', placed: '03:02 SGT 21 Apr', current_price: 202.06, note: 'NEW · 8.9% away · rationale undocumented',  new_flag: 1 },
  { ticker: 'RING', geo: 'US', type: 'SELL LIMIT', price: 99.50,  qty: 5,   currency: 'USD', placed: '03:00 SGT 21 Apr', current_price: 85.77,  note: 'NEW · 16.0% away · on re-entry position',   new_flag: 1 },
  { ticker: 'NFLX', geo: 'US', type: 'SELL LIMIT', price: 105,    qty: 5,   currency: 'USD', placed: '03:00 SGT 21 Apr', current_price: 94.83,  note: 'NEW · 10.7% away · on new position',        new_flag: 1 },
  { ticker: 'ULVR', geo: 'UK', type: 'SELL LIMIT', price: 45,     qty: 10,  currency: 'GBP', placed: '22:45 SGT 16 Apr', current_price: 42.69,  note: '5.4% away',                                 new_flag: 0 },
  { ticker: 'BUD',  geo: 'US', type: 'SELL LIMIT', price: 77.50,  qty: 10,  currency: 'USD', placed: '22:42 SGT 16 Apr', current_price: 75.05,  note: '3.3% away',                                 new_flag: 0 },
  { ticker: 'SLB',  geo: 'US', type: 'SELL LIMIT', price: 53.67,  qty: 14,  currency: 'USD', placed: '22:54 SGT 15 Apr', current_price: 52.20,  note: '2.8% away',                                 new_flag: 0 },
  { ticker: 'PM',   geo: 'US', type: 'SELL LIMIT', price: 162,    qty: 3,   currency: 'USD', placed: '23:48 SGT 14 Apr', current_price: 157.55, note: '2.8% away',                                 new_flag: 0 },
  { ticker: 'Z74',  geo: 'SG', type: 'SELL LIMIT', price: 5.170,  qty: 200, currency: 'SGD', placed: '04:34 SGT 14 Apr', current_price: 4.840,  note: '6.8% away',                                 new_flag: 0 },
  { ticker: 'DD',   geo: 'US', type: 'SELL LIMIT', price: 50,     qty: 5,   currency: 'USD', placed: '21:43 SGT 10 Apr', current_price: 47.00,  note: '6.4% away',                                 new_flag: 0 },
]

const REALISED_BREAKDOWN = [
  { key: 'QQQ',          value: 20.50  }, { key: 'AAPL',          value: -11.03 },
  { key: 'GOOG',         value: 54.50  }, { key: 'NFLX prior',    value: 22.23  },
  { key: 'NEE',          value: 15.90  }, { key: 'PG',            value: 5.19   },
  { key: 'BUD day',      value: 5.00   }, { key: 'KO partial',    value: 2.35   },
  { key: 'SLB',          value: 30.42  }, { key: 'WDC prior',     value: 30.00  },
  { key: 'NVDA prior',   value: 49.90  }, { key: 'BUD re-entry',  value: 5.95   },
  { key: 'INTC ~APPROX', value: 21.90  }, { key: 'BSTZ ~APPROX',  value: 27.80  },
  { key: 'RING first',   value: 58.10  }, { key: 'COPX',          value: 29.80  },
  { key: 'VCX ~APPROX',  value: 11.25  }, { key: 'CMCL',          value: 42.25  },
  { key: 'ICLN',         value: 6.91   }, { key: 'WDC day',       value: 13.11  },
]

const GROWTH = [
  { dimension: 'K', score: 4, label: 'Knowledge', level: 'Developing',
    next_text: 'MU cycle-stage valuation · payments/media (V, NFLX) thesis docs',
    items: [
      'P/E, P/B, EV/EBITDA understood', 'ETF open vs closed-end, NAV premium/discount',
      'Pharma 5-factor framework', 'Trailing stop vs hard exit',
      'Fundrise private quarterly NAV mechanics', 'S232 + MFN tariff pharma moat thesis',
      'Frequency of mention as implicit signal', 'Pre-commit vs market-execute tradeoffs',
    ] },
  { dimension: 'S', score: 4, label: 'Strategy', level: 'Developing',
    next_text: 'MU take-profit plan · NVDA $220 rationale · V/NFLX thesis documentation',
    items: [
      'Pre-committed sell limits over market-chasing', 'Geographic + sector diversification US/SG/UK/HK',
      'Pharma framework → ABBV selected', 'AGIX Anthropic IPO thesis',
      'MU $500 target (89.7% there, no exit plan yet)', 'Both-ends order pattern (NFLX: buy limit + sell limit)',
      'RING round-trip trade (exit + re-entry)',
    ] },
  { dimension: 'E', score: 4, label: 'Execution', level: 'Developing',
    next_text: 'Process audit on cancel-then-market pattern · MU trailing stop mechanic',
    items: [
      'First SGX odd-lot (D05)', 'Multi-market simultaneous sell limits',
      'MOO overnight trade', 'Clean sell-limit fills (RING, COPX)',
      'WDC intraday day trade +$13.11', '3 limits cancelled then market-sold (VCX, CMCL, ICLN)',
      '5 new orders in single 25-min session 21 Apr',
    ] },
]

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
  const totalHoldingUSD = HOLDINGS.reduce((s, h) => s + h.value * (FX[h.currency] ?? 1), 0)

  // Idempotent: wipe existing seed rows
  await db.execute({ sql: 'DELETE FROM portfolio_milestones WHERE snapshot_id = ?', args: [SNAPSHOT_ID] })
  await db.execute({ sql: 'DELETE FROM portfolio_growth     WHERE snapshot_id = ?', args: [SNAPSHOT_ID] })
  await db.execute({ sql: 'DELETE FROM portfolio_realised   WHERE snapshot_id = ?', args: [SNAPSHOT_ID] })
  await db.execute({ sql: 'DELETE FROM portfolio_orders     WHERE snapshot_id = ?', args: [SNAPSHOT_ID] })
  await db.execute({ sql: 'DELETE FROM portfolio_holdings   WHERE snapshot_id = ?', args: [SNAPSHOT_ID] })
  await db.execute({ sql: 'DELETE FROM portfolio_snapshots  WHERE id = ?',          args: [SNAPSHOT_ID] })

  await db.execute({
    sql: `INSERT INTO portfolio_snapshots
      (id, snapshot_date, total_value, total_pnl, holdings_json, raw_html, created_at,
       snap_label, snap_time, unrealised_pnl, realised_pnl, cash, pending, net_invested,
       net_deposited, dividends, prior_value, prior_unrealised, prior_realised, prior_cash, prior_holdings)
     VALUES (?,?,?,NULL,'[]',NULL,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    args: [
      SNAPSHOT_ID, '2026-04-21T05:34:00.000Z', PORTFOLIO.totalValue, now,
      PORTFOLIO.snapLabel, PORTFOLIO.snapTime,
      PORTFOLIO.unrealisedPnL, PORTFOLIO.realisedPnL,
      PORTFOLIO.cash, PORTFOLIO.pending, PORTFOLIO.netInvested,
      PORTFOLIO.netDeposited, PORTFOLIO.dividends,
      PORTFOLIO.priorValue, PORTFOLIO.priorUnrealised, PORTFOLIO.priorRealised,
      PORTFOLIO.priorCash, PORTFOLIO.priorHoldings,
    ],
  })
  console.log('✓ snapshot')

  for (const h of HOLDINGS) {
    const valueUSD = h.value * (FX[h.currency] ?? 1)
    await db.execute({
      sql: `INSERT INTO portfolio_holdings
        (id, snapshot_id, ticker, name, geo, sector, currency, price, change_1d,
         value, pnl, qty, value_usd, avg_cost, target, sell_limit, buy_limit,
         is_new, approx, note, dividend_amount, dividend_date, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      args: [
        crypto.randomUUID(), SNAPSHOT_ID,
        h.ticker, h.name, h.geo, h.sector, h.currency,
        h.price, h.change_1d,
        h.value, h.pnl, h.qty, valueUSD, h.avg_cost ?? null,
        h.target ?? null, h.sell_limit ?? null, h.buy_limit ?? null,
        h.is_new ? 1 : 0, h.approx ? 1 : 0,
        h.note,
        (h as Record<string, unknown>).dividend_amount ?? null,
        (h as Record<string, unknown>).dividend_date ?? null,
        now,
      ],
    })
  }
  console.log(`✓ ${HOLDINGS.length} holdings`)

  for (const o of OPEN_ORDERS) {
    await db.execute({
      sql: `INSERT INTO portfolio_orders
        (id, snapshot_id, ticker, geo, type, price, qty, currency, placed, current_price, note, new_flag, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      args: [
        crypto.randomUUID(), SNAPSHOT_ID,
        o.ticker, o.geo, o.type, o.price, o.qty, o.currency,
        o.placed, o.current_price, o.note, o.new_flag, now,
      ],
    })
  }
  console.log(`✓ ${OPEN_ORDERS.length} orders`)

  for (const r of REALISED_BREAKDOWN) {
    await db.execute({
      sql: 'INSERT INTO portfolio_realised (id, snapshot_id, key, value, created_at) VALUES (?,?,?,?,?)',
      args: [crypto.randomUUID(), SNAPSHOT_ID, r.key, r.value, now],
    })
  }
  console.log(`✓ ${REALISED_BREAKDOWN.length} realised trades`)

  for (const g of GROWTH) {
    await db.execute({
      sql: `INSERT INTO portfolio_growth
        (id, snapshot_id, dimension, score, label, level, items_json, next_text, created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      args: [
        crypto.randomUUID(), SNAPSHOT_ID,
        g.dimension, g.score, g.label, g.level,
        JSON.stringify(g.items), g.next_text, now,
      ],
    })
  }
  console.log('✓ growth scores (K, S, E)')

  for (let i = 0; i < MILESTONES.length; i++) {
    const m = MILESTONES[i]
    await db.execute({
      sql: `INSERT INTO portfolio_milestones (id, snapshot_id, date, tags_json, text, sort_order, created_at)
           VALUES (?,?,?,?,?,?,?)`,
      args: [crypto.randomUUID(), SNAPSHOT_ID, m.date, JSON.stringify(m.tags), m.text, i, now],
    })
  }
  console.log(`✓ ${MILESTONES.length} milestones`)
  console.log('\nSnap 27 seed complete. totalHoldingUSD:', totalHoldingUSD.toFixed(2))
}

seed().catch(err => { console.error(err); process.exit(1) })
