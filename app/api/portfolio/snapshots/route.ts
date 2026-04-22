import { NextRequest } from 'next/server'
import { db } from '@/lib/db'

// Maps DB portfolio_holdings row → component-expected Holding shape
function mapHolding(h: Record<string, unknown>, totalValueUSD: number) {
  const value = h.value as number
  const pnl = h.pnl as number | null
  const pnl_pct = pnl !== null && value !== null && value - pnl > 0
    ? (pnl / (value - pnl)) * 100
    : null

  const FX: Record<string, number> = { USD: 1, SGD: 0.74, GBP: 1.29 }
  const currency = (h.currency as string | null) ?? 'USD'
  const valueUSD = (h.value_usd as number | null) ?? value * (FX[currency] ?? 1)
  const allocation_pct = totalValueUSD > 0 ? (valueUSD / totalValueUSD) * 100 : 0

  return {
    // Core fields mapped to Holding field names
    name: h.name as string,
    ticker: h.ticker as string | null ?? undefined,
    units: h.qty as number | null ?? undefined,
    avg_cost: h.avg_cost as number | null ?? undefined,
    current_price: h.price as number | null ?? undefined,
    market_value: value,
    pnl: pnl ?? undefined,
    pnl_pct: pnl_pct ?? undefined,
    allocation_pct,
    change_1d_pct: h.change_1d as number | null ?? undefined,
    geo: h.geo as 'US' | 'SG' | 'UK' | 'HK' | null ?? undefined,
    sector: h.sector as string | null ?? undefined,
    currency: currency,
    // Extended fields
    target: h.target as number | null ?? null,
    sell_limit: h.sell_limit as number | null ?? null,
    buy_limit: h.buy_limit as number | null ?? null,
    is_new: Boolean(h.is_new),
    approx: Boolean(h.approx),
    note: h.note as string | null ?? null,
    dividend_amount: h.dividend_amount as number | null ?? null,
    dividend_date: h.dividend_date as string | null ?? null,
  }
}

