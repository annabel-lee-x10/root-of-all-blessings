import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import type { TransactionRow } from '@/lib/types'

interface CloneBody {
  type?: 'expense' | 'income' | 'transfer'
  amount?: number
  currency?: string
  fx_rate?: number | null
  fx_date?: string | null
  sgd_equivalent?: number | null
  account_id?: string
  to_account_id?: string | null
  category_id?: string | null
  payee?: string | null
  note?: string | null
  payment_method?: string | null
  datetime?: string
  tag_ids?: string[]
}

export async function POST(request: NextRequest) {
  let body: CloneBody
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.type || !['expense', 'income', 'transfer'].includes(body.type)) {
    return Response.json({ error: 'type is required' }, { status: 400 })
  }
  if (typeof body.amount !== 'number') {
    return Response.json({ error: 'amount is required' }, { status: 400 })
  }
  if (!body.account_id) {
    return Response.json({ error: 'account_id is required' }, { status: 400 })
  }
  if (!body.datetime) {
    return Response.json({ error: 'datetime is required' }, { status: 400 })
  }

  const id = crypto.randomUUID()
  const n = new Date().toISOString()

  await db.execute({
    sql: `INSERT INTO transactions
            (id, type, amount, currency, fx_rate, fx_date, sgd_equivalent,
             account_id, to_account_id, category_id, payee, note, payment_method,
             status, datetime, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)`,
    args: [
      id,
      body.type,
      body.amount,
      body.currency ?? 'SGD',
      body.fx_rate ?? null,
      body.fx_date ?? null,
      body.sgd_equivalent ?? null,
      body.account_id,
      body.to_account_id ?? null,
      body.category_id ?? null,
      body.payee ?? null,
      body.note ?? null,
      body.payment_method ?? null,
      body.datetime,
      n, n,
    ],
  })

  for (const tagId of body.tag_ids ?? []) {
    await db.execute({
      sql: 'INSERT OR IGNORE INTO transaction_tags (transaction_id, tag_id) VALUES (?, ?)',
      args: [id, tagId],
    })
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
  const tagRows = await db.execute({
    sql: `SELECT tt.tag_id as id, tg.name
          FROM transaction_tags tt
          JOIN tags tg ON tt.tag_id = tg.id
          WHERE tt.transaction_id = ?`,
    args: [id],
  })

  const result = {
    ...row.rows[0],
    tags: tagRows.rows.map((r) => ({ id: r.id as string, name: r.name as string, created_at: '' })),
  } as unknown as TransactionRow

  return Response.json(result, { status: 201 })
}
