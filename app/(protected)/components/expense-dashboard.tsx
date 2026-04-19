'use client'

import { useState, useEffect, useCallback } from 'react'

type Range = 'daily' | '7day' | 'monthly' | 'custom'

interface CategoryEntry {
  category_id: string | null
  category_name: string
  total: number
  pct: number
}

interface TagEntry {
  tag_name: string
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

interface DrilldownData {
  tag_breakdown: TagEntry[]
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
  background: '#1c2128',
  border: '1px solid #30363d',
  borderRadius: '10px',
  padding: '1rem',
}

const labelStyle: React.CSSProperties = {
  color: '#8b949e',
  fontSize: '11px',
  fontWeight: 600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  marginBottom: '4px',
}

const valueStyle: React.CSSProperties = {
  color: '#e6edf3',
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
  const [drilldown, setDrilldown] = useState<{ id: string; name: string } | null>(null)
  const [drillData, setDrillData] = useState<TagEntry[] | null>(null)
  const [drillLoading, setDrillLoading] = useState(false)

  const buildBaseUrl = useCallback(() => {
    let url = `/api/dashboard?range=${range}`
    if (range === 'custom' && customStart && customEnd) {
      url += `&start=${encodeURIComponent(customStart + 'T00:00:00+08:00')}&end=${encodeURIComponent(customEnd + 'T23:59:59+08:00')}`
    }
    return url
  }, [range, customStart, customEnd])

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const res = await fetch(buildBaseUrl())
      if (!res.ok) throw new Error('Failed')
      setData(await res.json())
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [buildBaseUrl])

  useEffect(() => {
    if (range === 'custom' && (!customStart || !customEnd)) return
    load()
  }, [load, range, customStart, customEnd])

  useEffect(() => {
    const handler = () => load()
    window.addEventListener('transaction-saved', handler)
    return () => window.removeEventListener('transaction-saved', handler)
  }, [load])

  const handleCategoryClick = useCallback(async (cat: CategoryEntry) => {
    if (!cat.category_id) return
    setDrilldown({ id: cat.category_id, name: cat.category_name })
    setDrillLoading(true)
    setDrillData(null)
    try {
      const res = await fetch(`${buildBaseUrl()}&drilldown=${cat.category_id}`)
      if (!res.ok) throw new Error('Failed')
      const d: DrilldownData = await res.json()
      setDrillData(d.tag_breakdown)
    } catch {
      setDrillData([])
    } finally {
      setDrillLoading(false)
    }
  }, [buildBaseUrl])

  const handleBack = useCallback(() => {
    setDrilldown(null)
    setDrillData(null)
  }, [])