export async function GET() {
  try {
  // Find the latest v2 snapshot (one that has snap_label set, distinguishing it from old schema)
  const snapResult = await db.execute(
    `SELECT * FROM portfolio_snapshots
     WHERE snap_label IS NOT NULL
     ORDER BY snapshot_date DESC, created_at DESC LIMIT 1`
  )
  if (snapResult.rows.length === 0) return Response.json(null)

  const snap = snapResult.rows[0] as Record<string, unknown>
  const snapId = snap.id as string

  const [holdingsResult, ordersResult, realisedResult, growthResult, milestonesResult] =
    await Promise.all([
      db.execute({ sql: 'SELECT * FROM portfolio_holdings WHERE snapshot_id = ?', args: [snapId] }),
      db.execute({ sql: 'SELECT * FROM portfolio_orders WHERE snapshot_id = ?', args: [snapId] }),
      db.execute({ sql: 'SELECT * FROM portfolio_realised WHERE snapshot_id = ?', args: [snapId] }),
      db.execute({ sql: 'SELECT * FROM portfolio_growth WHERE snapshot_id = ?', args: [snapId] }),
      db.execute({ sql: 'SELECT * FROM portfolio_milestones WHERE snapshot_id = ? ORDER BY sort_order', args: [snapId] }),
    ])

  const FX: Record<string, number> = { USD: 1, SGD: 0.74, GBP: 1.29 }
  const totalValueUSD = (holdingsResult.rows as Record<string, unknown>[]).reduce((sum, h) => {
    const value = h.value as number
    const currency = (h.currency as string | null) ?? 'USD'
    const valueUSD = (h.value_usd as number | null) ?? value * (FX[currency] ?? 1)
    return sum + valueUSD
  }, 0)

  const holdings = (holdingsResult.rows as Record<string, unknown>[]).map(h => mapHolding(h, totalValueUSD))

  // BUG-031: backfill unrealised_pnl from holdings when DB value is null/undefined.
  // Use == null (not ===) to catch undefined, which occurs when the column doesn't
  // exist in prod yet and SELECT * omits it from the result row.
  let unrealised_pnl = (snap.unrealised_pnl ?? null) as number | null
  if (unrealised_pnl == null) {
    const pnlValues = (holdingsResult.rows as Record<string, unknown>[])
      .map(h => h.pnl as number | null)
      .filter((v): v is number => v !== null)
    if (pnlValues.length > 0) {
      unrealised_pnl = pnlValues.reduce((s, v) => s + v, 0)
    }
  }

  return Response.json({
    id: snap.id,
    snapshot_date: snap.snapshot_date,
    snap_label: snap.snap_label,
    snap_time: snap.snap_time,
    total_value: snap.total_value,
    unrealised_pnl,
    realised_pnl: snap.realised_pnl,
    cash: snap.cash,
    pending: snap.pending,
    net_invested: snap.net_invested,
    net_deposited: snap.net_deposited,
    dividends: snap.dividends,
    prior_value: snap.prior_value,
    prior_unrealised: snap.prior_unrealised,
    prior_realised: snap.prior_realised,
    prior_cash: snap.prior_cash,
    prior_holdings: snap.prior_holdings,
    created_at: snap.created_at,
    holdings,
    orders: ordersResult.rows,
    realised: realisedResult.rows,
    growth: growthResult.rows,
    milestones: milestonesResult.rows,
  })
  } catch (err) {
    console.error('[portfolio/snapshots] GET error:', err)
    return Response.json(
      { error: `Database error: ${err instanceof Error ? err.message : String(err)}. Run /api/migrate to set up schema.` },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { snap_label, snap_time, total_value, unrealised_pnl, realised_pnl,
          cash, pending, net_invested, net_deposited, dividends,
          prior_value, prior_unrealised, prior_realised, prior_cash, prior_holdings,
          holdings = [], orders = [], realised = [], growth = [], milestones = [],
          snapshot_date } = body

  if (total_value === undefined || total_value === null) {
    return Response.json({ error: 'total_value is required' }, { status: 400 })
  }

  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const date = snapshot_date || now

  await db.execute({
    sql: `INSERT INTO portfolio_snapshots
      (id, snapshot_date, total_value, total_pnl, holdings_json, raw_html, created_at,
       snap_label, snap_time, unrealised_pnl, realised_pnl, cash, pending,
       net_invested, net_deposited, dividends,
       prior_value, prior_unrealised, prior_realised, prior_cash, prior_holdings)
     VALUES (?,?,?,NULL,'[]',NULL,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    args: [
      id, date, total_value, now,
      snap_label ?? null, snap_time ?? null,
      unrealised_pnl ?? null, realised_pnl ?? null,
      cash ?? null, pending ?? null,
      net_invested ?? null, net_deposited ?? null, dividends ?? null,
      prior_value ?? null, prior_unrealised ?? null, prior_realised ?? null,
      prior_cash ?? null, prior_holdings ?? null,
    ],
  })

  for (const h of holdings) {
    await db.execute({
      sql: `INSERT INTO portfolio_holdings
        (id, snapshot_id, ticker, name, geo, sector, currency, price, change_1d,
         value, pnl, qty, value_usd, avg_cost, target, sell_limit, buy_limit,
         is_new, approx, note, dividend_amount, dividend_date, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      args: [
        crypto.randomUUID(), id,
        h.ticker ?? null, h.name, h.geo ?? null, h.sector ?? null, h.currency ?? null,
        h.price ?? null, h.change_1d ?? null,
        h.value, h.pnl ?? null, h.qty ?? null, h.value_usd ?? null, h.avg_cost ?? null,
        h.target ?? null, h.sell_limit ?? null, h.buy_limit ?? null,
        h.is_new ? 1 : 0, h.approx ? 1 : 0,
        h.note ?? null, h.dividend_amount ?? null, h.dividend_date ?? null,
        now,
      ],
    })
  }

  for (const o of orders) {
    await db.execute({
      sql: `INSERT INTO portfolio_orders
        (id, snapshot_id, ticker, geo, type, price, qty, currency, placed, current_price, note, new_flag, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      args: [
        crypto.randomUUID(), id,
        o.ticker, o.geo ?? null, o.type, o.price, o.qty, o.currency,
        o.placed ?? null, o.current_price ?? null, o.note ?? null, o.new_flag ?? 0,
        now,
      ],
    })
  }

  for (const r of realised) {
    await db.execute({
      sql: 'INSERT INTO portfolio_realised (id, snapshot_id, key, value, created_at) VALUES (?,?,?,?,?)',
      args: [crypto.randomUUID(), id, r.key, r.value, now],
    })
  }

  for (const g of growth) {
    await db.execute({
      sql: `INSERT INTO portfolio_growth
        (id, snapshot_id, dimension, score, label, level, items_json, next_text, created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      args: [
        crypto.randomUUID(), id,
        g.dimension, g.score, g.label ?? null, g.level ?? null,
        typeof g.items_json === 'string' ? g.items_json : JSON.stringify(g.items ?? []),
        g.next_text ?? null, now,
      ],
    })
  }

  for (let i = 0; i < milestones.length; i++) {
    const m = milestones[i]
    await db.execute({
      sql: `INSERT INTO portfolio_milestones (id, snapshot_id, date, tags_json, text, sort_order, created_at)
           VALUES (?,?,?,?,?,?,?)`,
      args: [
        crypto.randomUUID(), id,
        m.date,
        typeof m.tags_json === 'string' ? m.tags_json : JSON.stringify(m.tags ?? []),
        m.text, i, now,
      ],
    })
  }

  return Response.json({ id, snap_label, total_value, holdings_count: holdings.length }, { status: 201 })
}
