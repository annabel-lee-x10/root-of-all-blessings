import { redirect } from 'next/navigation'
import { verifySession } from '@/lib/session'
import { NavBar } from './components/nav-bar'
import { ToastProvider } from './components/toast'

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const valid = await verifySession()
  if (!valid) redirect('/login')
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <NavBar />
      <ToastProvider>
        {children}
      </ToastProvider>
    </div>
  )
}
