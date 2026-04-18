import { NextRequest } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  const result = await db.execute(
    `SELECT id, brief_date, content_json, created_at
     FROM news_briefs ORDER BY brief_date DESC LIMIT 1`
  )
  if (result.rows.length === 0) return Response.json(null)
  return Response.json(result.rows[0])
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { brief_date, content } = body

  if (!content || typeof content !== 'object') {
    return Response.json({ error: 'content object is required' }, { status: 400 })
  }

  const id = crypto.randomUUID()
  const date = brief_date || new Date().toISOString().slice(0, 10)
  const now = new Date().toISOString()

  await db.execute({
    sql: `INSERT INTO news_briefs (id, brief_date, content_json, created_at) VALUES (?, ?, ?, ?)`,
    args: [id, date, JSON.stringify(content), now],
  })

  return Response.json({ id, brief_date: date }, { status: 201 })
}
