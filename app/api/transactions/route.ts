import { NextRequest } from 'next/server'
import type { InValue } from '@libsql/client'
import { db } from '@/lib/db'
import type { TransactionRow, Tag } from '@/lib/types'

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams
  const page = Math.max(1, parseInt(p.get('page') ?? '1', 10))
  const limit = Math.min(100, Math.max(1, parseInt(p.get('limit') ?? '20', 10)))
  const offset = (page - 1) * limit
  const type = p.get('type')
  const account_id = p.get('account_id')
  const category_id = p.get('category_id')
  const tag_id = p.get('tag_id')
  const start = p.get('start')
  const end = p.get('end')

  const where: string[] = []
  const args: InValue[] = []

  if (type) { where.push('t.type = ?'); args.push(type) }
  if (account_id) { where.push('(t.account_id = ? OR t.to_account_id = ?)'); args.push(account_id, account_id) }
  if (category_id) { where.push('t.category_id = ?'); args.push(category_id) }
  if (start) { where.push('t.datetime >= ?'); args.push(start) }
  if (end) { where.push('t.datetime <= ?'); args.push(end) }
  if (tag_id) {
    where.push('EXISTS (SELECT 1 FROM transaction_tags tt WHERE tt.transaction_id = t.id AND tt.tag_id = ?)')
    args.push(tag_id)
  }

  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''

  const countResult = await db.execute({
    sql: `SELECT COUNT(*) as total FROM transactions t ${whereClause}`,
    args,
  })
  const total = Number(countResult.rows[0].total)

  const txResult = await db.execute({
    sql: `SELECT t.*,
            a.name as account_name,
            ta.name as to_account_name,
            c.name as category_name
          FROM transactions t
          LEFT JOIN accounts a ON t.account_id = a.id
          LEFT JOIN accounts ta ON t.to_account_id = ta.id
          LEFT JOIN categories c ON t.category_id = c.id
          ${whereClause}
          ORDER BY t.datetime DESC
          LIMIT ? OFFSET ?`,
    args: [...args, limit, offset],
  })

  const rows = txResult.rows as unknown as TransactionRow[]

  if (rows.length > 0) {
    const ids = rows.map((r) => r.id)
    const placeholders = ids.map(() => '?').join(',')
    const tagResult = await db.execute({
      sql: `SELECT tt.transaction_id, tg.id, tg.name
            FROM transaction_tags tt
            JOIN tags tg ON tt.tag_id = tg.id
            WHERE tt.transaction_id IN (${placeholders})`,
      args: ids,
    })
    const tagMap = new Map<string, Tag[]>()
    for (const row of tagResult.rows) {
      const txId = row.transaction_id as string
      if (!tagMap.has(txId)) tagMap.set(txId, [])
      tagMap.get(txId)!.push({ id: row.id as string, name: row.name as string, created_at: '' })
    }
    for (const row of rows) {
      row.tags = tagMap.get(row.id) ?? []
    }
  }

  return Response.json({ data: rows, total, page, limit })
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const {
    type, amount, currency = 'SGD', fx_rate = null, fx_date = null,
    account_id, to_account_id = null, category_id = null,
    payee = null, note = null, payment_method = null, datetime, tag_ids = [],
  } = body

  if (!type || amount == null || !account_id || !datetime) {
    return Response.json({ error: 'type, amount, account_id, and datetime are required' }, { status: 400 })
  }
  if (!['expense', 'income', 'transfer'].includes(type)) {
    return Response.json({ error: 'type must be expense, income, or transfer' }, { status: 400 })
  }

  const fromAcct = await db.execute({
    sql: 'SELECT id FROM accounts WHERE id = ? AND is_active = 1',
    args: [account_id],
  })
  if (fromAcct.rows.length === 0) {
    return Response.json({ error: 'account_id does not exist or is inactive' }, { status: 400 })
  }

  if (type === 'transfer') {
    if (!to_account_id) {
      return Response.json({ error: 'to_account_id is required for transfers' }, { status: 400 })
    }
    const toAcct = await db.execute({
      sql: 'SELECT id FROM accounts WHERE id = ? AND is_active = 1',
      args: [to_account_id],
    })
    if (toAcct.rows.length === 0) {
      return Response.json({ error: 'to_account_id does not exist or is inactive' }, { status: 400 })
    }
  }

  const sgd_equivalent = currency !== 'SGD' && fx_rate != null ? amount * fx_rate : null
  const id = crypto.randomUUID()
  const n = new Date().toISOString()

  await db.execute({
    sql: `INSERT INTO transactions
            (id, type, amount, currency, fx_rate, fx_date, sgd_equivalent,
             account_id, to_account_id, category_id, payee, note, payment_method, datetime, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [id, type, amount, currency, fx_rate, fx_date, sgd_equivalent,
           account_id, to_account_id, category_id, payee, note, payment_method, datetime, n, n],
  })

  for (const tag_id of tag_ids) {
    await db.execute({
      sql: 'INSERT OR IGNORE INTO transaction_tags (transaction_id, tag_id) VALUES (?, ?)',
      args: [id, tag_id],
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
  return Response.json(row.rows[0], { status: 201 })
}
