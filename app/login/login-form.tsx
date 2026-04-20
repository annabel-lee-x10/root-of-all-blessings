'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

export function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [isDark, setIsDark] = useState(true)

  useEffect(() => {
    const saved = localStorage.getItem('theme') as 'dark' | 'light' | null
    if (saved) setIsDark(saved === 'dark')
  }, [])

  useEffect(() => {
    const theme = isDark ? 'dark' : 'light'
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [isDark])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Login failed')
        return
      }

      const from = searchParams.get('from') ?? '/'
      router.push(from)
      router.refresh()
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4"
      style={{ background: 'var(--bg)' }}
    >
      {/* Theme toggle */}
      <button
        onClick={() => setIsDark((d) => !d)}
        className="fixed top-4 right-4 p-2 rounded-lg transition-colors"
        style={{
          background: 'var(--bg-muted)',
          color: 'var(--text-muted)',
          border: '1px solid var(--border)',
        }}
        aria-label="Toggle theme"
      >
        {isDark ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 3v1m0 16v1M4.22 4.22l.71.71m14.14 14.14.71.71M3 12H2m20 0h-1M4.22 19.78l.71-.71M18.36 5.64l.71-.71M16 12a4 4 0 11-8 0 4 4 0 018 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none"/>
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
          </svg>
        )}
      </button>

      {/* Card */}
      <div
        className="w-full max-w-sm rounded-xl p-8"
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          boxShadow: isDark
            ? '0 8px 32px rgba(0,0,0,0.4)'
            : '0 8px 32px rgba(0,0,0,0.08)',
        }}
      >
        {/* Branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-4"
            style={{ background: 'linear-gradient(135deg, #f0b429 0%, #d4a017 100%)' }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L8 8H4l4 4-2 6 6-3 6 3-2-6 4-4h-4L12 2z" fill="white" opacity="0.9"/>
            </svg>
          </div>
          <h1
            className="text-xl font-semibold tracking-tight"
            style={{ color: 'var(--text)' }}
          >
            Root OS
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            Root of All Blessings
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium mb-2"
              style={{ color: 'var(--text-muted)' }}
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              autoComplete="current-password"
              autoFocus
              className="w-full px-3 py-2.5 rounded-lg text-sm outline-none transition-all"
              style={{
                background: 'var(--bg)',
                border: `1px solid ${error ? '#f85149' : 'var(--border)'}`,
                color: 'var(--text)',
              }}
              onFocus={(e) => {
                e.target.style.border = `1px solid ${error ? '#f85149' : 'var(--accent)'}`
              }}
              onBlur={(e) => {
                e.target.style.border = `1px solid ${error ? '#f85149' : 'var(--border)'}`
              }}
            />
          </div>

          {error && (
            <p className="text-sm" style={{ color: '#f85149' }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full py-2.5 px-4 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2"
            style={{
              background: loading || !password ? 'var(--bg-muted)' : 'var(--accent)',
              color: loading || !password ? 'var(--text-subtle)' : 'var(--bg)',
              cursor: loading || !password ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? (
              <>
                <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25"/>
                  <path d="M12 2a10 10 0 0110 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
                </svg>
                Signing in...
              </>
            ) : (
              'Sign in'
            )}
          </button>
        </form>
      </div>

      <p className="mt-6 text-xs" style={{ color: 'var(--text-subtle)' }}>
        Personal finance tracker
      </p>
    </div>
  )
}
