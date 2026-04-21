import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import type { Holding } from '@/lib/types'

function parseNum(s: string): number | undefined {
  if (!s) return undefined
  const clean = s.replace(/[^0-9.\-]/g, '')
  const n = parseFloat(clean)
  return isNaN(n) ? undefined : n
}

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

function extractTableRows(html: string): string[][] {
  const rows: string[][] = []
  const trPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
  let trMatch
  while ((trMatch = trPattern.exec(html)) !== null) {
    const cells: string[] = []
    const tdPattern = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi
    let tdMatch
    while ((tdMatch = tdPattern.exec(trMatch[1])) !== null) {
      cells.push(stripTags(tdMatch[1]).trim())
    }
    if (cells.length >= 2) rows.push(cells)
  }
  return rows
}

function detectColumnMap(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {}
  const patterns: [string, RegExp][] = [
    ['name',           /name|stock|instrument|asset|fund|security/i],
    ['ticker',         /ticker|symbol|code/i],
    ['units',          /units|shares|quantity|qty/i],
    ['avg_cost',       /avg.*cost|average.*cost|cost.*price|purchase.*price/i],
    ['current_price',  /current.*price|last.*price|market.*price|price/i],
    ['market_value',   /market.*val|current.*val|value|worth/i],
    ['pnl',            /unrealised|unrealized|^p&l$|gain.*loss|profit.*loss|p\/l/i],
    ['allocation_pct', /weight|alloc|portion/i],
    ['change_1d_pct',  /1d\s*%|1d\s+ch|day\s+ch|daily\s+ch/i],
  ]
  headers.forEach((h, i) => {
    for (const [key, re] of patterns) {
      if (!map[key] && re.test(h)) { map[key] = i; break }
    }
  })
  return map
}

function parseHtml(html: string): { holdings: Holding[]; total_value: number; total_pnl: number | null } {
  const tableMatches = [...html.matchAll(/<table[\s\S]*?<\/table>/gi)]
  const allHoldings: Holding[] = []

  for (const tm of tableMatches) {
    const rows = extractTableRows(tm[0])
    if (rows.length < 2) continue
    const map = detectColumnMap(rows[0])
    if (map.market_value === undefined) continue

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i]
      const name = map.name !== undefined
        ? row[map.name]
        : (map.ticker !== undefined ? row[map.ticker] : row[0])
      if (!name || name.length < 2) continue
      if (/total|subtotal|grand/i.test(name)) continue
      const mv = parseNum(row[map.market_value])
      if (!mv || mv <= 0) continue
      const holding: Holding = { name, market_value: mv }
      if (map.ticker !== undefined) holding.ticker = row[map.ticker] || undefined
      if (map.units !== undefined) holding.units = parseNum(row[map.units])
      if (map.avg_cost !== undefined) holding.avg_cost = parseNum(row[map.avg_cost])
      if (map.current_price !== undefined) holding.current_price = parseNum(row[map.current_price])
      if (map.pnl !== undefined) holding.pnl = parseNum(row[map.pnl])
      if (map.allocation_pct !== undefined) holding.allocation_pct = parseNum(row[map.allocation_pct])
      if (map.change_1d_pct !== undefined) holding.change_1d_pct = parseNum(row[map.change_1d_pct])
      if (holding.pnl !== undefined) {
        const costBasis = mv - holding.pnl
        if (costBasis > 0) holding.pnl_pct = (holding.pnl / costBasis) * 100
      }
      allHoldings.push(holding)
    }
  }

  if (allHoldings.length === 0) return { holdings: [], total_value: 0, total_pnl: null }

  const total_value = allHoldings.reduce((s, h) => s + h.market_value, 0)
  if (total_value > 0) {
    for (const h of allHoldings) {
      if (h.allocation_pct === undefined) h.allocation_pct = (h.market_value / total_value) * 100
    }
  }
  const pnlValues = allHoldings.filter(h => h.pnl !== undefined).map(h => h.pnl!)
  const total_pnl = pnlValues.length > 0 ? pnlValues.reduce((s, v) => s + v, 0) : null
  return { holdings: allHoldings, total_value, total_pnl }
}

