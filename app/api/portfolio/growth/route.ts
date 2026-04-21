import { NextRequest } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  const [scoresRes, milestonesRes] = await Promise.all([
    db.execute('SELECT dimension, score, label, level, items_json, next_action, updated_at FROM portfolio_growth ORDER BY dimension'),
    db.execute('SELECT id, date, tags_json, text, sort_order, created_at FROM portfolio_milestones ORDER BY sort_order ASC'),
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
  const { dimension, score, label, level, items = [], next_action } = body

  if (!dimension) {
    return Response.json({ error: 'dimension is required' }, { status: 400 })
  }

  const now = new Date().toISOString()

  await db.execute({
    sql: `INSERT INTO portfolio_growth (dimension, score, label, level, items_json, next_action, updated_at)
          VALUES (?,?,?,?,?,?,?)
          ON CONFLICT(dimension) DO UPDATE SET
            score = excluded.score, label = excluded.label, level = excluded.level,
            items_json = excluded.items_json, next_action = excluded.next_action, updated_at = excluded.updated_at`,
    args: [dimension, score ?? 0, label ?? '', level ?? '', JSON.stringify(items), next_action ?? null, now],
  })

  return Response.json({ dimension, score, label, level, items, next_action })
}
