import { NextRequest } from 'next/server'
import { db } from '@/lib/db'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { date, tags = [], text, sort_order = 0 } = body

  if (!text) {
    return Response.json({ error: 'text is required' }, { status: 400 })
  }

  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  await db.execute({
    sql: 'INSERT INTO portfolio_milestones (id, date, tags_json, text, sort_order, created_at) VALUES (?,?,?,?,?,?)',
    args: [id, date ?? now.slice(0, 10), JSON.stringify(tags), text, sort_order, now],
  })

  return Response.json({ id, date, tags, text, sort_order }, { status: 201 })
}
