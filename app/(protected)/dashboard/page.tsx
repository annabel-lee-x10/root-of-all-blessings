import { ExpenseDashboard } from '../components/expense-dashboard'
import { DashboardEntry } from '../components/dashboard-entry'
import { DraftsCard } from '../components/drafts-card'
import { RecentTransactions } from '../components/recent-transactions'

export const metadata = {
  title: "Dashboard - Root OS",
}

export default function DashboardPage() {
  return (
    <main style={{ padding: '1.5rem', maxWidth: '800px', margin: '0 auto' }}>
      <ExpenseDashboard />
      <DashboardEntry />
      <DraftsCard />
      <RecentTransactions />
    </main>
  )
}
