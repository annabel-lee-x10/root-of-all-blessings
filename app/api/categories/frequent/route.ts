import { NextRequest } from 'next/server'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  const type = request.nextUrl.searchParams.get('type') ?? 'expense'
  const days = parseInt(request.nextUrl.searchParams.get('days') ?? '30', 10)
  const limit = parseInt(request.nextUrl.searchParams.get('limit') ?? '5', 10)

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  const result = await db.execute({
    sql: `
      SELECT c.id, c.name, c.type, c.parent_id, c.sort_order, c.created_at, c.updated_at,
             COUNT(t.id) AS tx_count
      FROM categories c
      JOIN transactions t ON t.category_id = c.id
      WHERE c.type = ?
        AND (t.status IS NULL OR t.status = 'approved')
        AND t.datetime >= ?
      GROUP BY c.id
      ORDER BY tx_count DESC
      LIMIT ?
    `,
    args: [type, since, limit],
  })

  return Response.json(result.rows)
}