  return (
    <section style={{ marginBottom: '2rem' }}>
      <div
        style={{
          background: '#161b22',
          border: '1px solid #30363d',
          borderRadius: '12px',
          padding: '1.25rem 1.5rem',
        }}
      >
        {/* Header + range selector */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '8px' }}>
          <h2 style={{ color: '#8b949e', fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', margin: 0 }}>
            Expense Dashboard
          </h2>
          <div style={{ display: 'flex', gap: '4px' }}>
            {RANGES.map((r) => (
              <button
                key={r.id}
                role="button"
                aria-pressed={range === r.id ? 'true' : 'false'}
                onClick={() => { setRange(r.id); setDrilldown(null); setDrillData(null) }}
                style={{
                  padding: '4px 10px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  border: range === r.id ? '1px solid #f0b429' : '1px solid #30363d',
                  background: range === r.id ? 'rgba(240,180,41,0.12)' : 'transparent',
                  color: range === r.id ? '#f0b429' : '#8b949e',
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
                  background: '#0d1117', border: '1px solid #30363d', borderRadius: '6px',
                  color: '#e6edf3', padding: '6px 10px', fontSize: '13px', width: '100%',
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
                  background: '#0d1117', border: '1px solid #30363d', borderRadius: '6px',
                  color: '#e6edf3', padding: '6px 10px', fontSize: '13px', width: '100%',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>
        )}

        {error && (
          <p style={{ color: '#f85149', fontSize: '13px', textAlign: 'center', padding: '1rem 0' }}>
            Failed to load dashboard data — please refresh
          </p>
        )}

        {!error && (
          <>
            {/* Widgets row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', marginBottom: '1rem' }}>
              <div style={card}>
                <div style={labelStyle}>Total Spend</div>
                <div style={{ ...valueStyle, color: loading ? '#484f58' : '#f85149' }}>
                  {loading ? '…' : fmt(data?.total_spend ?? 0)}
                </div>
                <div style={{ color: '#484f58', fontSize: '11px', marginTop: '2px' }}>SGD</div>
              </div>

              <div style={card}>
                <div style={labelStyle}>Income</div>
                <div style={{ ...valueStyle, color: loading ? '#484f58' : '#3fb884' }}>
                  {loading ? '…' : fmt(data?.total_income ?? 0)}
                </div>
                <div style={{ color: '#484f58', fontSize: '11px', marginTop: '2px' }}>SGD</div>
              </div>

              <div style={card}>
                <div style={labelStyle}>Daily Avg</div>
                <div style={{ ...valueStyle, color: loading ? '#484f58' : '#e6edf3' }}>
                  {loading ? '…' : fmt(data?.daily_average ?? 0)}
                </div>
                <div style={{ color: '#484f58', fontSize: '11px', marginTop: '2px' }}>SGD / day</div>
              </div>

              <div style={card}>
                <div style={labelStyle}>Budget</div>
                <div style={{ ...valueStyle, color: '#484f58', fontSize: '18px' }}>
                  {loading ? '…' : (data?.budget_remaining != null ? fmt(data.budget_remaining) : '—')}
                </div>
                <div style={{ color: '#484f58', fontSize: '11px', marginTop: '2px' }}>not configured</div>
              </div>
            </div>

            {/* Category breakdown / drilldown */}
            {!loading && data && data.category_breakdown.length > 0 && (
              <div>
                {drilldown ? (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                      <button
                        aria-label="Back"
                        onClick={handleBack}
                        style={{
                          background: 'none',
                          border: '1px solid #30363d',
                          borderRadius: '6px',
                          color: '#8b949e',
                          cursor: 'pointer',
                          fontSize: '12px',
                          padding: '2px 8px',
                        }}
                      >
                        ← Back
                      </button>
                      <span style={{ ...labelStyle, marginBottom: 0 }}>{drilldown.name} — by tag</span>
                    </div>

                    {drillLoading && (
                      <div
                        role="status"
                        aria-label="Loading"
                        style={{ display: 'flex', justifyContent: 'center', padding: '1rem 0' }}
                      >
                        <div style={{
                          width: '20px', height: '20px',
                          border: '2px solid #30363d',
                          borderTopColor: '#f0b429',
                          borderRadius: '50%',
                          animation: 'spin 0.7s linear infinite',
                        }} />
                      </div>
                    )}

                    {!drillLoading && drillData && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {drillData.length === 0 && (
                          <p style={{ color: '#484f58', fontSize: '13px', textAlign: 'center', padding: '0.5rem 0' }}>
                            No tagged transactions
                          </p>
                        )}
                        {drillData.map((tag) => (
                          <div key={tag.tag_name} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ color: '#e6edf3', fontSize: '13px', minWidth: '100px' }}>{tag.tag_name}</span>
                            <div style={{ flex: 1, background: '#21262d', borderRadius: '4px', height: '6px', overflow: 'hidden' }}>
                              <div style={{ width: `${Math.min(100, tag.pct)}%`, height: '100%', background: '#58a6ff', borderRadius: '4px' }} />
                            </div>
                            <span style={{ color: '#8b949e', fontSize: '12px', minWidth: '48px', textAlign: 'right' }}>
                              {fmt(tag.total)}
                            </span>
                            <span style={{ color: '#484f58', fontSize: '11px', minWidth: '38px', textAlign: 'right' }}>
                              {tag.pct.toFixed(1)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div style={{ ...labelStyle, marginBottom: '8px' }}>Category Breakdown</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {data.category_breakdown.slice(0, 6).map((cat) => (
                        <button
                          key={cat.category_name}
                          aria-label={cat.category_name}
                          onClick={() => handleCategoryClick(cat)}
                          disabled={!cat.category_id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            background: 'none',
                            border: 'none',
                            borderRadius: '4px',
                            padding: '2px 4px',
                            cursor: cat.category_id ? 'pointer' : 'default',
                            textAlign: 'left',
                            width: '100%',
                            transition: 'background 0.1s',
                          }}
                          onMouseEnter={(e) => { if (cat.category_id) (e.currentTarget as HTMLElement).style.background = '#21262d' }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'none' }}
                        >
                          <span style={{ color: '#e6edf3', fontSize: '13px', minWidth: '100px' }}>{cat.category_name}</span>
                          <div style={{ flex: 1, background: '#21262d', borderRadius: '4px', height: '6px', overflow: 'hidden' }}>
                            <div style={{ width: `${Math.min(100, cat.pct)}%`, height: '100%', background: '#f0b429', borderRadius: '4px' }} />
                          </div>
                          <span style={{ color: '#8b949e', fontSize: '12px', minWidth: '48px', textAlign: 'right' }}>
                            {fmt(cat.total)}
                          </span>
                          <span style={{ color: '#484f58', fontSize: '11px', minWidth: '38px', textAlign: 'right' }}>
                            {cat.pct.toFixed(1)}%
                          </span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}
