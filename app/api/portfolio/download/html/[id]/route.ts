import { NextRequest } from 'next/server'
import { verifySession } from '@/lib/session'
import { db } from '@/lib/db'
import { generateHtmlReport, type SnapData, type SnapSummary } from '@/lib/portfolio/report-generator'

async function loadSnapData(id: string): Promise<SnapData | null> {
  const snapRes = await db.execute({ sql: 'SELECT * FROM portfolio_snapshots WHERE id = ?', args: [id] })
  if (snapRes.rows.length === 0) return null
  const s = snapRes.rows[0] as Record<string, unknown>

  const [holdings, orders, realised, growth] = await Promise.all([
    db.execute({ sql: 'SELECT * FROM portfolio_holdings WHERE snapshot_id = ?', args: [id] }),
    db.execute({ sql: 'SELECT * FROM portfolio_orders WHERE snapshot_id = ?', args: [id] }),
    db.execute({ sql: 'SELECT * FROM portfolio_realised WHERE snapshot_id = ?', args: [id] }),
    db.execute({ sql: 'SELECT * FROM portfolio_growth WHERE snapshot_id = ?', args: [id] }),
  ])

  return {
    id: s.id as string,
    snapshot_date: s.snapshot_date as string,
    snap_label: s.snap_label as string | null,
    snap_time: s.snap_time as string | null,
    total_value: s.total_value as number,
    unrealised_pnl: s.unrealised_pnl as number | null,
    realised_pnl: s.realised_pnl as number | null,
    cash: s.cash as number | null,
    pending: s.pending as number | null,
    net_deposited: s.net_deposited as number | null,
    holdings: (holdings.rows as Record<string, unknown>[]).map(h => ({
      ticker: h.ticker as string | null,
      name: h.name as string,
      geo: h.geo as string | null,
      sector: h.sector as string | null,
      currency: h.currency as string | null,
      price: h.price as number | null,
      change_1d: h.change_1d as number | null,
      value: h.value as number,
      pnl: h.pnl as number | null,
      qty: h.qty as number | null,
      sell_limit: h.sell_limit as number | null,
      buy_limit: h.buy_limit as number | null,
    })),
    orders: (orders.rows as Record<string, unknown>[]).map(o => ({
      ticker: o.ticker as string,
      type: o.type as string,
      price: o.price as number,
      qty: o.qty as number,
      currency: o.currency as string,
      placed: o.placed as string | null,
      note: o.note as string | null,
      new_flag: o.new_flag as number,
      snapshot_id: o.snapshot_id as string,
    })),
    realised: (realised.rows as Record<string, unknown>[]).map(r => ({
      key: r.key as string,
      value: r.value as number,
    })),
    growth: (growth.rows as Record<string, unknown>[]).map(g => ({
      dimension: g.dimension as string,
      score: g.score as number,
      label: g.label as string | null,
      level: g.level as string | null,
      items_json: g.items_json as string,
      next_text: g.next_text as string | null,
    })),
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const valid = await verifySession()
  if (!valid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const snap = await loadSnapData(id)
  if (!snap) return Response.json({ error: 'Not found' }, { status: 404 })

  const prevRes = await db.execute({
    sql: 'SELECT id FROM portfolio_snapshots WHERE snapshot_date < ? ORDER BY snapshot_date DESC, created_at DESC LIMIT 1',
    args: [snap.snapshot_date],
  })
  const prevSnap = prevRes.rows.length > 0
    ? await loadSnapData(prevRes.rows[0].id as string)
    : null

  const allRes = await db.execute(
    'SELECT id, snap_label, snapshot_date FROM portfolio_snapshots ORDER BY snapshot_date ASC'
  )
  const allSnaps: SnapSummary[] = (allRes.rows as Record<string, unknown>[]).map(r => ({
    id: r.id as string,
    snap_label: r.snap_label as string | null,
    snapshot_date: r.snapshot_date as string,
  }))

  const html = generateHtmlReport(snap, prevSnap, allSnaps)
  const label = (snap.snap_label ?? snap.snapshot_date.slice(0, 10)).replace(/[^a-z0-9-]/gi, '-')

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': `attachment; filename="portfolio-${label}.html"`,
    },
  })
}
