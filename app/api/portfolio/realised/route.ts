import { NextRequest } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  const result = await db.execute(
    'SELECT id, ticker, pnl, note, trade_date, created_at FROM portfolio_realised ORDER BY created_at ASC'
  )
  return Response.json(result.rows)
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { ticker, pnl, note, trade_date } = body

  if (!ticker || pnl === undefined || pnl === null) {
    return Response.json({ error: 'ticker and pnl are required' }, { status: 400 })
  }

  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  await db.execute({
    sql: 'INSERT INTO portfolio_realised (id, ticker, pnl, note, trade_date, created_at) VALUES (?,?,?,?,?,?)',
    args: [id, ticker, pnl, note ?? null, trade_date ?? null, now],
  })

  return Response.json({ id, ticker, pnl, note: note ?? null, trade_date: trade_date ?? null }, { status: 201 })
}
