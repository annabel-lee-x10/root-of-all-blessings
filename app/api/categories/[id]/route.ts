import { NextRequest } from 'next/server'
import type { InValue } from '@libsql/client'
import { db } from '@/lib/db'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()
  const { name, type, sort_order } = body

  const existing = await db.execute({ sql: 'SELECT id FROM categories WHERE id = ?', args: [id] })
  if (existing.rows.length === 0) {
    return Response.json({ error: 'Category not found' }, { status: 404 })
  }

  const n = new Date().toISOString()
  const updates: string[] = []
  const args: InValue[] = []

  if (name !== undefined) { updates.push('name = ?'); args.push(name) }
  if (type !== undefined) { updates.push('type = ?'); args.push(type) }
  if (sort_order !== undefined) { updates.push('sort_order = ?'); args.push(sort_order) }

  if (updates.length === 0) {
    return Response.json({ error: 'No fields to update' }, { status: 400 })
  }

  updates.push('updated_at = ?')
  args.push(n, id)

  await db.execute({ sql: `UPDATE categories SET ${updates.join(', ')} WHERE id = ?`, args })

  const row = await db.execute({ sql: 'SELECT * FROM categories WHERE id = ?', args: [id] })
  return Response.json(row.rows[0])
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const existing = await db.execute({ sql: 'SELECT id FROM categories WHERE id = ?', args: [id] })
  if (existing.rows.length === 0) {
    return Response.json({ error: 'Category not found' }, { status: 404 })
  }

  await db.execute({ sql: 'DELETE FROM categories WHERE id = ?', args: [id] })
  return Response.json({ ok: true })
}
