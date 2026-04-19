'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

type Range = 'daily' | '7day' | 'monthly' | 'custom'

interface TagBreakdownEntry {
  tag_name: string
  total: number
}

interface CategoryEntry {
  category_name: string
  total: number
  pct: number
  tag_breakdown: TagBreakdownEntry[]
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

interface TrendPoint {
  label: string
  income: number
  expense: number
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

const labelStyle: React.CSSProperties = {
  color: '#8b949e',
  fontSize: '10px',
  fontWeight: 600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  marginBottom: '2px',
}

function SavingsGauge({ income, expense, loading }: { income: number; expense: number; loading: boolean }) {
  const r = 90
  const cx = 100
  const cy = 110

  const savingsPct = income > 0 ? ((income - expense) / income) * 100 : null
  const displayPct = savingsPct !== null ? Math.round(savingsPct) : null

  const color =
    savingsPct === null ? '#484f58'
    : savingsPct > 20 ? '#3fb884'
    : savingsPct > 10 ? '#f0b429'
    : '#f85149'

  const progress = savingsPct !== null ? Math.max(0, Math.min(100, savingsPct)) : 0
  const endAngle = Math.PI * (1 - progress / 100)
  const ex = cx + r * Math.cos(endAngle)
  const ey = cy - r * Math.sin(endAngle)
  const largeArc = progress > 50 ? 1 : 0

  return (
    <div style={{ textAlign: 'center', padding: '0.25rem 0 0' }}>
      <svg viewBox="0 0 200 120" style={{ width: '100%', maxWidth: '200px', display: 'block', margin: '0 auto', overflow: 'visible' }}>
        <path
          d="M 10,110 A 90,90 0 0,1 190,110"
          fill="none" stroke="#21262d" strokeWidth="14" strokeLinecap="round"
        />
        {!loading && progress > 0 && (
          <path
            d={`M 10,110 A 90,90 0 ${largeArc},1 ${ex.toFixed(2)},${ey.toFixed(2)}`}
            fill="none" stroke={color} strokeWidth="14" strokeLinecap="round"
          />
        )}
        {loading ? (
          <text x="100" y="90" textAnchor="middle" fill="#484f58" fontSize="26" fontWeight="700" fontFamily="inherit">
            …
          </text>
        ) : displayPct !== null ? (
          <>
            <text x="100" y="86" textAnchor="middle" fill={color} fontSize="30" fontWeight="700" fontFamily="inherit">
              {displayPct}%
            </text>
            <text x="100" y="104" textAnchor="middle" fill="#484f58" fontSize="11" fontFamily="inherit">
              {displayPct < 0 ? 'deficit' : 'saved'}
            </text>
          </>
        ) : (
          <text x="100" y="90" textAnchor="middle" fill="#484f58" fontSize="13" fontFamily="inherit">
            no income
          </text>
        )}
      </svg>
    </div>
  )
}

export function ExpenseDashboard() {
  const [range, setRange] = useState<Range>('monthly')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null)

  const [showTrend, setShowTrend] = useState(false)
  const [trendData, setTrendData] = useState<TrendPoint[]>([])
  const [trendLoading, setTrendLoading] = useState(false)
  const trendRangeRef = useRef<Range | null>(null)

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

  const loadTrend = useCallback(async (r: Range) => {
    setTrendLoading(true)
    try {
      const res = await fetch(`/api/dashboard?trend=true&range=${r}`)
      const d = await res.json()
      setTrendData(d.trend ?? [])
      trendRangeRef.current = r
    } catch {
      setTrendData([])
    } finally {
      setTrendLoading(false)
    }
  }, [])

  useEffect(() => {
    if (range === 'custom' && (!customStart || !customEnd)) return
    load()
  }, [load, range, customStart, customEnd])

  useEffect(() => {
    const handler = () => load()
    window.addEventListener('transaction-saved', handler)
    return () => window.removeEventListener('transaction-saved', handler)
  }, [load])

