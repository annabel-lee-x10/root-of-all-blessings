import { NextRequest } from 'next/server'
import { db } from '@/lib/db'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const existing = await db.execute({ sql: 'SELECT id FROM portfolio_realised WHERE id = ?', args: [id] })
  if (existing.rows.length === 0) return Response.json({ error: 'Not found' }, { status: 404 })

  await db.execute({ sql: 'DELETE FROM portfolio_realised WHERE id = ?', args: [id] })
  return new Response(null, { status: 204 })
}
