'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'

type Range = '1d' | '7d' | '1m' | '3m' | 'custom'

interface TagBreakdownEntry {
  tag_name: string
  total: number
}

interface CategoryEntry {
  category_id: string | null
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
  { id: '1d', label: '1D' },
  { id: '7d', label: '7D' },
  { id: '1m', label: '1M' },
  { id: '3m', label: '3M' },
  { id: 'custom', label: 'Custom' },
]

function fmt(n: number) {
  return n.toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function isoToDate(iso: string): string {
  return iso.slice(0, 10)
}

function buildTxUrl(data: DashboardData, opts: { type?: string; categoryId?: string }): string {
  const p = new URLSearchParams()
  if (opts.type) p.set('type', opts.type)
  if (opts.categoryId) p.set('category_id', opts.categoryId)
  p.set('start', isoToDate(data.start_date))
  p.set('end', isoToDate(data.end_date))
  return `/transactions?${p.toString()}`
}

const labelStyle: React.CSSProperties = {
  color: 'var(--text-muted)',
  fontSize: '10px',
  fontWeight: 600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  marginBottom: '2px',
}

function SavingsGauge({ income, expense, loading }: { income: number; expense: number; loading: boolean }) {
  const savingsPct = income > 0 ? ((income - expense) / income) * 100 : null
  const displayPct = savingsPct !== null ? Math.round(savingsPct) : null
  const progress = savingsPct !== null ? Math.max(0, Math.min(100, savingsPct)) : 0

  const color =
    savingsPct === null ? 'var(--text-dim)'
    : savingsPct > 20 ? 'var(--green)'
    : savingsPct > 10 ? 'var(--accent)'
    : 'var(--red)'

  const label = loading ? '…'
    : displayPct !== null ? `${displayPct}% ${displayPct < 0 ? 'deficit' : 'saved'}`
    : 'no income'

  return (
    <div style={{ padding: '0.5rem 0' }}>
      <div style={{
        background: 'var(--bg-dim)',
        borderRadius: '10px',
        height: '20px',
        width: '100%',
        overflow: 'hidden',
      }}>
        {!loading && progress > 0 && (
          <div style={{
            background: color,
            borderRadius: '10px',
            height: '100%',
            width: `${progress}%`,
            transition: 'width 0.3s ease',
          }} />
        )}
      </div>
      <div style={{ textAlign: 'right', marginTop: '0.35rem', fontSize: '0.85rem', color, fontWeight: 600 }}>
        {label}
      </div>
    </div>
  )
}

export function ExpenseDashboard() {
  const router = useRouter()
  const [range, setRange] = useState<Range>('1m')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const [expandedCategoryId, setExpandedCategoryId] = useState<string | null>(null)
  const [drillData, setDrillData] = useState<CategoryEntry[] | null>(null)
  const [drillLoading, setDrillLoading] = useState(false)

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

  async function drillInto(categoryId: string | null) {
    if (!categoryId) return
    if (expandedCategoryId === categoryId) {
      setExpandedCategoryId(null)
      setDrillData(null)
      return
    }
    setExpandedCategoryId(categoryId)
    setDrillLoading(true)
    try {
      let url = `/api/dashboard?range=${range}&parent_category_id=${categoryId}`
      if (range === 'custom' && customStart && customEnd) {
        url += `&start=${encodeURIComponent(customStart + 'T00:00:00+08:00')}&end=${encodeURIComponent(customEnd + 'T23:59:59+08:00')}`
      }
      const res = await fetch(url)
      const d = await res.json()
      setDrillData(d.category_breakdown ?? [])
    } catch {
      setDrillData(null)
    } finally {
      setDrillLoading(false)
    }
  }

  const trendMax = trendData.reduce((m, d) => Math.max(m, d.income, d.expense), 1)

  const clickableBox: React.CSSProperties = {
    background: 'var(--bg-subtle)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    padding: '8px 10px',
    cursor: 'pointer',
    transition: 'border-color 0.15s',
    userSelect: 'none' as const,
  }

  const staticBox: React.CSSProperties = {
    background: 'var(--bg-subtle)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    padding: '8px 10px',
  }

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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '1rem' }}>
          <h2 style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', margin: 0 }}>
            Expense Dashboard
          </h2>
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', width: '100%' }}>
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
                  flexShrink: 0,
                  whiteSpace: 'nowrap',
                  border: range === r.id ? '1px solid var(--accent)' : '1px solid var(--border)',
                  background: range === r.id ? 'var(--accent-faint)' : 'transparent',
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
          <p style={{ color: 'var(--red)', fontSize: '13px', textAlign: 'center', padding: '1rem 0' }}>
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

            {/* Stat boxes */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '8px', margin: '0.75rem 0' }}>
              {/* Spend — clickable → /transactions?type=expense */}
              <div
                data-testid="spend-box"
                onClick={() => data && router.push(buildTxUrl(data, { type: 'expense' }))}
                style={data ? clickableBox : staticBox}
              >
                <div style={labelStyle}>Spend</div>
                <div style={{ color: loading ? 'var(--text-dim)' : 'var(--red)', fontSize: '14px', fontWeight: 700, letterSpacing: '-0.3px' }}>
                  {loading ? '…' : fmt(data?.total_spend ?? 0)}
                </div>
              </div>

              {/* Income — clickable → /transactions?type=income */}
              <div
                data-testid="income-box"
                onClick={() => data && router.push(buildTxUrl(data, { type: 'income' }))}
                style={data ? clickableBox : staticBox}
              >
                <div style={labelStyle}>Income</div>
                <div style={{ color: loading ? 'var(--text-dim)' : 'var(--green)', fontSize: '14px', fontWeight: 700, letterSpacing: '-0.3px' }}>
                  {loading ? '…' : fmt(data?.total_income ?? 0)}
                </div>
              </div>

              {/* Avg/day — not clickable */}
              <div style={staticBox}>
                <div style={labelStyle}>Avg/day</div>
                <div style={{ color: loading ? 'var(--text-dim)' : 'var(--text)', fontSize: '14px', fontWeight: 700, letterSpacing: '-0.3px' }}>
                  {loading ? '…' : fmt(data?.daily_average ?? 0)}
                </div>
              </div>

              {/* Budget — not clickable */}
              <div style={staticBox}>
                <div style={labelStyle}>Budget</div>
                <div style={{ color: 'var(--text-dim)', fontSize: '14px', fontWeight: 700 }}>
                  {loading ? '…' : (data?.budget_remaining != null ? fmt(data.budget_remaining) : '—')}
                </div>
              </div>
            </div>

            {/* Empty state */}
            {!loading && data && data.total_spend === 0 && data.total_income === 0 && (
              <p style={{ color: 'var(--text-dim)', fontSize: '13px', textAlign: 'center', padding: '0.25rem 0 0.5rem' }}>
                No transactions in this period
              </p>
            )}

            {/* Show trend toggle */}
            <div style={{ marginBottom: '0.75rem' }}>
              <button
                type="button"
                onClick={handleToggleTrend}
                style={{
                  background: 'none', border: '1px solid var(--border)', borderRadius: '6px',
                  color: 'var(--text-muted)', fontSize: '12px', fontWeight: 500, cursor: 'pointer',
                  padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '4px',
                  whiteSpace: 'nowrap',
                }}
              >
                <span style={{ display: 'inline-block', transition: 'transform 0.2s', transform: showTrend ? 'rotate(180deg)' : 'rotate(0deg)', fontSize: '10px' }}>▾</span>
                {showTrend ? 'Hide trend' : 'Show trend'}
              </button>

              {showTrend && (
                <div style={{ marginTop: '10px', padding: '12px', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--bg-dim)' }}>
                  {trendLoading ? (
                    <div style={{ color: 'var(--text-dim)', fontSize: '12px', textAlign: 'center', padding: '1rem 0' }}>Loading...</div>
                  ) : trendData.length === 0 ? (
                    <div style={{ color: 'var(--text-dim)', fontSize: '12px', textAlign: 'center', padding: '0.5rem 0' }}>No trend data</div>
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
                                  style={{ width: '10px', height: `${Math.max(incomeH, 0)}px`, background: 'var(--green)', borderRadius: '2px 2px 0 0', minHeight: incomeH > 0 ? '2px' : '0' }}
                                />
                                <div
                                  title={`Expense: SGD ${fmt(pt.expense)}`}
                                  style={{ width: '10px', height: `${Math.max(expenseH, 0)}px`, background: 'var(--red)', borderRadius: '2px 2px 0 0', minHeight: expenseH > 0 ? '2px' : '0' }}
                                />
                              </div>
                              <span style={{ color: '#6e7681', fontSize: '10px', whiteSpace: 'nowrap' }}>{pt.label}</span>
                            </div>
                          )
                        })}
                      </div>
                      <div style={{ display: 'flex', gap: '12px', marginTop: '8px', justifyContent: 'center' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#6e7681', fontSize: '11px' }}>
                          <span style={{ width: '8px', height: '8px', background: 'var(--green)', borderRadius: '2px', display: 'inline-block' }} />
                          Income
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#6e7681', fontSize: '11px' }}>
                          <span style={{ width: '8px', height: '8px', background: 'var(--red)', borderRadius: '2px', display: 'inline-block' }} />
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                  {data.category_breakdown.slice(0, 6).map((cat) => {
                    const isExpanded = expandedCategoryId === cat.category_id
                    return (
                      <div key={cat.category_name}>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          {/* Navigation button — tapping navigates to /transactions */}
                          <button
                            data-testid={cat.category_id ? `category-nav-${cat.category_id}` : undefined}
                            onClick={() => data && cat.category_id && router.push(buildTxUrl(data, { type: 'expense', categoryId: cat.category_id }))}
                            style={{
                              flex: 1,
                              display: 'flex', alignItems: 'center', gap: '10px',
                              background: 'transparent', border: 'none',
                              padding: '5px 0',
                              cursor: cat.category_id ? 'pointer' : 'default',
                              borderRadius: '4px',
                              textAlign: 'left',
                            }}
                          >
                            <span style={{ color: 'var(--text)', fontSize: '13px', minWidth: '100px' }}>{cat.category_name}</span>
                            <div style={{ flex: 1, background: 'var(--bg-dim)', borderRadius: '4px', height: '6px', overflow: 'hidden' }}>
                              <div style={{ width: `${Math.min(100, cat.pct)}%`, height: '100%', background: 'var(--accent)', borderRadius: '4px' }} />
                            </div>
                            <span style={{ color: 'var(--text-muted)', fontSize: '12px', minWidth: '48px', textAlign: 'right' }}>
                              {fmt(cat.total)}
                            </span>
                            <span style={{ color: 'var(--text-dim)', fontSize: '11px', minWidth: '38px', textAlign: 'right' }}>
                              {cat.pct.toFixed(1)}%
                            </span>
                          </button>

                          {/* Drill-down toggle — separate button keeps expand/collapse */}
                          {cat.category_id && (
                            <button
                              data-testid={`category-toggle-${cat.category_id}`}
                              aria-expanded={isExpanded}
                              onClick={() => drillInto(cat.category_id)}
                              style={{
                                background: 'none', border: 'none',
                                cursor: 'pointer', color: 'var(--text-dim)',
                                fontSize: '11px', width: '24px', flexShrink: 0,
                                padding: '4px 2px',
                              }}
                            >
                              {isExpanded ? '▲' : '▼'}
                            </button>
                          )}
                        </div>

                        {isExpanded && (
                          <div style={{ marginBottom: '4px', paddingLeft: '0' }}>
                            {drillLoading ? (
                              <div style={{ color: 'var(--text-muted)', fontSize: '12px', padding: '4px 0' }}>Loading...</div>
                            ) : drillData && drillData.length > 0 ? (
                              drillData.map(sub => (
                                <button
                                  key={sub.category_name}
                                  data-testid={sub.category_id ? `subcategory-nav-${sub.category_id}` : undefined}
                                  onClick={() => data && sub.category_id && router.push(buildTxUrl(data, { type: 'expense', categoryId: sub.category_id }))}
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: '10px',
                                    padding: '3px 0',
                                    cursor: sub.category_id ? 'pointer' : 'default',
                                    background: 'none', border: 'none',
                                    width: '100%', textAlign: 'left',
                                  }}
                                >
                                  <span style={{ color: 'var(--text-muted)', fontSize: '12px', minWidth: '100px' }}>{sub.category_name}</span>
                                  <div style={{ flex: 1, background: 'var(--bg-dim)', borderRadius: '4px', height: '4px', overflow: 'hidden' }}>
                                    <div style={{ width: `${Math.min(100, sub.pct)}%`, height: '100%', background: 'rgba(204, 85, 0, 0.5)', borderRadius: '4px' }} />
                                  </div>
                                  <span style={{ color: 'var(--text-muted)', fontSize: '12px', minWidth: '48px', textAlign: 'right' }}>{fmt(sub.total)}</span>
                                  <span style={{ color: 'var(--text-dim)', fontSize: '11px', minWidth: '38px', textAlign: 'right' }}>{sub.pct.toFixed(1)}%</span>
                                  <span style={{ width: '16px', flexShrink: 0 }} />
                                </button>
                              ))
                            ) : cat.tag_breakdown && cat.tag_breakdown.length > 0 ? (
                              cat.tag_breakdown.map(tag => (
                                <div key={tag.tag_name} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '3px 0' }}>
                                  <span style={{ color: 'var(--text-muted)', fontSize: '12px', minWidth: '100px' }}>{tag.tag_name}</span>
                                  <div style={{ flex: 1, background: 'var(--bg-dim)', borderRadius: '4px', height: '4px', overflow: 'hidden' }}>
                                    <div style={{ width: `${Math.min(100, cat.total > 0 ? (tag.total / cat.total) * 100 : 0)}%`, height: '100%', background: 'rgba(204, 85, 0, 0.3)', borderRadius: '4px' }} />
                                  </div>
                                  <span style={{ color: 'var(--text-muted)', fontSize: '12px', minWidth: '48px', textAlign: 'right' }}>{fmt(tag.total)}</span>
                                  <span style={{ color: 'var(--text-dim)', fontSize: '11px', minWidth: '38px', textAlign: 'right' }}>{cat.total > 0 ? ((tag.total / cat.total) * 100).toFixed(1) : '0.0'}%</span>
                                  <span style={{ width: '16px', flexShrink: 0 }} />
                                </div>
                              ))
                            ) : (
                              <div style={{ color: 'var(--text-dim)', fontSize: '12px', padding: '4px 0' }}>No breakdown available</div>
                            )}
                          </div>
                        )}
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