  useEffect(() => {
    if (showTrend && trendRangeRef.current !== range) {
      loadTrend(range)
    }
  }, [range, showTrend, loadTrend])

  async function handleToggleTrend() {
    const next = !showTrend
    setShowTrend(next)
    if (next && trendRangeRef.current !== range) {
      loadTrend(range)
    }
  }

  function toggleCategory(name: string) {
    setExpandedCategory((prev) => (prev === name ? null : name))
  }

  const trendMax = trendData.reduce((m, d) => Math.max(m, d.income, d.expense), 1)

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
                onClick={() => setRange(r.id)}
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
            Failed to load dashboard data - please refresh
          </p>
        )}

        {!error && (
          <>
            {/* Savings rate gauge - hero visual */}
            <SavingsGauge
              income={data?.total_income ?? 0}
              expense={data?.total_spend ?? 0}
              loading={loading}
            />

            {/* Stat boxes - smaller/secondary */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', margin: '0.75rem 0' }}>
              <div style={{ background: '#1c2128', border: '1px solid #30363d', borderRadius: '8px', padding: '8px 10px' }}>
                <div style={labelStyle}>Spend</div>
                <div style={{ color: loading ? '#484f58' : '#f85149', fontSize: '14px', fontWeight: 700, letterSpacing: '-0.3px' }}>
                  {loading ? '…' : fmt(data?.total_spend ?? 0)}
                </div>
              </div>
              <div style={{ background: '#1c2128', border: '1px solid #30363d', borderRadius: '8px', padding: '8px 10px' }}>
                <div style={labelStyle}>Income</div>
                <div style={{ color: loading ? '#484f58' : '#3fb884', fontSize: '14px', fontWeight: 700, letterSpacing: '-0.3px' }}>
                  {loading ? '…' : fmt(data?.total_income ?? 0)}
                </div>
              </div>
              <div style={{ background: '#1c2128', border: '1px solid #30363d', borderRadius: '8px', padding: '8px 10px' }}>
                <div style={labelStyle}>Avg/day</div>
                <div style={{ color: loading ? '#484f58' : '#e6edf3', fontSize: '14px', fontWeight: 700, letterSpacing: '-0.3px' }}>
                  {loading ? '…' : fmt(data?.daily_average ?? 0)}
                </div>
              </div>
              <div style={{ background: '#1c2128', border: '1px solid #30363d', borderRadius: '8px', padding: '8px 10px' }}>
                <div style={labelStyle}>Budget</div>
                <div style={{ color: '#484f58', fontSize: '14px', fontWeight: 700 }}>
                  {loading ? '…' : (data?.budget_remaining != null ? fmt(data.budget_remaining) : '--')}
                </div>
              </div>
            </div>

            {/* Empty state */}
            {!loading && data && data.total_spend === 0 && data.total_income === 0 && (
              <p style={{ color: '#484f58', fontSize: '13px', textAlign: 'center', padding: '0.25rem 0 0.5rem' }}>
                No transactions in this period
              </p>
            )}

            {/* Show trend toggle */}
            <div style={{ marginBottom: '0.75rem' }}>
              <button
                type="button"
                onClick={handleToggleTrend}
                style={{
                  background: 'none', border: '1px solid #30363d', borderRadius: '6px',
                  color: '#8b949e', fontSize: '12px', fontWeight: 500, cursor: 'pointer',
                  padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '4px',
                }}
              >
                <span style={{ display: 'inline-block', transition: 'transform 0.2s', transform: showTrend ? 'rotate(180deg)' : 'rotate(0deg)', fontSize: '10px' }}>▾</span>
                {showTrend ? 'Hide trend' : 'Show trend'}
              </button>

              {showTrend && (
                <div style={{ marginTop: '10px', padding: '12px', background: '#0d1117', borderRadius: '8px', border: '1px solid #21262d' }}>
                  {trendLoading ? (
                    <div style={{ color: '#484f58', fontSize: '12px', textAlign: 'center', padding: '1rem 0' }}>Loading...</div>
                  ) : trendData.length === 0 ? (
                    <div style={{ color: '#484f58', fontSize: '12px', textAlign: 'center', padding: '0.5rem 0' }}>No trend data</div>
                  ) : (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', height: '72px' }}>
                        {trendData.map((pt) => {
                          const incomeH = Math.round((pt.income / trendMax) * 60)
                          const expenseH = Math.round((pt.expense / trendMax) * 60)
                          return (
                            <div key={pt.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '60px' }}>
                                <div
                                  title={`Income: SGD ${fmt(pt.income)}`}
                                  style={{ width: '10px', height: `${Math.max(incomeH, 0)}px`, background: '#3fb884', borderRadius: '2px 2px 0 0', minHeight: incomeH > 0 ? '2px' : '0' }}
                                />
                                <div
                                  title={`Expense: SGD ${fmt(pt.expense)}`}
                                  style={{ width: '10px', height: `${Math.max(expenseH, 0)}px`, background: '#f85149', borderRadius: '2px 2px 0 0', minHeight: expenseH > 0 ? '2px' : '0' }}
                                />
                              </div>
                              <span style={{ color: '#6e7681', fontSize: '10px', whiteSpace: 'nowrap' }}>{pt.label}</span>
                            </div>
                          )
                        })}
                      </div>
                      <div style={{ display: 'flex', gap: '12px', marginTop: '8px', justifyContent: 'center' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#6e7681', fontSize: '11px' }}>
                          <span style={{ width: '8px', height: '8px', background: '#3fb884', borderRadius: '2px', display: 'inline-block' }} />
                          Income
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#6e7681', fontSize: '11px' }}>
                          <span style={{ width: '8px', height: '8px', background: '#f85149', borderRadius: '2px', display: 'inline-block' }} />
                          Expense
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Top Expenses */}
            {!loading && data && data.category_breakdown.length > 0 && (
              <div>
                <div style={{ ...labelStyle, marginBottom: '8px' }}>Top Expenses</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  {data.category_breakdown.slice(0, 6).map((cat) => {
                    const isExpanded = expandedCategory === cat.category_name
                    return (
                      <div key={cat.category_name}>
                        <button
                          role="button"
                          aria-expanded={isExpanded}
                          onClick={() => toggleCategory(cat.category_name)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            width: '100%',
                            background: 'transparent',
                            border: 'none',
                            padding: '4px 0',
                            cursor: 'pointer',
                            textAlign: 'left',
                          }}
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
                          <span style={{ color: '#484f58', fontSize: '10px', minWidth: '10px', display: 'inline-block', transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                            ▾
                          </span>
                        </button>

                        {/* Accordion panel */}
                        <div
                          style={{
                            overflow: 'hidden',
                            maxHeight: isExpanded ? `${cat.tag_breakdown.length * 28 + 12}px` : '0px',
                            transition: 'max-height 0.25s ease-in-out',
                            marginLeft: '110px',
                          }}
                        >
                          <div style={{ paddingBottom: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {cat.tag_breakdown.map((tag) => (
                              <div key={tag.tag_name} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <span style={{ color: '#6e7681', fontSize: '12px', minWidth: '90px' }}>{tag.tag_name}</span>
                                <div style={{ flex: 1, background: '#161b22', borderRadius: '3px', height: '4px', overflow: 'hidden' }}>
                                  <div style={{
                                    width: `${cat.total > 0 ? Math.min(100, (tag.total / cat.total) * 100) : 0}%`,
                                    height: '100%',
                                    background: '#388bfd',
                                    borderRadius: '3px',
                                  }} />
                                </div>
                                <span style={{ color: '#6e7681', fontSize: '11px', minWidth: '48px', textAlign: 'right' }}>
                                  {fmt(tag.total)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}
