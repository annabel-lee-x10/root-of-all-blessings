import { NextRequest } from 'next/server'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  const type = request.nextUrl.searchParams.get('type')
  const sql = type
    ? 'SELECT * FROM categories WHERE type = ? ORDER BY sort_order, name'
    : 'SELECT * FROM categories ORDER BY type, sort_order, name'
  const args = type ? [type] : []
  const result = await db.execute({ sql, args })
  return Response.json(result.rows, {
    headers: { 'Cache-Control': 'private, max-age=30' },
  })
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { name, type, sort_order = 0, parent_id = null } = body

  if (!name || !type) {
    return Response.json({ error: 'name and type are required' }, { status: 400 })
  }
  if (!['expense', 'income'].includes(type)) {
    return Response.json({ error: 'type must be expense or income' }, { status: 400 })
  }

  if (parent_id != null) {
    const parentRow = await db.execute({
      sql: 'SELECT id FROM categories WHERE id = ?',
      args: [parent_id],
    })
    if (parentRow.rows.length === 0) {
      return Response.json({ error: 'parent_id does not reference a valid category' }, { status: 400 })
    }
  }

  const id = crypto.randomUUID()
  const n = new Date().toISOString()

  try {
    await db.execute({
      sql: `INSERT INTO categories (id, name, type, sort_order, parent_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [id, name, type, sort_order, parent_id, n, n],
    })
  } catch (err: unknown) {
    // Migration pending: parent_id column not yet added — insert without it so
    // the category is still created. Run /api/migrate to add the column and then
    // set the parent relationship via PATCH.
    if (!String(err).includes('parent_id')) throw err
    await db.execute({
      sql: `INSERT INTO categories (id, name, type, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
      args: [id, name, type, sort_order, n, n],
    })
  }

  const row = await db.execute({ sql: 'SELECT * FROM categories WHERE id = ?', args: [id] })
  return Response.json(row.rows[0], { status: 201 })
}
