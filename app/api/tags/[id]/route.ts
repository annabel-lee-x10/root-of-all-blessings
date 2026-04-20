import { NextRequest } from 'next/server'
import { db } from '@/lib/db'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()

  const existing = await db.execute({ sql: 'SELECT id FROM tags WHERE id = ?', args: [id] })
  if (existing.rows.length === 0) {
    return Response.json({ error: 'Tag not found' }, { status: 404 })
  }

  const updates: string[] = []
  const args: (string | null)[] = []

  if (typeof body.name === 'string') {
    if (!body.name.trim()) return Response.json({ error: 'name cannot be empty' }, { status: 400 })
    updates.push('name = ?')
    args.push(body.name.trim())
  }
  if ('category_id' in body) {
    updates.push('category_id = ?')
    args.push(body.category_id as string | null)
  }

  if (updates.length === 0) {
    return Response.json({ error: 'nothing to update' }, { status: 400 })
  }

  args.push(id)
  await db.execute({ sql: `UPDATE tags SET ${updates.join(', ')} WHERE id = ?`, args })

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

  await db.execute({ sql: 'DELETE FROM transaction_tags WHERE tag_id = ?', args: [id] })
  await db.execute({ sql: 'DELETE FROM tags WHERE id = ?', args: [id] })
  return Response.json({ ok: true })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()

  if (body.action !== 'merge' || !body.into_id) {
    return Response.json({ error: 'body must have action="merge" and into_id' }, { status: 400 })
  }

  const intoId = body.into_id as string
  if (id === intoId) return Response.json({ error: 'cannot merge a tag into itself' }, { status: 400 })

  const [fromRes, intoRes] = await Promise.all([
    db.execute({ sql: 'SELECT id FROM tags WHERE id = ?', args: [id] }),
    db.execute({ sql: 'SELECT id FROM tags WHERE id = ?', args: [intoId] }),
  ])
  if (fromRes.rows.length === 0) return Response.json({ error: 'Tag not found' }, { status: 404 })
  if (intoRes.rows.length === 0) return Response.json({ error: 'Target tag not found' }, { status: 404 })

  // Drop rows where the transaction already has the target tag (avoid unique conflict)
  await db.execute({
    sql: 'DELETE FROM transaction_tags WHERE tag_id = ? AND transaction_id IN (SELECT transaction_id FROM transaction_tags WHERE tag_id = ?)',
    args: [id, intoId],
  })
  // Reassign remaining rows
  await db.execute({
    sql: 'UPDATE transaction_tags SET tag_id = ? WHERE tag_id = ?',
    args: [intoId, id],
  })
  // Delete the source tag
  await db.execute({ sql: 'DELETE FROM tags WHERE id = ?', args: [id] })

  return Response.json({ ok: true })
}
