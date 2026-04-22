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
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ').trim()
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
    ['pnl',            /unrealised|unrealized|urz|p&l|gain.*loss|profit.*loss|p\/l/i],
    ['allocation_pct', /weight|alloc|portion/i],
    ['change_1d_pct',  /1d\s*%|1d\s+ch|day\s+ch|daily\s+ch/i],
  ]
  headers.forEach((h, i) => {
    for (const [key, re] of patterns) {
      if (!map[key] && re.test(h)) {
        map[key] = i
        break
      }
    }
  })
  return map
}

type PortfolioSummary = {
  total_value?: number
  unrealised_pnl?: number
  realised_pnl?: number
  cash?: number
  pending?: number
}

// Extracts the machine-readable summary block the skill embeds in its HTML output:
// <script type="application/json" id="portfolio-summary">{...}</script>
// Values here are exact (FX-adjusted, including cash) and override all computed/carried-forward values.
function parseSummary(html: string): PortfolioSummary {
  const m = html.match(/<script[^>]*id=["']portfolio-summary["'][^>]*>([\s\S]*?)<\/script>/i)
  if (!m) return {}
  try {
    return JSON.parse(m[1].trim()) as PortfolioSummary
  } catch {
    return {}
  }
}

function parseHtml(html: string): { holdings: Holding[]; total_value: number; total_pnl: number | null } {
  // Process each <table> independently — a single global pass mixes different tables'
  // column structures (e.g. the Open Orders table columns corrupt the P&L values).
  const tableMatches = [...html.matchAll(/<table[\s\S]*?<\/table>/gi)]

  const allHoldings: Holding[] = []

  for (const tm of tableMatches) {
    const rows = extractTableRows(tm[0])
    if (rows.length < 2) continue

    const map = detectColumnMap(rows[0])

    // Skip tables that don't have a market_value column — they're not holdings tables
    if (map.market_value === undefined) continue

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i]
      // Use ticker col as name fallback (Syfe HTML puts ticker in col 0, no separate name col)
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

      // Derive pnl_pct from actual P&L and cost basis — don't trust a "1D%" column
      if (holding.pnl !== undefined) {
        const costBasis = mv - holding.pnl
        if (costBasis > 0) {
          holding.pnl_pct = (holding.pnl / costBasis) * 100
        }
      }

      allHoldings.push(holding)
    }
  }

  if (allHoldings.length === 0) {
    return { holdings: [], total_value: 0, total_pnl: null }
  }

  const total_value = allHoldings.reduce((s, h) => s + h.market_value, 0)

  // Derive allocation_pct for any holdings missing it
  if (total_value > 0) {
    for (const h of allHoldings) {
      if (h.allocation_pct === undefined) {
        h.allocation_pct = (h.market_value / total_value) * 100
      }
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
}

function enrichHolding(h: Holding): Holding {
  // Syfe HTML puts extra text in the ticker column: "MU US", "Z74 SG", "ABBV US DIV 15 May".
  // Try full value first, then the first whitespace-separated token to find the base symbol.
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

export async function GET() {
  const result = await db.execute(
    `SELECT id, snapshot_date, total_value, total_pnl, holdings_json, created_at,
            cash, pending, realised_pnl, net_invested, net_deposited, dividends,
            prior_value, prior_unrealised, prior_realised, prior_cash, snap_label, prior_holdings
     FROM portfolio_snapshots ORDER BY snapshot_date DESC LIMIT 1`
  )
  if (result.rows.length === 0) {
    return Response.json(null)
  }
  const row = result.rows[0]

  const holdings: Holding[] = JSON.parse(row.holdings_json as string)
  const sanitized: Holding[] = holdings.map(h => {
    const s = (h.pnl !== undefined && Math.abs(h.pnl) > h.market_value * 3)
      ? { ...h, pnl: undefined, pnl_pct: undefined }
      : h
    return enrichHolding(s)
  })
  const pnlValues = sanitized.filter(h => h.pnl !== undefined).map(h => h.pnl!)
  const total_pnl = pnlValues.length > 0 ? pnlValues.reduce((s, v) => s + v, 0) : null

  return Response.json({ ...row, holdings: sanitized, total_pnl })
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { html, snapshot_date, cash, pending, realised_pnl, net_invested, net_deposited,
          dividends, prior_value, prior_unrealised, prior_realised, prior_cash,
          snap_label, prior_holdings } = body

  if (!html || typeof html !== 'string') {
    return Response.json({ error: 'html is required' }, { status: 400 })
  }

  const { holdings, total_value: parsedTotal, total_pnl: parsedPnl } = parseHtml(html)

  if (holdings.length === 0) {
    return Response.json(
      { error: 'Could not parse any holdings from the HTML. Make sure you uploaded the full portfolio report.' },
      { status: 422 }
    )
  }

  // Extract machine-readable summary block embedded by the skill.
  // Values here are FX-adjusted and include cash — they override all computed/carried-forward values.
  const summary = parseSummary(html)
  const total_value = summary.total_value ?? parsedTotal

  const id = crypto.randomUUID()
  const date = snapshot_date || new Date().toISOString()
  const now = new Date().toISOString()

  // Summary block values take priority over carry-forward.
  // Explicit caller-provided values always win over both.
  let effectiveCash = cash ?? summary.cash ?? null
  let effectiveRealised = realised_pnl ?? summary.realised_pnl ?? null
  let effectivePending = pending ?? summary.pending ?? null
  let effectiveUnrealised = summary.unrealised_pnl ?? parsedPnl ?? null
  let effectiveNetInvested = net_invested ?? null
  let effectiveNetDeposited = net_deposited ?? null
  let effectiveDividends = dividends ?? null
  let effectivePriorValue = prior_value ?? null
  let effectivePriorUnrealised = prior_unrealised ?? null
  let effectivePriorRealised = prior_realised ?? null
  let effectivePriorCash = prior_cash ?? null

  if (effectiveCash === null && effectiveRealised === null) {
    const prevResult = await db.execute(
      `SELECT total_value, total_pnl, unrealised_pnl, realised_pnl, cash,
              net_invested, net_deposited, dividends
       FROM portfolio_snapshots
       WHERE snap_label IS NOT NULL
       ORDER BY snapshot_date DESC, created_at DESC LIMIT 1`
    )
    if (prevResult.rows.length > 0) {
      const prev = prevResult.rows[0] as Record<string, unknown>
      effectiveCash = (prev.cash as number | null) ?? null
      effectiveRealised = (prev.realised_pnl as number | null) ?? null
      effectiveNetInvested = (prev.net_invested as number | null) ?? null
      effectiveNetDeposited = (prev.net_deposited as number | null) ?? null
      effectiveDividends = (prev.dividends as number | null) ?? null
      effectivePriorValue = effectivePriorValue ?? (prev.total_value as number | null) ?? null
      effectivePriorUnrealised = effectivePriorUnrealised
        ?? (prev.unrealised_pnl as number | null)
        ?? (prev.total_pnl as number | null)
        ?? null
      effectivePriorRealised = effectivePriorRealised ?? (prev.realised_pnl as number | null) ?? null
      effectivePriorCash = effectivePriorCash ?? (prev.cash as number | null) ?? null
    }
  }

  // Auto-generate snap_label so the v2 GET route (WHERE snap_label IS NOT NULL) can see this snapshot
  const autoLabel = snap_label ?? (() => {
    const d = new Date(date)
    const day = d.getUTCDate()
    const mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getUTCMonth()]
    const yr = d.getUTCFullYear()
    return `${day} ${mon} ${yr} (HTML import)`
  })()

  try {
    await db.execute({
      sql: `INSERT INTO portfolio_snapshots
              (id, snapshot_date, total_value, total_pnl, unrealised_pnl, holdings_json, raw_html, created_at,
               cash, pending, realised_pnl, net_invested, net_deposited, dividends,
               prior_value, prior_unrealised, prior_realised, prior_cash, snap_label, prior_holdings)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      args: [id, date, total_value, parsedPnl ?? null, effectiveUnrealised ?? null,
             JSON.stringify(holdings), html, now,
             effectiveCash ?? 0, effectivePending ?? 0, effectiveRealised ?? 0, effectiveNetInvested,
             effectiveNetDeposited, effectiveDividends ?? 0,
             effectivePriorValue, effectivePriorUnrealised,
             effectivePriorRealised, effectivePriorCash, autoLabel, prior_holdings ?? null],
    })

    // Also insert into portfolio_holdings so the v2 snapshots route can serve individual holding rows.
    // Apply enrichHolding so geo/sector/currency/ticker are resolved from the name-lookup table.
    for (const h of holdings) {
      const enriched = enrichHolding(h)
      await db.execute({
        sql: `INSERT INTO portfolio_holdings
          (id, snapshot_id, ticker, name, geo, sector, currency, price, change_1d,
           value, pnl, qty, value_usd, avg_cost, target, sell_limit, buy_limit,
           is_new, approx, note, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        args: [
          crypto.randomUUID(), id,
          enriched.ticker ?? null, enriched.name, enriched.geo ?? null, enriched.sector ?? null, enriched.currency ?? null,
          enriched.current_price ?? null, enriched.change_1d_pct ?? null,
          enriched.market_value, enriched.pnl ?? null, enriched.units ?? null, null, enriched.avg_cost ?? null,
          null, null, null,
          0, 0, null, now,
        ],
      })
    }
  } catch (err) {
    return Response.json(
      { error: `Database error: ${err instanceof Error ? err.message : String(err)}. Run /api/migrate to set up schema.` },
      { status: 500 }
    )
  }

  return Response.json({ id, total_value, total_pnl: effectiveUnrealised, holdings_count: holdings.length }, { status: 201 })
}
