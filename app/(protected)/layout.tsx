import { redirect } from 'next/navigation'
import { verifySession } from '@/lib/session'

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const valid = await verifySession()
  if (!valid) redirect('/login')
  return <>{children}</>
}
