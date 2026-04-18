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
    ['name',          /name|stock|instrument|asset|fund|security/i],
    ['ticker',        /ticker|symbol|code/i],
    ['units',         /units|shares|quantity|qty/i],
    ['avg_cost',      /avg.*cost|average.*cost|cost.*price|purchase.*price/i],
    ['current_price', /current.*price|last.*price|market.*price|price/i],
    ['market_value',  /market.*val|current.*val|value|worth/i],
    ['pnl',           /unrealised|unrealized|^p&l$|gain.*loss|profit.*loss|p\/l/i],
    ['allocation_pct',/weight|alloc|portion/i],
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

export async function GET() {
  const result = await db.execute(
    `SELECT id, snapshot_date, total_value, total_pnl, holdings_json, created_at
     FROM portfolio_snapshots ORDER BY snapshot_date DESC LIMIT 1`
  )
  if (result.rows.length === 0) {
    return Response.json(null)
  }
  const row = result.rows[0]

  // Re-parse holdings_json and recalculate total_pnl so stale snapshots with corrupt
  // P&L values (from pre-fix uploads) display correctly without needing a re-upload.
  const holdings: Holding[] = JSON.parse(row.holdings_json as string)
  const sanitized: Holding[] = holdings.map(h => {
    if (h.pnl !== undefined && Math.abs(h.pnl) > h.market_value * 3) {
      return { ...h, pnl: undefined, pnl_pct: undefined }
    }
    return h
  })
  const pnlValues = sanitized.filter(h => h.pnl !== undefined).map(h => h.pnl!)
  const total_pnl = pnlValues.length > 0 ? pnlValues.reduce((s, v) => s + v, 0) : null

  return Response.json({ ...row, holdings: sanitized, total_pnl })
}

export async function POST(request: NextRequest) {
  const body = await request.json()
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

  const id = crypto.randomUUID()
  const date = snapshot_date || new Date().toISOString()
  const now = new Date().toISOString()

  await db.execute({
    sql: `INSERT INTO portfolio_snapshots (id, snapshot_date, total_value, total_pnl, holdings_json, raw_html, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [id, date, total_value, total_pnl ?? null, JSON.stringify(holdings), html, now],
  })

  return Response.json({ id, total_value, total_pnl, holdings_count: holdings.length }, { status: 201 })
}
