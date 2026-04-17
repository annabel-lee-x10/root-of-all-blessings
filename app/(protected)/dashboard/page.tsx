import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Dashboard - Root OS',
}

export default function DashboardPage() {
  return (
    <main className="min-h-screen flex items-center justify-center" style={{ background: '#0d1117' }}>
      <div className="text-center">
        <div
          className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-6"
          style={{ background: 'linear-gradient(135deg, #f0b429 0%, #d4a017 100%)' }}
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L8 8H4l4 4-2 6 6-3 6 3-2-6 4-4h-4L12 2z" fill="white" opacity="0.9"/>
          </svg>
        </div>
        <h1 className="text-2xl font-semibold mb-2" style={{ color: '#e6edf3' }}>
          Root OS
        </h1>
        <p style={{ color: '#8b949e' }}>Dashboard coming soon</p>
        <form action="/api/auth/logout" method="POST" className="mt-8">
          <button
            type="submit"
            className="px-4 py-2 rounded-lg text-sm transition-colors"
            style={{
              background: '#21262d',
              color: '#8b949e',
              border: '1px solid #30363d',
            }}
          >
            Sign out
          </button>
        </form>
      </div>
    </main>
  )
}
