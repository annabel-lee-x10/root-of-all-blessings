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
    ['name',         /name|stock|instrument|asset|fund|security/i],
    ['ticker',       /ticker|symbol|code/i],
    ['units',        /units|shares|quantity|qty/i],
    ['avg_cost',     /avg.*cost|average.*cost|cost.*price|purchase.*price/i],
    ['current_price',/current.*price|last.*price|market.*price|price/i],
    ['market_value', /market.*val|current.*val|value|worth/i],
    ['pnl',          /^p&l$|gain.*loss|profit.*loss|unrealised|unrealized|p\/l/i],
    ['pnl_pct',      /return|%|pct|percent/i],
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
  const rows = extractTableRows(html)
  if (rows.length < 2) {
    return { holdings: [], total_value: 0, total_pnl: null }
  }

  // First non-empty row is likely headers
  const headerRow = rows[0]
  const map = detectColumnMap(headerRow)

  const holdings: Holding[] = []

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    const name = map.name !== undefined ? row[map.name] : row[0]
    if (!name || name.length < 2) continue
    // Skip subtotal/total rows
    if (/total|subtotal|grand/i.test(name)) continue

    const mv = map.market_value !== undefined ? parseNum(row[map.market_value]) : undefined
    if (!mv || mv <= 0) continue

    const holding: Holding = {
      name,
      market_value: mv,
    }
    if (map.ticker !== undefined) holding.ticker = row[map.ticker] || undefined
    if (map.units !== undefined) holding.units = parseNum(row[map.units])
    if (map.avg_cost !== undefined) holding.avg_cost = parseNum(row[map.avg_cost])
    if (map.current_price !== undefined) holding.current_price = parseNum(row[map.current_price])
    if (map.pnl !== undefined) holding.pnl = parseNum(row[map.pnl])
    if (map.pnl_pct !== undefined) holding.pnl_pct = parseNum(row[map.pnl_pct])
    if (map.allocation_pct !== undefined) holding.allocation_pct = parseNum(row[map.allocation_pct])

    holdings.push(holding)
  }

  // Compute total_value from holdings if not extracted separately
  const total_value = holdings.reduce((s, h) => s + h.market_value, 0)

  // Clear pnl/pnl_pct for holdings where the ratio is implausible (column map mismatch
  // across multiple tables in the HTML — e.g. abs(pnl) >> market_value).
  for (const h of holdings) {
    if (h.pnl !== undefined && Math.abs(h.pnl) > h.market_value * 3) {
      h.pnl = undefined
      h.pnl_pct = undefined
    }
  }

  // Compute total_pnl from holdings with plausible pnl values only
  const pnlValues = holdings.filter(h => h.pnl !== undefined).map(h => h.pnl!)
  const total_pnl = pnlValues.length > 0 ? pnlValues.reduce((s, v) => s + v, 0) : null

  // If allocation_pct not in table, derive it
  if (total_value > 0 && holdings.some(h => h.allocation_pct === undefined)) {
    for (const h of holdings) {
      if (h.allocation_pct === undefined) {
        h.allocation_pct = (h.market_value / total_value) * 100
      }
    }
  }

  // Try to extract a more accurate total from the HTML text
  const totalPattern = /total[\s\S]{0,60}?([\$S\$]?\s*[\d,]+(?:\.\d{2})?)/i
  const m = totalPattern.exec(stripTags(html))
  const htmlTotal = m ? parseNum(m[1]) : undefined
  const finalTotal = htmlTotal && htmlTotal > total_value ? htmlTotal : total_value

  return { holdings, total_value: finalTotal, total_pnl }
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
  const holdings: Holding[] = JSON.parse(row.holdings_json as string)

  // Sanitize holdings in case old snapshots have implausible pnl values
  for (const h of holdings) {
    if (h.pnl !== undefined && Math.abs(h.pnl) > h.market_value * 3) {
      h.pnl = undefined
      h.pnl_pct = undefined
    }
  }
  const pnlValues = holdings.filter(h => h.pnl !== undefined).map(h => h.pnl!)
  const total_pnl = pnlValues.length > 0 ? pnlValues.reduce((s, v) => s + v, 0) : null

  return Response.json({ ...row, holdings, total_pnl })
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
      { error: 'Could not parse any holdings from the HTML. Make sure you uploaded the full Syfe portfolio page.' },
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
