import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import type { Account } from '@/lib/types'

export async function GET() {
  const result = await db.execute(
    'SELECT * FROM accounts ORDER BY is_active DESC, type, name'
  )
  return Response.json(result.rows as unknown as Account[])
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { name, type, currency = 'SGD' } = body

  if (!name || !type) {
    return Response.json({ error: 'name and type are required' }, { status: 400 })
  }
  const validTypes = ['bank', 'wallet', 'cash', 'fund']
  if (!validTypes.includes(type)) {
    return Response.json({ error: `type must be one of: ${validTypes.join(', ')}` }, { status: 400 })
  }

  const id = crypto.randomUUID()
  const n = new Date().toISOString()

  await db.execute({
    sql: `INSERT INTO accounts (id, name, type, currency, is_active, created_at, updated_at)
          VALUES (?, ?, ?, ?, 1, ?, ?)`,
    args: [id, name, type, currency, n, n],
  })

  const row = await db.execute({ sql: 'SELECT * FROM accounts WHERE id = ?', args: [id] })
  return Response.json(row.rows[0], { status: 201 })
}
