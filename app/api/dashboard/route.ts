import { NextRequest } from 'next/server'
import { db } from '@/lib/db'

const VALID_RANGES = ['1d', '7d', '1m', '3m', 'custom', 'daily', '7day', 'monthly'] as const
type Range = (typeof VALID_RANGES)[number]

function getRangeDates(range: Range, start?: string | null, end?: string | null): [string, string, number] {
  const sgt = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Singapore' }))
  const pad = (n: number) => String(n).padStart(2, '0')
  const todayDate = `${sgt.getFullYear()}-${pad(sgt.getMonth() + 1)}-${pad(sgt.getDate())}`

  if (range === '1d' || range === 'daily') {
    return [`${todayDate}T00:00:00+08:00`, `${todayDate}T23:59:59+08:00`, 1]
  }
  if (range === '7d' || range === '7day') {
    const d = new Date(sgt)
    d.setDate(d.getDate() - 6)
    const s = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    return [`${s}T00:00:00+08:00`, `${todayDate}T23:59:59+08:00`, 7]
  }
  if (range === '1m' || range === 'monthly') {
    const s = `${sgt.getFullYear()}-${pad(sgt.getMonth() + 1)}-01`
    const days = sgt.getDate()
    return [`${s}T00:00:00+08:00`, `${todayDate}T23:59:59+08:00`, days]
  }
  if (range === '3m') {
    const d = new Date(sgt)
    d.setMonth(d.getMonth() - 3)
    const s = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    const days = Math.round((sgt.getTime() - d.getTime()) / 86400000) + 1
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

const INCOME_EXPR = `COALESCE(SUM(CASE WHEN type = 'income' THEN CASE WHEN currency = 'SGD' THEN amount ELSE COALESCE(sgd_equivalent, amount) END ELSE 0 END), 0)`
const EXPENSE_EXPR = `COALESCE(SUM(CASE WHEN type = 'expense' THEN CASE WHEN currency = 'SGD' THEN amount ELSE COALESCE(sgd_equivalent, amount) END ELSE 0 END), 0)`
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams
  const range = p.get('range') ?? 'monthly'

  if (!VALID_RANGES.includes(range as Range)) {
    return Response.json({ error: 'range must be daily, 7day, monthly, or custom' }, { status: 400 })
  }

  // Trend endpoint - returns last 6 data points grouped by range context
  if (p.get('trend') === 'true') {
    const sgt = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Singapore' }))
    const pad = (n: number) => String(n).padStart(2, '0')

    let groupExpr: string
    let startStr: string
    let labelFn: (periodKey: string) => string

    if (range === '1d' || range === 'daily') {
      // Last 6 hours (each bar = 1 hour in SGT)
      const startH = new Date(sgt)
      startH.setHours(startH.getHours() - 5)
      startStr = `${startH.getFullYear()}-${pad(startH.getMonth() + 1)}-${pad(startH.getDate())}T${pad(startH.getHours())}:00:00+08:00`
      // strftime + '+8 hours' converts UTC stored datetime to SGT for grouping
      groupExpr = `strftime('%Y-%m-%d %H', datetime, '+8 hours')`
      labelFn = (key) => {
        const hour = parseInt(key.split(' ')[1], 10)
        const h12 = hour % 12 || 12
        return `${h12}${hour < 12 ? 'AM' : 'PM'}`
      }
    } else if (range === '7d' || range === '7day') {
      // Last 6 days (each bar = 1 day in SGT)
      const d = new Date(sgt)
      d.setDate(d.getDate() - 5)
      startStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T00:00:00+08:00`
      groupExpr = `strftime('%Y-%m-%d', datetime, '+8 hours')`
      labelFn = (key) => {
        const [, m, day] = key.split('-').map(Number)
        return `${MONTHS[m - 1]} ${day}`
      }
    } else if (range === '1m' || range === 'monthly') {
      // Last 6 weeks (each bar = 1 week); 2024-01-01 is a Monday, buckets align to Monday starts
      const d = new Date(sgt)
      d.setDate(d.getDate() - 5 * 7)
      startStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T00:00:00+08:00`
      groupExpr = `CAST((julianday(datetime) - julianday('2024-01-01')) / 7 AS INTEGER)`
      const epoch = new Date('2024-01-01T00:00:00Z')
      labelFn = (key) => {
        const weekStart = new Date(epoch)
        weekStart.setUTCDate(epoch.getUTCDate() + parseInt(key, 10) * 7)
        return `${MONTHS[weekStart.getUTCMonth()]} ${weekStart.getUTCDate()}`
      }
    } else if (range === '3m') {
      // Last 6 months (each bar = 1 month)
      const d = new Date(sgt)
      d.setMonth(d.getMonth() - 5)
      d.setDate(1)
      startStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01T00:00:00+08:00`
      groupExpr = `strftime('%Y-%m', datetime, '+8 hours')`
      labelFn = (key) => {
        const [, m] = key.split('-').map(Number)
        return MONTHS[m - 1]
      }
    } else {
      // Custom → last 6 months (each bar = 1 month)
      const d = new Date(sgt)
      d.setMonth(d.getMonth() - 5)
      d.setDate(1)
      startStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01T00:00:00+08:00`
      groupExpr = `strftime('%Y-%m', datetime)`
      labelFn = (key) => {
        const [, m] = key.split('-').map(Number)
        return MONTHS[m - 1]
      }
    }

    let trendResult
    try {
      trendResult = await db.execute({
        sql: `SELECT ${groupExpr} as period_key,
                     ${INCOME_EXPR} as income,
                     ${EXPENSE_EXPR} as expense
              FROM transactions
              WHERE (status IS NULL OR status = 'approved') AND datetime >= ?
              GROUP BY period_key ORDER BY period_key ASC LIMIT 6`,
        args: [startStr],
      })
    } catch {
      trendResult = await db.execute({
        sql: `SELECT ${groupExpr} as period_key,
                     ${INCOME_EXPR} as income,
                     ${EXPENSE_EXPR} as expense
              FROM transactions
              WHERE datetime >= ?
              GROUP BY period_key ORDER BY period_key ASC LIMIT 6`,
        args: [startStr],
      })
    }

    const trend = trendResult.rows.map((r) => ({
      label: labelFn(String(r.period_key)),
      income: Number(r.income),
      expense: Number(r.expense),
    }))
    return Response.json({ trend })
  }

  const [startDate, endDate, daysInRange] = getRangeDates(
    range as Range,
    p.get('start'),
    p.get('end'),
  )

  const parentCategoryId = p.get('parent_category_id')

  const drilldown = p.get('drilldown')
  if (drilldown) {
    const [totalResult, tagResult] = await Promise.all([
      db.execute({
        sql: `SELECT COALESCE(SUM(CASE WHEN t.currency = 'SGD' THEN t.amount ELSE COALESCE(t.sgd_equivalent, t.amount) END), 0) as total
              FROM transactions t
              LEFT JOIN categories c ON t.category_id = c.id
              WHERE t.type = 'expense' AND t.datetime >= ? AND t.datetime <= ? AND c.name = ?
                AND (t.status IS NULL OR t.status = 'approved')`,
        args: [startDate, endDate, drilldown],
      }),
      db.execute({
        sql: `SELECT COALESCE(tg.name, '(untagged)') as tag_name,
                     COALESCE(SUM(CASE WHEN t.currency = 'SGD' THEN t.amount ELSE COALESCE(t.sgd_equivalent, t.amount) END), 0) as total
              FROM transactions t
              LEFT JOIN categories c ON t.category_id = c.id
              LEFT JOIN transaction_tags tt ON t.id = tt.transaction_id
              LEFT JOIN tags tg ON tt.tag_id = tg.id
              WHERE t.type = 'expense' AND t.datetime >= ? AND t.datetime <= ? AND c.name = ?
                AND (t.status IS NULL OR t.status = 'approved')
              GROUP BY tg.id, tg.name
              ORDER BY (tg.id IS NULL), total DESC`,
        args: [startDate, endDate, drilldown],
      }),
    ])

    const categoryTotal = Number(totalResult.rows[0].total)
    const tagBreakdown = tagResult.rows.map((r) => ({
      tag_name: r.tag_name as string,
      total: Number(r.total),
      pct: categoryTotal > 0 ? Math.round((Number(r.total) / categoryTotal) * 1000) / 10 : 0,
    }))

    return Response.json({
      category_name: drilldown,
      total: categoryTotal,
      tag_breakdown: tagBreakdown,
    })
  }

  const catQuerySql = parentCategoryId
    ? `SELECT t.category_id,
              c.name as category_name,
              COALESCE(SUM(CASE WHEN t.currency = 'SGD' THEN t.amount ELSE COALESCE(t.sgd_equivalent, t.amount) END), 0) as total
       FROM transactions t
       LEFT JOIN categories c ON t.category_id = c.id
       WHERE t.type = 'expense' AND t.datetime >= ? AND t.datetime <= ?
         AND c.parent_id = ?
       GROUP BY t.category_id, c.name
       ORDER BY total DESC`
    : `SELECT COALESCE(p.id, c.id) as category_id,
              COALESCE(p.name, c.name) as category_name,
              COALESCE(SUM(CASE WHEN t.currency = 'SGD' THEN t.amount ELSE COALESCE(t.sgd_equivalent, t.amount) END), 0) as total
       FROM transactions t
       LEFT JOIN categories c ON t.category_id = c.id
       LEFT JOIN categories p ON c.parent_id = p.id
       WHERE t.type = 'expense' AND t.datetime >= ? AND t.datetime <= ?
       GROUP BY COALESCE(p.id, c.id), COALESCE(p.name, c.name)
       ORDER BY total DESC`

  const catQueryArgs = parentCategoryId
    ? [startDate, endDate, parentCategoryId]
    : [startDate, endDate]

  let expenseResult, incomeResult, catResult, taggedResult, untaggedResult
  try {
    ;[expenseResult, incomeResult, catResult, taggedResult, untaggedResult] = await Promise.all([
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
        sql: catQuerySql,
        args: catQueryArgs,
      }),
      db.execute({
        sql: `SELECT COALESCE(p.id, c.id) as category_id,
                     COALESCE(p.name, c.name) as category_name,
                     tg.name as tag_name,
                     COALESCE(SUM(CASE WHEN tx.currency = 'SGD' THEN tx.amount ELSE COALESCE(tx.sgd_equivalent, tx.amount) END), 0) as total
              FROM transactions tx
              LEFT JOIN categories c ON tx.category_id = c.id
              LEFT JOIN categories p ON c.parent_id = p.id
              JOIN transaction_tags tt ON tx.id = tt.transaction_id
              JOIN tags tg ON tt.tag_id = tg.id
              WHERE tx.type = 'expense' AND tx.datetime >= ? AND tx.datetime <= ?
                AND (tx.status IS NULL OR tx.status = 'approved')
              GROUP BY COALESCE(p.id, c.id), COALESCE(p.name, c.name), tg.id, tg.name
              ORDER BY total DESC`,
        args: [startDate, endDate],
      }),
      db.execute({
        sql: `SELECT COALESCE(p.id, c.id) as category_id,
                     COALESCE(p.name, c.name) as category_name,
                     'Untagged' as tag_name,
                     COALESCE(SUM(CASE WHEN tx.currency = 'SGD' THEN tx.amount ELSE COALESCE(tx.sgd_equivalent, tx.amount) END), 0) as total
              FROM transactions tx
              LEFT JOIN categories c ON tx.category_id = c.id
              LEFT JOIN categories p ON c.parent_id = p.id
              WHERE tx.type = 'expense' AND tx.datetime >= ? AND tx.datetime <= ?
                AND (tx.status IS NULL OR tx.status = 'approved')
                AND NOT EXISTS (SELECT 1 FROM transaction_tags tt WHERE tt.transaction_id = tx.id)
              GROUP BY COALESCE(p.id, c.id), COALESCE(p.name, c.name)
              HAVING total > 0`,
        args: [startDate, endDate],
      }),
    ])
  } catch {
    // Fallback for databases where the status column migration has not run yet.
    ;[expenseResult, incomeResult, catResult, taggedResult, untaggedResult] = await Promise.all([
      db.execute({
        sql: `SELECT COALESCE(SUM(CASE WHEN currency = 'SGD' THEN amount ELSE COALESCE(sgd_equivalent, amount) END), 0) as total
              FROM transactions
              WHERE type = 'expense' AND datetime >= ? AND datetime <= ?`,
        args: [startDate, endDate],
      }),
      db.execute({
        sql: `SELECT COALESCE(SUM(CASE WHEN currency = 'SGD' THEN amount ELSE COALESCE(sgd_equivalent, amount) END), 0) as total
              FROM transactions
              WHERE type = 'income' AND datetime >= ? AND datetime <= ?`,
        args: [startDate, endDate],
      }),
      db.execute({
        sql: catQuerySql,
        args: catQueryArgs,
      }),
      db.execute({
        sql: `SELECT COALESCE(p.id, c.id) as category_id,
                     COALESCE(p.name, c.name) as category_name,
                     tg.name as tag_name,
                     COALESCE(SUM(CASE WHEN tx.currency = 'SGD' THEN tx.amount ELSE COALESCE(tx.sgd_equivalent, tx.amount) END), 0) as total
              FROM transactions tx
              LEFT JOIN categories c ON tx.category_id = c.id
              LEFT JOIN categories p ON c.parent_id = p.id
              JOIN transaction_tags tt ON tx.id = tt.transaction_id
              JOIN tags tg ON tt.tag_id = tg.id
              WHERE tx.type = 'expense' AND tx.datetime >= ? AND tx.datetime <= ?
              GROUP BY COALESCE(p.id, c.id), COALESCE(p.name, c.name), tg.id, tg.name
              ORDER BY total DESC`,
        args: [startDate, endDate],
      }),
      db.execute({
        sql: `SELECT COALESCE(p.id, c.id) as category_id,
                     COALESCE(p.name, c.name) as category_name,
                     'Untagged' as tag_name,
                     COALESCE(SUM(CASE WHEN tx.currency = 'SGD' THEN tx.amount ELSE COALESCE(tx.sgd_equivalent, tx.amount) END), 0) as total
              FROM transactions tx
              LEFT JOIN categories c ON tx.category_id = c.id
              LEFT JOIN categories p ON c.parent_id = p.id
              WHERE tx.type = 'expense' AND tx.datetime >= ? AND tx.datetime <= ?
                AND NOT EXISTS (SELECT 1 FROM transaction_tags tt WHERE tt.transaction_id = tx.id)
              GROUP BY COALESCE(p.id, c.id), COALESCE(p.name, c.name)
              HAVING total > 0`,
        args: [startDate, endDate],
      }),
    ])
  }

  const totalSpend = Number(expenseResult.rows[0].total)
  const totalIncome = Number(incomeResult.rows[0].total)

  const tagMap = new Map<string, { tag_name: string; total: number }[]>()
  for (const r of [...taggedResult.rows, ...untaggedResult.rows]) {
    const catId = (r.category_id as string | null) ?? '__uncategorised__'
    const arr = tagMap.get(catId) ?? []
    arr.push({ tag_name: r.tag_name as string, total: Number(r.total) })
    tagMap.set(catId, arr)
  }
  for (const arr of tagMap.values()) {
    arr.sort((a, b) => b.total - a.total)
  }

  const categoryBreakdown = catResult.rows.map((r) => ({
    category_id: (r.category_id as string | null) ?? null,
    category_name: (r.category_name as string | null) ?? 'Uncategorised',
    total: Number(r.total),
    pct: totalSpend > 0 ? Math.round((Number(r.total) / totalSpend) * 1000) / 10 : 0,
    tag_breakdown: (() => {
      const catId = (r.category_id as string | null) ?? '__uncategorised__'
      return tagMap.get(catId) ?? []
    })(),
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
  }, { headers: { 'Cache-Control': 'private, max-age=30' } })
}