const TICKER_META: Record<string, { geo: 'US' | 'SG' | 'UK' | 'HK'; sector: string; currency: string }> = {
  MU:    { geo: 'US', sector: 'Technology',          currency: 'USD' },
  ABBV:  { geo: 'US', sector: 'Healthcare',           currency: 'USD' },
  Z74:   { geo: 'SG', sector: 'Telecommunications',   currency: 'SGD' },
  NEE:   { geo: 'US', sector: 'Utilities',            currency: 'USD' },
  GOOG:  { geo: 'US', sector: 'Technology',           currency: 'USD' },
  GOOGL: { geo: 'US', sector: 'Technology',           currency: 'USD' },
  SLB:   { geo: 'US', sector: 'Energy',               currency: 'USD' },
  PG:    { geo: 'US', sector: 'Consumer Staples',     currency: 'USD' },
  RING:  { geo: 'US', sector: 'Metals',               currency: 'USD' },
  AGIX:  { geo: 'US', sector: 'ETF',                  currency: 'USD' },
  NFLX:  { geo: 'US', sector: 'Media',                currency: 'USD' },
  D05:   { geo: 'SG', sector: 'Financials',           currency: 'SGD' },
  CMCL:  { geo: 'US', sector: 'Metals',               currency: 'USD' },
  MOO:   { geo: 'US', sector: 'Agriculture ETF',      currency: 'USD' },
  FXI:   { geo: 'HK', sector: 'ETF',                  currency: 'USD' },
  WISE:  { geo: 'UK', sector: 'Financials',           currency: 'GBP' },
  ICLN:  { geo: 'US', sector: 'ETF',                  currency: 'USD' },
  QQQ:   { geo: 'US', sector: 'ETF',                  currency: 'USD' },
  AAPL:  { geo: 'US', sector: 'Technology',           currency: 'USD' },
  MSFT:  { geo: 'US', sector: 'Technology',           currency: 'USD' },
  AMZN:  { geo: 'US', sector: 'Technology',           currency: 'USD' },
  NVDA:  { geo: 'US', sector: 'Technology',           currency: 'USD' },
  META:  { geo: 'US', sector: 'Media',                currency: 'USD' },
  TSLA:  { geo: 'US', sector: 'Technology',           currency: 'USD' },
  PLTR:  { geo: 'US', sector: 'Technology',           currency: 'USD' },
  C6L:   { geo: 'SG', sector: 'Telecommunications',   currency: 'SGD' },
  O39:   { geo: 'SG', sector: 'Financials',           currency: 'SGD' },
  U11:   { geo: 'SG', sector: 'Financials',           currency: 'SGD' },
  V:     { geo: 'US', sector: 'Financials',           currency: 'USD' },
  BUD:   { geo: 'US', sector: 'Consumer Staples',     currency: 'USD' },
  PM:    { geo: 'US', sector: 'Consumer Staples',     currency: 'USD' },
  ULVR:  { geo: 'UK', sector: 'Consumer Staples',     currency: 'GBP' },
  KO:    { geo: 'US', sector: 'Consumer Staples',     currency: 'USD' },
  DD:    { geo: 'US', sector: 'Materials',            currency: 'USD' },
  TEAM:  { geo: 'US', sector: 'Software',             currency: 'USD' },
}

function enrichHolding(h: Holding): Holding {
  // If already has geo/sector/currency (from JSON import), keep as-is
  if (h.geo && h.sector && h.currency) return h
  const raw = h.ticker ?? h.name ?? ''
  const candidates = [raw, raw.split(/\s+/)[0]]
  let ticker: string | undefined
  for (const c of candidates) {
    const key = c.toUpperCase()
    if (key && TICKER_META[key]) { ticker = key; break }
  }
  if (!ticker) return h
  const meta = TICKER_META[ticker]
  return { ...h, ticker, geo: meta.geo, sector: meta.sector, currency: meta.currency }
}

// ── GET — return latest snapshot with all related data ────────────────────────

export async function GET() {
  const snapResult = await db.execute(
    `SELECT id, snapshot_date, total_value, total_pnl, holdings_json, created_at,
            cash, pending, net_invested, realised_pnl, net_deposited, dividends,
            snap_label, snap_time, prior_value, prior_unrealised, prior_realised,
            prior_cash, prior_holdings
     FROM portfolio_snapshots ORDER BY snapshot_date DESC LIMIT 1`
  )
  if (snapResult.rows.length === 0) return Response.json(null)

  const row = snapResult.rows[0]
  const snapId = row.id as string

  const holdings: Holding[] = JSON.parse(row.holdings_json as string)
  const sanitized = holdings.map(h => {
    const s = h.pnl !== undefined && Math.abs(h.pnl) > h.market_value * 3
      ? { ...h, pnl: undefined, pnl_pct: undefined }
      : h
    return enrichHolding(s)
  })
  const pnlValues = sanitized.filter(h => h.pnl !== undefined).map(h => h.pnl!)
  const total_pnl = pnlValues.length > 0 ? pnlValues.reduce((s, v) => s + v, 0) : null

  const [ordersRes, realisedRes, growthRes, milestonesRes] = await Promise.all([
    db.execute({ sql: 'SELECT * FROM portfolio_orders WHERE snapshot_id = ? ORDER BY rowid', args: [snapId] }),
    db.execute({ sql: 'SELECT * FROM portfolio_realised_trades WHERE snapshot_id = ?', args: [snapId] }),
    db.execute({ sql: 'SELECT * FROM portfolio_growth WHERE snapshot_id = ?', args: [snapId] }),
    db.execute({ sql: 'SELECT * FROM portfolio_milestones WHERE snapshot_id = ? ORDER BY sort_order', args: [snapId] }),
  ])

  const growth = growthRes.rows.map(g => ({
    ...g,
    items: JSON.parse(g.items_json as string),
  }))
  const milestones = milestonesRes.rows.map(m => ({
    ...m,
    tags: JSON.parse(m.tags_json as string),
  }))

  return Response.json({
    ...row,
    holdings: sanitized,
    total_pnl,
    orders: ordersRes.rows,
    realised_trades: realisedRes.rows,
    growth,
    milestones,
  })
}

