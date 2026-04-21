import { NextRequest } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  const [scoresRes, milestonesRes] = await Promise.all([
    db.execute('SELECT id, dimension, score, label, level, items_json, next_text, created_at FROM portfolio_growth WHERE snapshot_id IS NULL ORDER BY dimension'),
    db.execute('SELECT id, date, tags_json, text, sort_order, created_at FROM portfolio_milestones WHERE snapshot_id IS NULL ORDER BY sort_order ASC'),
  ])

  const scores = scoresRes.rows.map(r => ({
    ...r,
    items: JSON.parse(r.items_json as string) as string[],
    items_json: undefined,
  }))

  const milestones = milestonesRes.rows.map(r => ({
    ...r,
    tags: JSON.parse(r.tags_json as string) as string[],
    tags_json: undefined,
  }))

  return Response.json({ scores, milestones })
}

export async function PUT(request: NextRequest) {
  const body = await request.json()
  const { dimension, score, label, level, items = [], next_text } = body

  if (!dimension) {
    return Response.json({ error: 'dimension is required' }, { status: 400 })
  }

  const now = new Date().toISOString()

  const existing = await db.execute({
    sql: 'SELECT id FROM portfolio_growth WHERE dimension = ? AND snapshot_id IS NULL LIMIT 1',
    args: [dimension],
  })

  if (existing.rows.length > 0) {
    await db.execute({
      sql: `UPDATE portfolio_growth SET score = ?, label = ?, level = ?, items_json = ?, next_text = ?, created_at = ?
            WHERE dimension = ? AND snapshot_id IS NULL`,
      args: [score ?? 0, label ?? '', level ?? '', JSON.stringify(items), next_text ?? null, now, dimension],
    })
  } else {
    await db.execute({
      sql: `INSERT INTO portfolio_growth (id, snapshot_id, dimension, score, label, level, items_json, next_text, created_at)
            VALUES (?,NULL,?,?,?,?,?,?,?)`,
      args: [crypto.randomUUID(), dimension, score ?? 0, label ?? '', level ?? '', JSON.stringify(items), next_text ?? null, now],
    })
  }

  return Response.json({ dimension, score, label, level, items, next_text })
}
