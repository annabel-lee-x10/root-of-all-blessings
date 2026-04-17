import { NextRequest } from 'next/server'
import { db } from '@/lib/db'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()
  const { name } = body

  if (!name) return Response.json({ error: 'name is required' }, { status: 400 })

  const existing = await db.execute({ sql: 'SELECT id FROM tags WHERE id = ?', args: [id] })
  if (existing.rows.length === 0) {
    return Response.json({ error: 'Tag not found' }, { status: 404 })
  }

  await db.execute({ sql: 'UPDATE tags SET name = ? WHERE id = ?', args: [name, id] })

  const row = await db.execute({ sql: 'SELECT * FROM tags WHERE id = ?', args: [id] })
  return Response.json(row.rows[0])
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const existing = await db.execute({ sql: 'SELECT id FROM tags WHERE id = ?', args: [id] })
  if (existing.rows.length === 0) {
    return Response.json({ error: 'Tag not found' }, { status: 404 })
  }

  await db.execute({ sql: 'DELETE FROM tags WHERE id = ?', args: [id] })
  return Response.json({ ok: true })
}
