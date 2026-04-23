import { NextRequest } from 'next/server'
import { verifySession } from '@/lib/session'
import { db } from '@/lib/db'
import { generateExcel, type ExcelSnapData } from '@/lib/portfolio/excel-generator'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const valid = await verifySession()
  if (!valid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const snapCheck = await db.execute({ sql: 'SELECT id FROM portfolio_snapshots WHERE id = ?', args: [id] })
  if (snapCheck.rows.length === 0) return Response.json({ error: 'Not found' }, { status: 404 })

  const allSnaps = await db.execute(
    'SELECT * FROM portfolio_snapshots ORDER BY snapshot_date DESC'
  )

  const snapshots: ExcelSnapData[] = await Promise.all(
    (allSnaps.rows as Record<string, unknown>[]).map(async (s) => {
      const sid = s.id as string
      const holdings = await db.execute({
        sql: 'SELECT * FROM portfolio_holdings WHERE snapshot_id = ?',
        args: [sid],
      })
      return {
        id: sid,
        snapshot_date: s.snapshot_date as string,
        snap_label: s.snap_label as string | null,
        snap_time: s.snap_time as string | null,
        total_value: s.total_value as number,
        unrealised_pnl: s.unrealised_pnl as number | null,
        realised_pnl: s.realised_pnl as number | null,
        cash: s.cash as number | null,
        pending: s.pending as number | null,
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
        })),
      }
    })
  )

  const buf = generateExcel(snapshots)
  const label = ((snapshots[0]?.snap_label ?? snapshots[0]?.snapshot_date.slice(0, 10)) ?? 'portfolio').replace(/[^a-z0-9-]/gi, '-')

  return new Response(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="portfolio-${label}.xlsx"`,
    },
  })
}
