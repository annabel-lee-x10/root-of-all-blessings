import { NextRequest } from 'next/server'
import { db } from '@/lib/db'

const VALID_RANGES = ['daily', '7day', 'monthly', 'custom'] as const
type Range = (typeof VALID_RANGES)[number]

function getRangeDates(range: Range, start?: string | null, end?: string | null): [string, string, number] {
  const sgt = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Singapore' }))
  const pad = (n: number) => String(n).padStart(2, '0')
  const todayDate = `${sgt.getFullYear()}-${pad(sgt.getMonth() + 1)}-${pad(sgt.getDate())}`

  if (range === 'daily') {
    return [`${todayDate}T00:00:00+08:00`, `${todayDate}T23:59:59+08:00`, 1]
  }
  if (range === '7day') {
    const d = new Date(sgt)
    d.setDate(d.getDate() - 6)
    const s = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    return [`${s}T00:00:00+08:00`, `${todayDate}T23:59:59+08:00`, 7]
  }
  if (range === 'monthly') {
    const s = `${sgt.getFullYear()}-${pad(sgt.getMonth() + 1)}-01`
    const days = sgt.getDate()
    return [`${s}T00:00:00+08:00`, `${todayDate}T23:59:59+08:00`, days]
  }
  // custom
  const s = start ?? `${todayDate}T00:00:00+08:00`
  const e = end ?? `${todayDate}T23:59:59+08:00`
  const startDay = s.split('T')[0]
  const endDay = e.split('T')[0]
  const startMs = new Date(startDay + 'T00:00:00Z').getTime()
  const endMs = new Date(endDay + 'T00:00:00Z').getTime()
  const days = Math.max(1, Math.round((endMs - startMs) / 86400000) + 1)
  return [s, e, days]
}

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams
  const range = p.get('range') ?? 'monthly'

  if (!VALID_RANGES.includes(range as Range)) {
    return Response.json({ error: 'range must be daily, 7day, monthly, or custom' }, { status: 400 })
  }

  const [startDate, endDate, daysInRange] = getRangeDates(
    range as Range,
    p.get('start'),
    p.get('end'),
  )

  const [expenseResult, incomeResult, catResult] = await Promise.all([
    db.execute({
      sql: `SELECT COALESCE(SUM(CASE WHEN currency = 'SGD' THEN amount ELSE COALESCE(sgd_equivalent, amount) END), 0) as total
            FROM transactions
            WHERE type = 'expense' AND datetime >= ? AND datetime <= ?
              AND (status IS NULL OR status = 'approved')`,
      args: [startDate, endDate],
    }),
    db.execute({
      sql: `SELECT COALESCE(SUM(CASE WHEN currency = 'SGD' THEN amount ELSE COALESCE(sgd_equivalent, amount) END), 0) as total
            FROM transactions
            WHERE type = 'income' AND datetime >= ? AND datetime <= ?
              AND (status IS NULL OR status = 'approved')`,
      args: [startDate, endDate],
    }),
    db.execute({
      sql: `SELECT c.name as category_name,
                   COALESCE(SUM(CASE WHEN t.currency = 'SGD' THEN t.amount ELSE COALESCE(t.sgd_equivalent, t.amount) END), 0) as total
            FROM transactions t
            LEFT JOIN categories c ON t.category_id = c.id
            WHERE t.type = 'expense' AND t.datetime >= ? AND t.datetime <= ?
              AND (t.status IS NULL OR t.status = 'approved')
            GROUP BY t.category_id, c.name
            ORDER BY total DESC`,
      args: [startDate, endDate],
    }),
  ])

  const totalSpend = Number(expenseResult.rows[0].total)
  const totalIncome = Number(incomeResult.rows[0].total)

  const categoryBreakdown = catResult.rows.map((r) => ({
    category_name: (r.category_name as string | null) ?? 'Uncategorised',
    total: Number(r.total),
    pct: totalSpend > 0 ? Math.round((Number(r.total) / totalSpend) * 1000) / 10 : 0,
  }))

  return Response.json({
    total_spend: totalSpend,
    total_income: totalIncome,
    daily_average: daysInRange > 0 ? Math.round((totalSpend / daysInRange) * 100) / 100 : 0,
    category_breakdown: categoryBreakdown,
    days_in_range: daysInRange,
    budget_remaining: null,
    range,
    start_date: startDate,
    end_date: endDate,
  })
}
