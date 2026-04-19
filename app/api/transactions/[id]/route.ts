import { NextRequest } from 'next/server'
import type { InValue } from '@libsql/client'
import { db } from '@/lib/db'

const UPDATABLE = ['type','amount','currency','fx_rate','fx_date','sgd_equivalent',
                   'account_id','to_account_id','category_id','payee','note','payment_method','datetime']

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()

  const existing = await db.execute({ sql: 'SELECT id FROM transactions WHERE id = ?', args: [id] })
  if (existing.rows.length === 0) {
    return Response.json({ error: 'Transaction not found' }, { status: 404 })
  }

  const updates: string[] = []
  const args: InValue[] = []

  for (const key of UPDATABLE) {
    if (key in body) {
      updates.push(`${key} = ?`)
      args.push(body[key] as InValue)
    }
  }

  if (updates.length === 0 && body.tag_ids === undefined) {
    return Response.json({ error: 'No fields to update' }, { status: 400 })
  }

  const n = new Date().toISOString()

  if (updates.length > 0) {
    updates.push('updated_at = ?')
    args.push(n, id)
    await db.execute({ sql: `UPDATE transactions SET ${updates.join(', ')} WHERE id = ?`, args })
  }

  if (body.tag_ids !== undefined) {
    await db.execute({ sql: 'DELETE FROM transaction_tags WHERE transaction_id = ?', args: [id] })
    for (const tag_id of body.tag_ids) {
      await db.execute({
        sql: 'INSERT OR IGNORE INTO transaction_tags (transaction_id, tag_id) VALUES (?, ?)',
        args: [id, tag_id as string],
      })
    }
  }

  const row = await db.execute({
    sql: `SELECT t.*, a.name as account_name, ta.name as to_account_name, c.name as category_name
          FROM transactions t
          LEFT JOIN accounts a ON t.account_id = a.id
          LEFT JOIN accounts ta ON t.to_account_id = ta.id
          LEFT JOIN categories c ON t.category_id = c.id
          WHERE t.id = ?`,
    args: [id],
  })
  return Response.json(row.rows[0])
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const existing = await db.execute({ sql: 'SELECT id FROM transactions WHERE id = ?', args: [id] })
  if (existing.rows.length === 0) {
    return Response.json({ error: 'Transaction not found' }, { status: 404 })
  }

  await db.execute({ sql: 'DELETE FROM transaction_tags WHERE transaction_id = ?', args: [id] })
  await db.execute({ sql: 'DELETE FROM transactions WHERE id = ?', args: [id] })
  return Response.json({ ok: true })
}
