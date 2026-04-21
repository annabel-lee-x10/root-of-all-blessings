import { NextRequest } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  const result = await db.execute(
    'SELECT id, key, value, note, trade_date, created_at FROM portfolio_realised WHERE snapshot_id IS NULL ORDER BY created_at ASC'
  )
  return Response.json(result.rows)
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { key, value, note, trade_date } = body

  if (!key || value === undefined || value === null) {
    return Response.json({ error: 'key and value are required' }, { status: 400 })
  }

  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  await db.execute({
    sql: 'INSERT INTO portfolio_realised (id, snapshot_id, key, value, note, trade_date, created_at) VALUES (?,NULL,?,?,?,?,?)',
    args: [id, key, value, note ?? null, trade_date ?? null, now],
  })

  return Response.json({ id, key, value, note: note ?? null, trade_date: trade_date ?? null }, { status: 201 })
}
