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
      name: 'transactions.status',
      sql: "ALTER TABLE transactions ADD COLUMN status TEXT NOT NULL DEFAULT 'approved'",
    },
    {
      name: 'categories.rename_housing_household',
      sql: "UPDATE categories SET name = 'Household', updated_at = datetime('now') WHERE name = 'Housing'",
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
