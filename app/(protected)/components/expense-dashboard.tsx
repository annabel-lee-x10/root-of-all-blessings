'use client'

import { useState, useEffect, useCallback } from 'react'

type Range = 'daily' | '7day' | 'monthly' | 'custom'

interface CategoryEntry {
  category_name: string
  total: number
  pct: number
}

interface DashboardData {
  total_spend: number
  total_income: number
  daily_average: number
  category_breakdown: CategoryEntry[]
  days_in_range: number
  budget_remaining: number | null
  range: string
  start_date: string
  end_date: string
}

const RANGES: { id: Range; label: string }[] = [
  { id: 'daily', label: 'Daily' },
  { id: '7day', label: '7-day' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'custom', label: 'Custom' },
]

function fmt(n: number) {
  return n.toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const card: React.CSSProperties = {
  background: 'var(--bg-secondary)',
  border: '1px solid var(--border)',
  borderRadius: '10px',
  padding: '1rem',
}

const labelStyle: React.CSSProperties = {
  color: 'var(--text-muted)',
  fontSize: '11px',
  fontWeight: 600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  marginBottom: '4px',
}

const valueStyle: React.CSSProperties = {
  color: 'var(--text)',
  fontSize: '22px',
  fontWeight: 700,
  letterSpacing: '-0.5px',
}

export function ExpenseDashboard() {
  const [range, setRange] = useState<Range>('monthly')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      let url = `/api/dashboard?range=${range}`
      if (range === 'custom' && customStart && customEnd) {
        url += `&start=${encodeURIComponent(customStart + 'T00:00:00+08:00')}&end=${encodeURIComponent(customEnd + 'T23:59:59+08:00')}`
      }
      const res = await fetch(url)
      if (!res.ok) throw new Error('Failed')
      setData(await res.json())
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [range, customStart, customEnd])

  useEffect(() => {
    if (range === 'custom' && (!customStart || !customEnd)) return
    load()
  }, [load, range, customStart, customEnd])

  useEffect(() => {
    const handler = () => load()
    window.addEventListener('transaction-saved', handler)
    return () => window.removeEventListener('transaction-saved', handler)
  }, [load])

  return (
    <section style={{ marginBottom: '2rem' }}>
      <div
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '1.25rem 1.5rem',
        }}
      >
        {/* Header + range selector */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '8px' }}>
          <h2 style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', margin: 0 }}>
            Expense Dashboard
          </h2>
          <div style={{ display: 'flex', gap: '4px' }}>
            {RANGES.map((r) => (
              <button
                key={r.id}
                role="button"
                aria-pressed={range === r.id ? 'true' : 'false'}
                onClick={() => setRange(r.id)}
                style={{
                  padding: '4px 10px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  border: range === r.id ? '1px solid var(--accent)' : '1px solid var(--border)',
                  background: range === r.id ? 'rgba(240,180,41,0.12)' : 'transparent',
                  color: range === r.id ? 'var(--accent)' : 'var(--text-muted)',
                }}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* Custom date pickers */}
        {range === 'custom' && (
          <div style={{ display: 'flex', gap: '8px', marginBottom: '1rem' }}>
            <div style={{ flex: 1 }}>
              <label htmlFor="dash-start" style={{ ...labelStyle, display: 'block', marginBottom: '4px' }}>Start date</label>
              <input
                id="dash-start"
                aria-label="Start date"
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                style={{
                  background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px',
                  color: 'var(--text)', padding: '6px 10px', fontSize: '13px', width: '100%',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label htmlFor="dash-end" style={{ ...labelStyle, display: 'block', marginBottom: '4px' }}>End date</label>
              <input
                id="dash-end"
                aria-label="End date"
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                style={{
                  background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px',
                  color: 'var(--text)', padding: '6px 10px', fontSize: '13px', width: '100%',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>
        )}

        {error && (
          <p style={{ color: '#f85149', fontSize: '13px', textAlign: 'center', padding: '1rem 0' }}>
            Failed to load dashboard data - please refresh
          </p>
        )}

        {!error && (
          <>
            {/* Widgets row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', marginBottom: '1rem' }}>
              <div style={card}>
                <div style={labelStyle}>Total Spend</div>
                <div style={{ ...valueStyle, color: loading ? 'var(--text-subtle)' : '#f85149' }}>
                  {loading ? '...' : fmt(data?.total_spend ?? 0)}
                </div>
                <div style={{ color: 'var(--text-subtle)', fontSize: '11px', marginTop: '2px' }}>SGD</div>
              </div>

              <div style={card}>
                <div style={labelStyle}>Income</div>
                <div style={{ ...valueStyle, color: loading ? 'var(--text-subtle)' : '#3fb884' }}>
                  {loading ? '...' : fmt(data?.total_income ?? 0)}
                </div>
                <div style={{ color: 'var(--text-subtle)', fontSize: '11px', marginTop: '2px' }}>SGD</div>
              </div>

              <div style={card}>
                <div style={labelStyle}>Daily Avg</div>
                <div style={{ ...valueStyle, color: loading ? 'var(--text-subtle)' : 'var(--text)' }}>
                  {loading ? '...' : fmt(data?.daily_average ?? 0)}
                </div>
                <div style={{ color: 'var(--text-subtle)', fontSize: '11px', marginTop: '2px' }}>SGD / day</div>
              </div>

              <div style={card}>
                <div style={labelStyle}>Budget</div>
                <div style={{ ...valueStyle, color: 'var(--text-subtle)', fontSize: '18px' }}>
                  {loading ? '...' : (data?.budget_remaining != null ? fmt(data.budget_remaining) : '-')}
                </div>
                <div style={{ color: 'var(--text-subtle)', fontSize: '11px', marginTop: '2px' }}>not configured</div>
              </div>
            </div>

            {/* Category breakdown */}
            {!loading && data && data.category_breakdown.length > 0 && (
              <div>
                <div style={{ ...labelStyle, marginBottom: '8px' }}>Category Breakdown</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {data.category_breakdown.slice(0, 6).map((cat) => (
                    <div key={cat.category_name} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ color: 'var(--text)', fontSize: '13px', minWidth: '100px' }}>{cat.category_name}</span>
                      <div style={{ flex: 1, background: 'var(--bg-muted)', borderRadius: '4px', height: '6px', overflow: 'hidden' }}>
                        <div style={{ width: `${Math.min(100, cat.pct)}%`, height: '100%', background: 'var(--accent)', borderRadius: '4px' }} />
                      </div>
                      <span style={{ color: 'var(--text-muted)', fontSize: '12px', minWidth: '48px', textAlign: 'right' }}>
                        {fmt(cat.total)}
                      </span>
                      <span style={{ color: 'var(--text-subtle)', fontSize: '11px', minWidth: '38px', textAlign: 'right' }}>
                        {cat.pct.toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}
