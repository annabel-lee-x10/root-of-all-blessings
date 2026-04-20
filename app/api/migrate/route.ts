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
    {
      name: 'tags.category_id',
      sql: 'ALTER TABLE tags ADD COLUMN category_id TEXT REFERENCES categories(id) ON DELETE SET NULL',
    },
    {
      name: 'categories.parent_id',
      sql: 'ALTER TABLE categories ADD COLUMN parent_id TEXT REFERENCES categories(id) ON DELETE SET NULL',
    },
    {
      name: 'tags.drop_category_id',
      sql: 'ALTER TABLE tags DROP COLUMN category_id',
    },
    {
      name: 'accounts.delete_vallow',
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

  // ── Category hierarchy ──────────────────────────────────────────────────────
  // Idempotent: INSERT OR IGNORE skips existing names; UPDATE ... WHERE parent_id IS NULL
  // is skipped on subsequent runs once relationships are set.
  try {
    const now = new Date().toISOString()

    const parents: Array<{ name: string; type: string }> = [
      { name: 'Food',                    type: 'expense' },
      { name: 'Lifestyle',               type: 'expense' },
      { name: 'Other',                   type: 'expense' },
      { name: 'Entertainment',           type: 'expense' },
      { name: 'Travel',                  type: 'expense' },
      { name: 'Wellness and Health',     type: 'expense' },
      { name: 'Living',                  type: 'expense' },
      { name: 'Income',                  type: 'income'  },
      { name: 'Repayments',              type: 'income'  },
      { name: 'Business Education Work', type: 'expense' },
    ]

    for (const p of parents) {
      await db.execute({
        sql: `INSERT OR IGNORE INTO categories (id, name, type, sort_order, created_at, updated_at)
              VALUES (lower(hex(randomblob(16))), ?, ?, 99, ?, ?)`,
        args: [p.name, p.type, now, now],
      })
    }

    const hierarchy: Record<string, string[]> = {
      'Food':                    ['Groceries', 'Hawker', 'Cafe', 'Dining', 'Snacks', 'Alcohol', 'Coffee'],
      'Lifestyle':               ['Electronics', 'Shopping', 'Apparel', 'Delivery', 'Gifts'],
      'Other':                   ['Charity'],
      'Entertainment':           ['Netflix', 'Spotify'],
      'Travel':                  ['Taxi', 'Grab', 'Transport', 'MRT'],
      'Wellness and Health':     ['Fitness', 'Gym', 'Sports', 'Medical', 'Health', 'Dental', 'Supplements'],
      'Living':                  ['Household', 'Home Maintenance', 'Internet', 'Mobile', 'Utilities', 'Insurance', 'Electricity', 'Mortgage', 'Rent', 'Aircon Service', 'Pet'],
      'Income':                  ['Salary', 'Dividends', 'Interest', 'Freelance'],
      'Repayments':              ['Cashback'],
      'Business Education Work': ['Software', 'Books', 'Courses', 'Claude'],
    }

    // Determine type for each child from its parent
    const childType: Record<string, string> = {}
    for (const p of parents) {
      for (const child of hierarchy[p.name] ?? []) {
        childType[child] = p.type
      }
    }

    // Insert missing child categories
    for (const children of Object.values(hierarchy)) {
      for (const name of children) {
        await db.execute({
          sql: `INSERT OR IGNORE INTO categories (id, name, type, sort_order, created_at, updated_at)
                VALUES (lower(hex(randomblob(16))), ?, ?, 99, ?, ?)`,
          args: [name, childType[name], now, now],
        })
      }
    }

    // Set parent_id on each child (only where not already set — idempotent)
    for (const [parentName, children] of Object.entries(hierarchy)) {
      for (const childName of children) {
        await db.execute({
          sql: `UPDATE categories
                SET parent_id = (SELECT id FROM categories WHERE name = ?),
                    updated_at = ?
                WHERE name = ? AND parent_id IS NULL`,
          args: [parentName, now, childName],
        })
      }
    }

    results['categories.hierarchy'] = 'ok'
  } catch (err) {
    results['categories.hierarchy'] = `error: ${err}`
  }

  return Response.json({ ok: true, migrations: results })
}
