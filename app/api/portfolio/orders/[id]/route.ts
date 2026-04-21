import { NextRequest } from 'next/server'
import { db } from '@/lib/db'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()

  const existing = await db.execute({ sql: 'SELECT id FROM portfolio_orders WHERE id = ?', args: [id] })
  if (existing.rows.length === 0) return Response.json({ error: 'Not found' }, { status: 404 })

  const fields: string[] = []
  const args: unknown[] = []
  if (body.current_price !== undefined) { fields.push('current_price = ?'); args.push(body.current_price) }
  if (body.status !== undefined)        { fields.push('status = ?');        args.push(body.status) }
  if (body.price !== undefined)         { fields.push('price = ?');         args.push(body.price) }
  if (body.note !== undefined)          { fields.push('note = ?');          args.push(body.note) }

  if (fields.length === 0) return Response.json({ error: 'No fields to update' }, { status: 400 })

  args.push(id)
  await db.execute({ sql: `UPDATE portfolio_orders SET ${fields.join(', ')} WHERE id = ?`, args })

  const updated = await db.execute({ sql: 'SELECT * FROM portfolio_orders WHERE id = ?', args: [id] })
  return Response.json(updated.rows[0])
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const existing = await db.execute({ sql: 'SELECT id FROM portfolio_orders WHERE id = ?', args: [id] })
  if (existing.rows.length === 0) return Response.json({ error: 'Not found' }, { status: 404 })

  await db.execute({ sql: 'DELETE FROM portfolio_orders WHERE id = ?', args: [id] })
  return new Response(null, { status: 204 })
}
