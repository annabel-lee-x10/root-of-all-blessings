import { NextRequest } from 'next/server'
import { db } from '@/lib/db'

export async function GET(request?: NextRequest) {
  const snapshotId = request?.nextUrl?.searchParams.get('snapshot_id') ?? null

  let result
  if (snapshotId) {
    result = await db.execute({
      sql: `SELECT id, ticker, geo, type, price, qty, currency, placed, current_price, note, new_flag, status, created_at
            FROM portfolio_orders WHERE snapshot_id = ? ORDER BY created_at DESC`,
      args: [snapshotId],
    })
  } else {
    result = await db.execute(
      `SELECT id, ticker, geo, type, price, qty, currency, placed, current_price, note, new_flag, status, created_at
       FROM portfolio_orders WHERE status = 'open' ORDER BY created_at DESC`
    )
  }
  return Response.json(result.rows)
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { ticker, geo = 'US', type, price, qty, currency = 'USD', placed, current_price, note, new_flag = false } = body

  if (!ticker || price === undefined || price === null) {
    return Response.json({ error: 'ticker and price are required' }, { status: 400 })
  }

  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  await db.execute({
    sql: `INSERT INTO portfolio_orders (id, ticker, geo, type, price, qty, currency, placed, current_price, note, new_flag, status, created_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    args: [id, ticker, geo, type ?? 'SELL LIMIT', price, qty ?? 1, currency,
           placed ?? now, current_price ?? null, note ?? null, new_flag ? 1 : 0, 'open', now],
  })

  return Response.json({ id, ticker, geo, type, price, qty, currency, placed, current_price, note, new_flag, status: 'open' }, { status: 201 })
}
