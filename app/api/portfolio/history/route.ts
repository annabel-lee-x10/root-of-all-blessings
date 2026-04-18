import { db } from '@/lib/db'

export async function GET() {
  const result = await db.execute(
    `SELECT id, snapshot_date, total_value, total_pnl, created_at
     FROM portfolio_snapshots ORDER BY snapshot_date ASC`
  )
  return Response.json(result.rows)
}
