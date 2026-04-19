import { NextRequest } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  const result = await db.execute(
    `SELECT id, content_json AS brief_json, created_at AS generated_at, tickers
     FROM news_briefs ORDER BY created_at DESC LIMIT 1`
  )
  if (result.rows.length === 0) return Response.json(null)
  return Response.json(result.rows[0])
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { brief_json, tickers } = body

  if (!brief_json || typeof brief_json !== 'object' || Array.isArray(brief_json)) {
    return Response.json({ error: 'brief_json must be a non-array object' }, { status: 400 })
  }

  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const date = now.slice(0, 10)

  await db.execute({
    sql: `INSERT INTO news_briefs (id, brief_date, content_json, created_at, tickers) VALUES (?, ?, ?, ?, ?)`,
    args: [
      id,
      date,
      JSON.stringify(brief_json),
      now,
      Array.isArray(tickers) ? JSON.stringify(tickers) : null,
    ],
  })

  return Response.json({ id, generated_at: now }, { status: 201 })
}