// ── POST — create snapshot from JSON payload or parsed HTML ───────────────────

export async function POST(request: NextRequest) {
  const body = await request.json()
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  // ── JSON import (full snapshot payload) ────────────────────────────────────
  if (body.format === 'json') {
    const {
      snapshot_date, snap_label, snap_time,
      total_value, total_pnl,
      cash, pending, net_invested, realised_pnl, net_deposited, dividends,
      prior_value, prior_unrealised, prior_realised, prior_cash, prior_holdings,
      holdings = [], orders = [], realised_trades = [],
      growth = {}, milestones = [],
    } = body

    if (!snapshot_date || typeof total_value !== 'number') {
      return Response.json({ error: 'snapshot_date and total_value are required' }, { status: 400 })
    }

    await db.execute({
      sql: `INSERT INTO portfolio_snapshots
        (id, snapshot_date, total_value, total_pnl, holdings_json, raw_html, created_at,
         cash, pending, net_invested, realised_pnl, net_deposited, dividends,
         snap_label, snap_time, prior_value, prior_unrealised, prior_realised, prior_cash, prior_holdings)
       VALUES (?,?,?,?,?,NULL,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      args: [
        id, snapshot_date, total_value, total_pnl ?? null,
        JSON.stringify(holdings), now,
        cash ?? null, pending ?? null, net_invested ?? null, realised_pnl ?? null,
        net_deposited ?? null, dividends ?? null, snap_label ?? null, snap_time ?? null,
        prior_value ?? null, prior_unrealised ?? null, prior_realised ?? null,
        prior_cash ?? null, prior_holdings ?? null,
      ],
    })

    for (const o of orders) {
      await db.execute({
        sql: `INSERT INTO portfolio_orders
          (id, snapshot_id, ticker, geo, type, price, qty, currency, placed, current_price, note, new_flag, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        args: [
          crypto.randomUUID(), id,
          o.ticker, o.geo ?? 'US', o.type, o.price, o.qty, o.currency ?? 'USD',
          o.placed ?? null, o.current_price ?? null, o.note ?? null,
          o.new_flag ? 1 : 0, now,
        ],
      })
    }

    for (const r of realised_trades) {
      await db.execute({
        sql: 'INSERT INTO portfolio_realised_trades (id, snapshot_id, ticker, amount, created_at) VALUES (?,?,?,?,?)',
        args: [crypto.randomUUID(), id, r.ticker, r.amount, now],
      })
    }

    let growthCount = 0
    for (const [dim, g] of Object.entries(growth) as [string, { score: number; level: string; items: string[]; next?: string }][]) {
      await db.execute({
        sql: `INSERT INTO portfolio_growth (id, snapshot_id, dimension, score, level, items_json, next, created_at)
              VALUES (?,?,?,?,?,?,?,?)`,
        args: [crypto.randomUUID(), id, dim, g.score, g.level, JSON.stringify(g.items), g.next ?? null, now],
      })
      growthCount++
    }

    for (let i = 0; i < milestones.length; i++) {
      const m = milestones[i]
      await db.execute({
        sql: `INSERT INTO portfolio_milestones (id, snapshot_id, date, tags_json, text, sort_order, created_at)
              VALUES (?,?,?,?,?,?,?)`,
        args: [crypto.randomUUID(), id, m.date, JSON.stringify(m.tags), m.text, i, now],
      })
    }

    return Response.json({
      id, holdings_count: holdings.length, orders_count: orders.length,
      realised_count: realised_trades.length, growth_count: growthCount,
      milestones_count: milestones.length,
    }, { status: 201 })
  }

  // ── Legacy HTML import ─────────────────────────────────────────────────────
  const { html, snapshot_date } = body
  if (!html || typeof html !== 'string') {
    return Response.json({ error: 'html is required' }, { status: 400 })
  }

  const { holdings, total_value, total_pnl } = parseHtml(html)
  if (holdings.length === 0) {
    return Response.json(
      { error: 'Could not parse any holdings from the HTML. Make sure you uploaded the full portfolio report.' },
      { status: 422 }
    )
  }

  const date = snapshot_date || now
  await db.execute({
    sql: `INSERT INTO portfolio_snapshots (id, snapshot_date, total_value, total_pnl, holdings_json, raw_html, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [id, date, total_value, total_pnl ?? null, JSON.stringify(holdings), html, now],
  })

  return Response.json({ id, total_value, total_pnl, holdings_count: holdings.length }, { status: 201 })
}
