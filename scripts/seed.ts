import { db } from '../lib/db'

function now() {
  return new Date().toISOString()
}

function uuid() {
  return crypto.randomUUID()
}

async function seed() {
  console.log('Seeding database...')
  const n = now()

  const accounts: Array<{ name: string; type: string; is_active?: number }> = [
    { name: 'UOB One', type: 'bank' },
    { name: 'OCBC', type: 'bank' },
    { name: 'POSB', type: 'bank' },
    { name: 'UOB Savings', type: 'bank' },
    { name: '6674', type: 'bank', is_active: 0 },
    { name: 'Shopee Pay', type: 'wallet' },
    { name: 'GrabPay', type: 'wallet' },
    { name: 'PayPal', type: 'wallet' },
    { name: 'ShopBack', type: 'wallet' },
    { name: 'PandaPay', type: 'wallet' },
    { name: 'Cash', type: 'cash' },
    { name: 'Syfe', type: 'fund' },
    { name: 'Tech Funds', type: 'fund' },
    { name: 'iFunds Annihilator', type: 'fund' },
  ]

  for (const a of accounts) {
    await db.execute({
      sql: `INSERT OR IGNORE INTO accounts (id, name, type, currency, is_active, created_at, updated_at)
            VALUES (?, ?, ?, 'SGD', ?, ?, ?)`,
      args: [uuid(), a.name, a.type, a.is_active ?? 1, n, n],
    })
  }

  const categories: Array<{ name: string; type: string; sort_order: number }> = [
    { name: 'Food', type: 'expense', sort_order: 1 },
    { name: 'Transport', type: 'expense', sort_order: 2 },
    { name: 'Housing', type: 'expense', sort_order: 3 },
    { name: 'Bills', type: 'expense', sort_order: 4 },
    { name: 'Health', type: 'expense', sort_order: 5 },
    { name: 'Entertainment', type: 'expense', sort_order: 6 },
    { name: 'Subscriptions', type: 'expense', sort_order: 7 },
    { name: 'Education', type: 'expense', sort_order: 8 },
    { name: 'Pet', type: 'expense', sort_order: 9 },
    { name: 'Other', type: 'expense', sort_order: 10 },
    { name: 'Salary', type: 'income', sort_order: 1 },
    { name: 'Rental', type: 'income', sort_order: 2 },
    { name: 'Sales', type: 'income', sort_order: 3 },
    { name: 'Refund', type: 'income', sort_order: 4 },
    { name: 'Repayment', type: 'income', sort_order: 5 },
    { name: 'Angpow', type: 'income', sort_order: 6 },
    { name: 'Other Income', type: 'income', sort_order: 7 },
  ]

  for (const c of categories) {
    await db.execute({
      sql: `INSERT OR IGNORE INTO categories (id, name, type, sort_order, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [uuid(), c.name, c.type, c.sort_order, n, n],
    })
  }

  const tagNames = [
    'Coffee', 'Groceries', 'Taxi', 'Gaming', 'Skincare',
    'Carry Stuff', 'Tech', 'JKPP', 'Writing', 'Housing',
    'BB Munkihaus', 'CatHaus', 'Lunch', 'Dinner', 'Breakfast',
  ]

  for (const name of tagNames) {
    await db.execute({
      sql: `INSERT OR IGNORE INTO tags (id, name, created_at) VALUES (?, ?, ?)`,
      args: [uuid(), name, n],
    })
  }

  console.log('Seed complete.')
  process.exit(0)
}

seed().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
