import { db } from '@/lib/db'
import type { TransactionRow } from '@/lib/types'

export async function resolveAccount(accountId?: string): Promise<string | null> {
  if (accountId) {
    const check = await db.execute({
      sql: 'SELECT id FROM accounts WHERE id = ? AND is_active = 1',
      args: [accountId],
    })
    if (check.rows.length > 0) return accountId
    // Stale or deactivated ID — fall through to first active account
  }
  const fallback = await db.execute({
    sql: 'SELECT id FROM accounts WHERE is_active = 1 ORDER BY updated_at DESC LIMIT 1',
    args: [],
  })
  if (fallback.rows.length === 0) return null
  return fallback.rows[0].id as string
}

export async function resolveTagIds(tagNames: string[]): Promise<string[]> {
  const ids: string[] = []
  for (const name of tagNames) {
    const existing = await db.execute({
      sql: 'SELECT id FROM tags WHERE LOWER(name) = LOWER(?)',
      args: [name],
    })
    if (existing.rows.length > 0) {
      ids.push(existing.rows[0].id as string)
    } else {
      const newId = crypto.randomUUID()
      await db.execute({
        sql: 'INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?)',
        args: [newId, name, new Date().toISOString()],
      })
      ids.push(newId)
    }
  }
  return ids
}

export async function insertDraftTransaction(opts: {
  accountId: string
  categoryId: string | null
  payee: string | null
  note: string | null
  paymentMethod: string | null
  amount: number
  currency: string
  datetime: string
  tagIds: string[]
}): Promise<TransactionRow> {
  const id = crypto.randomUUID()
  const n = new Date().toISOString()
  await db.execute({
    sql: `INSERT INTO transactions
            (id, type, amount, currency, fx_rate, fx_date, sgd_equivalent,
             account_id, to_account_id, category_id, payee, note, payment_method,
             status, datetime, created_at, updated_at)
          VALUES (?, 'expense', ?, ?, NULL, NULL, NULL, ?, NULL, ?, ?, ?, ?, 'draft', ?, ?, ?)`,
    args: [
      id,
      opts.amount,
      opts.currency,
      opts.accountId,
      opts.categoryId,
      opts.payee,
      opts.note,
      opts.paymentMethod,
      opts.datetime,
      n, n,
    ],
  })
  for (const tagId of opts.tagIds) {
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
  return {
    ...row.rows[0],
    tags: tagRows.rows.map((r) => ({ id: r.id as string, name: r.name as string, created_at: '' })),
  } as unknown as TransactionRow
}
