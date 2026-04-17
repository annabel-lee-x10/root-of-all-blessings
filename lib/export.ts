import type { InValue } from '@libsql/client'
import { db } from './db'
import type { TransactionRow, ExportFilters } from './types'

export async function fetchExportData(filters: ExportFilters): Promise<TransactionRow[]> {
  const where: string[] = []
  const args: InValue[] = []

  if (filters.type) { where.push('t.type = ?'); args.push(filters.type) }
  if (filters.account_id) { where.push('(t.account_id = ? OR t.to_account_id = ?)'); args.push(filters.account_id, filters.account_id) }
  if (filters.category_id) { where.push('t.category_id = ?'); args.push(filters.category_id) }
  if (filters.start) { where.push('t.datetime >= ?'); args.push(filters.start) }
  if (filters.end) { where.push('t.datetime <= ?'); args.push(filters.end) }
  if (filters.tag_id) {
    where.push('EXISTS (SELECT 1 FROM transaction_tags tt WHERE tt.transaction_id = t.id AND tt.tag_id = ?)')
    args.push(filters.tag_id)
  }

  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''

  const result = await db.execute({
    sql: `SELECT t.*,
            a.name as account_name,
            ta.name as to_account_name,
            c.name as category_name
          FROM transactions t
          LEFT JOIN accounts a ON t.account_id = a.id
          LEFT JOIN accounts ta ON t.to_account_id = ta.id
          LEFT JOIN categories c ON t.category_id = c.id
          ${whereClause}
          ORDER BY t.datetime DESC`,
    args,
  })

  const rows = result.rows as unknown as TransactionRow[]

  if (rows.length > 0) {
    const ids = rows.map((r) => r.id)
    const placeholders = ids.map(() => '?').join(',')
    const tagResult = await db.execute({
      sql: `SELECT tt.transaction_id, tg.name
            FROM transaction_tags tt
            JOIN tags tg ON tt.tag_id = tg.id
            WHERE tt.transaction_id IN (${placeholders})`,
      args: ids,
    })
    const tagMap = new Map<string, string[]>()
    for (const row of tagResult.rows) {
      const txId = row.transaction_id as string
      if (!tagMap.has(txId)) tagMap.set(txId, [])
      tagMap.get(txId)!.push(row.name as string)
    }
    for (const row of rows) {
      row.tags = (tagMap.get(row.id) ?? []).map((name) => ({ id: '', name, created_at: '' }))
    }
  }

  return rows
}

export function toCsvString(rows: TransactionRow[]): string {
  const headers = [
    'datetime', 'type', 'amount', 'currency', 'sgd_equivalent',
    'fx_rate', 'fx_date', 'account', 'to_account', 'category',
    'payee', 'note', 'tags',
  ]

  const escape = (v: unknown): string => {
    if (v == null) return ''
    const s = String(v)
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`
    }
    return s
  }

  const lines = [headers.join(',')]
  for (const row of rows) {
    lines.push([
      escape(row.datetime),
      escape(row.type),
      escape(row.amount),
      escape(row.currency),
      escape(row.sgd_equivalent),
      escape(row.fx_rate),
      escape(row.fx_date),
      escape(row.account_name),
      escape(row.to_account_name),
      escape(row.category_name),
      escape(row.payee),
      escape(row.note),
      escape(row.tags?.map((t) => t.name).join('; ')),
    ].join(','))
  }
  return lines.join('\n')
}

export async function toXlsxBuffer(rows: TransactionRow[]): Promise<Buffer> {
  const XLSX = await import('xlsx')
  const data = rows.map((row) => ({
    Datetime: row.datetime,
    Type: row.type,
    Amount: row.amount,
    Currency: row.currency,
    'SGD Equivalent': row.sgd_equivalent ?? '',
    'FX Rate': row.fx_rate ?? '',
    'FX Date': row.fx_date ?? '',
    Account: row.account_name,
    'To Account': row.to_account_name ?? '',
    Category: row.category_name ?? '',
    Payee: row.payee ?? '',
    Note: row.note ?? '',
    Tags: row.tags?.map((t) => t.name).join('; ') ?? '',
  }))
  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Transactions')
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))
}
