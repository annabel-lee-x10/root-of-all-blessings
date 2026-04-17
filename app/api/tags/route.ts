import { NextRequest } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  const result = await db.execute('SELECT * FROM tags ORDER BY name')
  return Response.json(result.rows)
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { name } = body

  if (!name) {
    return Response.json({ error: 'name is required' }, { status: 400 })
  }

  const id = crypto.randomUUID()
  const n = new Date().toISOString()

  await db.execute({
    sql: 'INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?)',
    args: [id, name, n],
  })

  const row = await db.execute({ sql: 'SELECT * FROM tags WHERE id = ?', args: [id] })
  return Response.json(row.rows[0], { status: 201 })
}
