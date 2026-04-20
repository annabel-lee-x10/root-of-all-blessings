import { WheresMyMoney } from './components/wheres-my-money'
import { ReceiptDropzone } from './components/receipt-dropzone'
import { ExpenseDashboard } from './components/expense-dashboard'
import { RecentTransactions } from './components/recent-transactions'
import { DraftsCard } from './components/drafts-card'

export const metadata = {
  title: "Where's My Money - Root OS",
}

export default function DashboardPage() {
  return (
    <main style={{ padding: '1.5rem', maxWidth: '800px', margin: '0 auto' }}>
      <WheresMyMoney />
      <ReceiptDropzone />
      <ExpenseDashboard />
      <DraftsCard />
      <RecentTransactions />
    </main>
  )
}
