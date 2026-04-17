import { ToastProvider } from './components/toast'
import { WheresMyMoney } from './components/wheres-my-money'
import { RecentTransactions } from './components/recent-transactions'

export const metadata = {
  title: "Where's My Money - Root OS",
}

export default function DashboardPage() {
  return (
    <ToastProvider>
      <main style={{ padding: '1.5rem', maxWidth: '800px', margin: '0 auto' }}>
        <WheresMyMoney />
        <RecentTransactions />
      </main>
    </ToastProvider>
  )
}
