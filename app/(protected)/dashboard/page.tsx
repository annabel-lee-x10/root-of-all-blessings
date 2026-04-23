import { db } from '@/lib/db'
import type { Account, Category, Tag } from '@/lib/types'
import { ExpenseDashboard } from '../components/expense-dashboard'
import { DraftsCard } from '../components/drafts-card'
import { RecentTransactions } from '../components/recent-transactions'

export const metadata = {
  title: "Dashboard - Root OS",
}

export default async function DashboardPage() {
  const [accountsRes, categoriesRes, tagsRes] = await Promise.all([
    db.execute('SELECT * FROM accounts ORDER BY is_active DESC, type, name'),
    db.execute('SELECT * FROM categories ORDER BY type, sort_order, name'),
    db.execute('SELECT * FROM tags ORDER BY name'),
  ])

  const accounts = accountsRes.rows as unknown as Account[]
  const categories = categoriesRes.rows as unknown as Category[]
  const tags = tagsRes.rows as unknown as Tag[]

  return (
    <main style={{ padding: '1.5rem', maxWidth: '800px', margin: '0 auto' }}>
      <ExpenseDashboard />
      <DraftsCard accounts={accounts} categories={categories} tags={tags} />
      <RecentTransactions accounts={accounts} categories={categories} tags={tags} />
    </main>
  )
}
