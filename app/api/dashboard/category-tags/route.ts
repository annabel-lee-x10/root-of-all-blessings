import { NextRequest } from 'next/server'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams
  const categoryId = p.get('category_id') || null
  const start = p.get('start')
  const end = p.get('end')

  if (!start || !end) {
    return Response.json({ error: 'start and end are required' }, { status: 400 })
  }

  const categoryFilter = categoryId ? 'category_id = ?' : 'category_id IS NULL'
  const baseArgs = categoryId ? [start, end, categoryId] : [start, end]

  const [totalResult, taggedResult, untaggedResult] = await Promise.all([
    db.execute({
      sql: `SELECT COALESCE(SUM(CASE WHEN currency = 'SGD' THEN amount ELSE COALESCE(sgd_equivalent, amount) END), 0) as total
            FROM transactions
            WHERE type = 'expense' AND datetime >= ? AND datetime <= ? AND ${categoryFilter}`,
      args: baseArgs,
    }),
    db.execute({
      sql: `SELECT tg.name as tag_name,
                   COALESCE(SUM(CASE WHEN t.currency = 'SGD' THEN t.amount ELSE COALESCE(t.sgd_equivalent, t.amount) END), 0) as total
            FROM transactions t
            JOIN transaction_tags tt ON t.id = tt.transaction_id
            JOIN tags tg ON tt.tag_id = tg.id
            WHERE t.type = 'expense' AND t.datetime >= ? AND t.datetime <= ? AND t.${categoryFilter}
            GROUP BY tg.id, tg.name
            ORDER BY total DESC`,
      args: baseArgs,
    }),
    db.execute({
      sql: `SELECT COALESCE(SUM(CASE WHEN t.currency = 'SGD' THEN t.amount ELSE COALESCE(t.sgd_equivalent, t.amount) END), 0) as total
            FROM transactions t
            WHERE t.type = 'expense' AND t.datetime >= ? AND t.datetime <= ? AND t.${categoryFilter}
              AND NOT EXISTS (SELECT 1 FROM transaction_tags tt WHERE tt.transaction_id = t.id)`,
      args: baseArgs,
    }),
  ])

  const categoryTotal = Number(totalResult.rows[0].total)
  const untaggedTotal = Number(untaggedResult.rows[0].total)

  const tagBreakdown = taggedResult.rows.map((r) => ({
    tag_name: r.tag_name as string,
    total: Number(r.total),
    pct: categoryTotal > 0 ? Math.round((Number(r.total) / categoryTotal) * 1000) / 10 : 0,
  }))

  if (untaggedTotal > 0) {
    tagBreakdown.push({
      tag_name: 'Untagged',
      total: untaggedTotal,
      pct: categoryTotal > 0 ? Math.round((untaggedTotal / categoryTotal) * 1000) / 10 : 0,
    })
  }

  return Response.json({
    tag_breakdown: tagBreakdown,
    total: categoryTotal,
    start_date: start,
    end_date: end,
  })
}
