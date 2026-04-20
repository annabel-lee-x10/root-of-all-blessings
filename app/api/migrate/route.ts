import { verifySession } from '@/lib/session'
import { db } from '@/lib/db'

export async function POST() {
  const valid = await verifySession()
  if (!valid) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const results: Record<string, string> = {}

  const migrations: Array<{ name: string; sql: string }> = [
    {
      name: 'transactions.payment_method',
      sql: 'ALTER TABLE transactions ADD COLUMN payment_method TEXT',
    },
    {
      name: 'news_briefs.tickers',
      sql: 'ALTER TABLE news_briefs ADD COLUMN tickers TEXT',
    },
    {
      name: 'delete-vallow-account',
      sql: "DELETE FROM accounts WHERE LOWER(name) = 'vallow'",
    },
  ]

  for (const m of migrations) {
    try {
      await db.execute(m.sql)
      results[m.name] = 'added'
    } catch {
      results[m.name] = 'already exists'
    }
  }

  return Response.json({ ok: true, migrations: results })
}
