import { redirect } from 'next/navigation'
import { verifySession } from '@/lib/session'

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const valid = await verifySession()
  if (!valid) redirect('/login')
  return (
    <div style={{ minHeight: '100vh', background: '#0d1117' }}>
      <nav
        style={{
          background: '#161b22',
          borderBottom: '1px solid #30363d',
          padding: '0 1.5rem',
          height: '52px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '28px', height: '28px', borderRadius: '8px',
              background: 'linear-gradient(135deg, #f0b429 0%, #d4a017 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L8 8H4l4 4-2 6 6-3 6 3-2-6 4-4h-4L12 2z" fill="white" opacity="0.9"/>
            </svg>
          </div>
          <span style={{ color: '#e6edf3', fontWeight: 600, fontSize: '14px' }}>Root OS</span>
        </div>
        <form action="/api/auth/logout" method="POST">
          <button
            type="submit"
            style={{
              background: 'none', border: 'none', color: '#8b949e',
              fontSize: '13px', cursor: 'pointer', padding: '4px 8px',
            }}
          >
            Sign out
          </button>
        </form>
      </nav>
      {children}
    </div>
  )
}
