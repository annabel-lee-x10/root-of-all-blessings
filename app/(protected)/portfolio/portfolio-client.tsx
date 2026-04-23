'use client'

import { useEffect, useRef, useState, useCallback, useContext, createContext } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { useToast } from '../components/toast'
import { NewsClient } from '../news/news-client'
import type { Holding } from '@/lib/types'
import { UploadArea } from './upload-area'
import { DownloadsModal } from './downloads-modal'

// ── Theme tokens ───────────────────────────────────────────────────────────────
const DARK = {
  bg:     '#0E1117',
  card:   '#161C27',
  border: '#242C3A',
  pale:   '#C8D0DC',
  mid:    '#6B7A92',
  inset:  '#0A0D14',
  orange: '#E8520A',
  green:  '#3DD68C',
  red:    '#FF5A5A',
  yellow: '#F5C842',
  teal:   '#06D6A0',
}
const LIGHT = {
  bg:     '#F1F5F9',
  card:   '#FFFFFF',
  border: '#CBD5E1',
  pale:   '#1E293B',
  mid:    '#64748B',
  inset:  '#E2E8F0',
  orange: '#E8520A',
  green:  '#16A34A',
  red:    '#DC2626',
  yellow: '#D97706',
  teal:   '#06D6A0',
}
type Theme = typeof DARK
const ThemeCtx = createContext<Theme>(DARK)
function useTheme() { return useContext(ThemeCtx) }
const C = DARK

// ── Static color maps ──────────────────────────────────────────────────────────
const SECTOR_COLOR: Record<string, string> = {
  'ETF':                '#4A6FA5',
  'Technology':         '#9B6DFF',
  'Metals':             '#F5C842',
  'Financials':         '#3DD68C',
  'Media':              '#E8520A',
  'Healthcare':         '#FF6B9D',
  'Utilities':          '#06D6A0',
  'Energy':             '#F0A500',
  'Telecommunications': '#38BDF8',
  'Consumer Staples':   '#A3E635',
  'Agriculture ETF':    '#84CC16',
  'Materials':          '#FB923C',
  'Software':           '#818CF8',
}
const GEO_COLOR: Record<string, string> = {
  US: '#4A6FA5', SG: '#E8520A', UK: '#3DD68C', HK: '#F5C842',
}
const FX: Record<string, number> = { USD: 1, SGD: 0.74, GBP: 1.29 }

const DIM_LABEL: Record<string, string> = { K: 'Knowledge', S: 'Strategy', E: 'Execution' }
const DIM_COLOR: Record<string, string> = { K: '#9B6DFF', S: '#E8520A', E: '#3DD68C' }

// ── Extended Holding type (includes new DB fields) ────────────────────────────
interface ExtHolding extends Holding {
  target?: number | null
  sell_limit?: number | null
  buy_limit?: number | null
  is_new?: boolean
  approx?: boolean
  note?: string | null
  dividend_amount?: number | null
  dividend_date?: string | null
  day_high?: number | null
  day_low?: number | null
  prev_close?: number | null
}

interface PortfolioOrder {
  id: string
  ticker: string
  geo: string
  type: string
  price: number
  qty: number
  currency: string
  placed: string | null
  current_price: number | null
  note: string | null
  new_flag: number
  status?: string | null
}

interface RealisedTrade {
  id: string
  key: string
  value: number
}

interface GrowthScore {
  id: string
  dimension: string
  score: number
  label: string | null
  level: string | null
  items_json: string
  next_text: string | null
}

interface Milestone {
  id: string
  date: string
  tags_json: string
  text: string
  sort_order: number
}

interface SnapResponse {
  id: string
  snapshot_date: string
  snap_label: string | null
  snap_time: string | null
  total_value: number
  unrealised_pnl: number | null
  realised_pnl: number | null
  cash: number | null
  pending: number | null
  net_invested: number | null
  net_deposited: number | null
  dividends: number | null
  prior_value: number | null
  prior_unrealised: number | null
  prior_realised: number | null
  prior_cash: number | null
  prior_holdings: number | null
  holdings: ExtHolding[]
  orders: PortfolioOrder[]
  realised: RealisedTrade[]
  growth: GrowthScore[]
  milestones: Milestone[]
}

type Tab = 'holdings' | 'orders' | 'geo' | 'sector' | 'pnl' | 'whatif' | 'growth'
const TABS: { id: Tab; label: string }[] = [
  { id: 'holdings', label: 'Holdings' },
  { id: 'orders',   label: 'Orders' },
  { id: 'geo',      label: 'Geo' },
  { id: 'sector',   label: 'Sector' },
  { id: 'pnl',      label: 'P&L' },
  { id: 'whatif',   label: 'What-If' },
  { id: 'growth',   label: 'Growth' },
]

// ── Utils ─────────────────────────────────────────────────────────────────────
function sectorColor(sector?: string | null) { return SECTOR_COLOR[sector ?? ''] ?? '#6B7A92' }
function geoColor(geo?: string | null) { return GEO_COLOR[geo ?? ''] ?? '#6B7A92' }
function pnlColor(n: number | undefined | null, T: Theme) {
  if (n === undefined || n === null) return T.mid
  return n >= 0 ? T.green : T.red
}
function fmt(n: number, d = 2) {
  return n.toLocaleString('en-SG', { minimumFractionDigits: d, maximumFractionDigits: d })
}
function fmtPct(n: number) { return (n >= 0 ? '+' : '') + fmt(n, 2) + '%' }
function symFor(currency?: string | null) {
  return currency === 'SGD' ? 'S$' : currency === 'GBP' ? '£' : '$'
}
function valueUSD(h: ExtHolding): number {
  return h.market_value * (FX[h.currency ?? 'USD'] ?? 1)
}

// ── Sparkline ─────────────────────────────────────────────────────────────────
function hashStr(s: string): number {
  return s.split('').reduce((h, c) => (Math.imul(31, h) + c.charCodeAt(0)) | 0, 0)
}
function mulberry32(seed: number) {
  let s = seed
  return function () {
    let t = (s += 0x6D2B79F5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function Sparkline({ ticker, width = 60, height = 20 }: { ticker: string; width?: number; height?: number }) {
  const T = useTheme()
  const rng = mulberry32(Math.abs(hashStr(ticker)))
  const N = 10
  const raw = Array.from({ length: N }, () => rng())
  const min = Math.min(...raw)
  const max = Math.max(...raw)
  const span = max - min || 1
  const trendUp = raw[N - 1] >= raw[0]
  const strokeColor = trendUp ? T.green : T.red
  const points = raw.map((v, i) => {
    const x = ((i / (N - 1)) * width).toFixed(1)
    const y = (height - 2 - ((v - min) / span) * (height - 4)).toFixed(1)
    return `${x},${y}`
  }).join(' ')
  return (
    <svg data-testid="sparkline" width={width} height={height} style={{ display: 'block', flexShrink: 0 }}>
      <polyline points={points} fill="none" stroke={strokeColor} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ── Shared style atoms ─────────────────────────────────────────────────────────
const MONO: React.CSSProperties = { fontFamily: "'DM Mono', 'Courier New', monospace" }
const TAG: React.CSSProperties = {
  display: 'inline-block', fontSize: '0.65rem', fontWeight: 700, padding: '1px 5px',
  borderRadius: 4, letterSpacing: '0.04em',
}
const WRAP: React.CSSProperties = { maxWidth: 430, margin: '0 auto', padding: '0 0 80px' }

function ViewToggle({
  view, onSwitch, theme,
}: { view: 'dashboard' | 'news'; onSwitch: (v: 'dashboard' | 'news') => void; theme: Theme }) {
  return (
    <div style={{ display: 'flex', borderBottom: `1px solid ${theme.border}` }}>
      {(['dashboard', 'news'] as const).map(v => (
        <button key={v} onClick={() => onSwitch(v)} style={{
          flex: 1, padding: '10px', background: 'none', border: 'none', cursor: 'pointer',
          fontSize: '0.82rem', fontWeight: view === v ? 700 : 400,
          color: view === v ? theme.orange : theme.mid,
          borderBottom: view === v ? `2px solid ${theme.orange}` : '2px solid transparent',
          textTransform: 'capitalize',
        }}>
          {v === 'dashboard' ? 'Dashboard' : 'News'}
        </button>
      ))}
    </div>
  )
}

function lb(col: string, T: Theme): React.CSSProperties {
  return {
    borderTop: `1px solid ${T.border}`, borderRight: `1px solid ${T.border}`,
    borderBottom: `1px solid ${T.border}`, borderLeft: `4px solid ${col}`,
  }
}

// ── Tab: Holdings ─────────────────────────────────────────────────────────────
function HoldingsTab({ holdings }: { holdings: ExtHolding[] }) {
  const T = useTheme()
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const sorted = [...holdings].sort((a, b) => valueUSD(b) - valueUSD(a))
  const totalUSD = sorted.reduce((s, h) => s + valueUSD(h), 0)

  function toggle(key: string) {
    setExpanded(prev => {
      const n = new Set(prev)
      n.has(key) ? n.delete(key) : n.add(key)
      return n
    })
  }

  return (
    <div style={{ padding: '0 12px' }}>
      {sorted.map((h, i) => {
        const key = h.ticker ?? h.name + i
        const isOpen = expanded.has(key)
        const sc = sectorColor(h.sector)
        const gc = geoColor(h.geo)
        const sym = symFor(h.currency)
        const weightPct = totalUSD > 0 ? (valueUSD(h) / totalUSD) * 100 : 0
        const hasSell = h.sell_limit != null
        const hasBuy = h.buy_limit != null

        return (
          <div
            key={key}
            data-testid={`holding-card-${key}`}
            style={{ background: T.card, borderRadius: 10, marginBottom: 8, ...lb(sc, T), cursor: 'pointer', overflow: 'hidden' }}
            onClick={() => toggle(key)}
          >
            <div style={{ padding: '10px 12px 8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ ...MONO, fontSize: '0.95rem', fontWeight: 700, color: T.pale }}>
                      {h.ticker ?? h.name.slice(0, 8)}
                    </span>
                    {h.geo && <span style={{ ...TAG, background: gc + '22', color: gc }}>{h.geo}</span>}
                    {h.is_new && <span style={{ ...TAG, background: C.teal + '22', color: C.teal }}>NEW</span>}
                    {h.dividend_amount != null && (
                      <span style={{ ...TAG, background: C.yellow + '22', color: C.yellow }}>DIV</span>
                    )}
                    {hasSell && (
                      <span data-testid={`limit-badge-${h.ticker}`}
                        style={{ ...TAG, background: C.red + '22', color: C.red }}>SELL</span>
                    )}
                    {hasBuy && (
                      <span data-testid={`limit-badge-${h.ticker}`}
                        style={{ ...TAG, background: C.teal + '22', color: C.teal }}>BUY</span>
                    )}
                    <span style={{ fontSize: '0.7rem', color: T.mid }}>{h.sector}</span>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: T.mid, marginTop: 2 }}>
                    {h.ticker ? h.name.slice(0, 30) : ''}
                  </div>
                </div>
                {h.ticker && (
                  <div style={{ marginLeft: 8, marginTop: 4, flexShrink: 0 }}>
                    <Sparkline ticker={h.ticker} />
                  </div>
                )}
                <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>
                  <div style={{ ...MONO, fontSize: '0.92rem', fontWeight: 600, color: T.pale }}>
                    {sym}{fmt(h.market_value)}
                  </div>
                  {h.pnl !== undefined && (
                    <div style={{ ...MONO, fontSize: '0.78rem', color: pnlColor(h.pnl, T) }}>
                      {h.pnl >= 0 ? '+' : ''}{sym}{fmt(Math.abs(h.pnl))}
                      {h.pnl_pct !== undefined && (
                        <span style={{ marginLeft: 4, opacity: 0.85 }}>{fmtPct(h.pnl_pct)}</span>
                      )}
                    </div>
                  )}
                  {h.change_1d_pct !== undefined && (
                    <div data-testid={`change-1d-${h.ticker}`}
                      style={{ ...MONO, fontSize: '0.72rem', color: pnlColor(h.change_1d_pct, T) }}>
                      {fmtPct(h.change_1d_pct)} 1D
                    </div>
                  )}
                </div>
              </div>
              <div style={{ marginTop: 8, height: 3, background: T.inset, borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(weightPct, 100)}%`, background: sc, borderRadius: 2 }} />
              </div>
              <div style={{ fontSize: '0.68rem', color: T.mid, marginTop: 2 }}>
                {weightPct.toFixed(1)}% of portfolio{h.approx ? ' · ~APPROX' : ''}
              </div>
            </div>
            {isOpen && (
              <div style={{
                borderTop: `1px solid ${T.border}`, padding: '10px 12px', background: T.inset,
                display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px 8px',
              }}>
                {h.avg_cost !== undefined && (
                  <div>
                    <div style={{ fontSize: '0.65rem', color: T.mid, marginBottom: 2 }}>AVG COST</div>
                    <div style={{ ...MONO, fontSize: '0.82rem', color: T.pale }}>{sym}{fmt(h.avg_cost)}</div>
                  </div>
                )}
                {h.units !== undefined && (
                  <div>
                    <div style={{ fontSize: '0.65rem', color: T.mid, marginBottom: 2 }}>QTY</div>
                    <div style={{ ...MONO, fontSize: '0.82rem', color: T.pale }}>{h.units}</div>
                  </div>
                )}
                {h.current_price !== undefined && (
                  <div>
                    <div style={{ fontSize: '0.65rem', color: T.mid, marginBottom: 2 }}>PRICE</div>
                    <div style={{ ...MONO, fontSize: '0.82rem', color: T.pale }}>{sym}{fmt(h.current_price)}</div>
                  </div>
                )}
                {h.day_high != null && h.day_low != null && (
                  <div data-testid={`day-range-${h.ticker}`} style={{ gridColumn: '1 / -1' }}>
                    <div style={{ fontSize: '0.65rem', color: T.mid, marginBottom: 2 }}>DAY RANGE</div>
                    <div style={{ ...MONO, fontSize: '0.82rem', color: T.pale }}>
                      {sym}{fmt(h.day_low)} – {sym}{fmt(h.day_high)}
                    </div>
                  </div>
                )}
                {h.prev_close != null && (
                  <div data-testid={`prev-close-${h.ticker}`}>
                    <div style={{ fontSize: '0.65rem', color: T.mid, marginBottom: 2 }}>PREV CLOSE</div>
                    <div style={{ ...MONO, fontSize: '0.82rem', color: T.pale }}>{sym}{fmt(h.prev_close)}</div>
                  </div>
                )}
                {h.sell_limit != null && (
                  <div>
                    <div style={{ fontSize: '0.65rem', color: C.red, marginBottom: 2 }}>SELL LIMIT</div>
                    <div style={{ ...MONO, fontSize: '0.82rem', color: C.red }}>{sym}{fmt(h.sell_limit)}</div>
                  </div>
                )}
                {h.buy_limit != null && (
                  <div>
                    <div style={{ fontSize: '0.65rem', color: C.teal, marginBottom: 2 }}>BUY LIMIT</div>
                    <div style={{ ...MONO, fontSize: '0.82rem', color: C.teal }}>{sym}{fmt(h.buy_limit)}</div>
                  </div>
                )}
                {h.dividend_amount != null && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <div style={{ fontSize: '0.65rem', color: C.yellow, marginBottom: 2 }}>UPCOMING DIVIDEND</div>
                    <div style={{ fontSize: '0.8rem', color: T.pale }}>
                      {sym}{fmt(h.dividend_amount)}/sh · ex-date {h.dividend_date ?? '—'}
                    </div>
                  </div>
                )}
                {h.note && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <div style={{ fontSize: '0.65rem', color: T.mid, marginBottom: 2 }}>NOTE</div>
                    <div style={{ fontSize: '0.75rem', color: T.pale, lineHeight: 1.4 }}>{h.note}</div>
                  </div>
                )}
                {h.target != null && h.avg_cost !== undefined && h.current_price !== undefined && (
                  <div data-testid={`target-bar-${h.ticker}`} style={{ gridColumn: '1 / -1', marginTop: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: T.mid, marginBottom: 4 }}>
                      <span>ENTRY {sym}{fmt(h.avg_cost)}</span>
                      <span style={{ color: C.orange }}>TARGET {sym}{fmt(h.target)}</span>
                    </div>
                    {(() => {
                      const range = h.target - h.avg_cost
                      const curr = h.current_price - h.avg_cost
                      const pct = range > 0 ? Math.max(0, Math.min(100, (curr / range) * 100)) : 0
                      return (
                        <div style={{ height: 5, background: T.border, borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: C.orange, borderRadius: 3 }} />
                        </div>
                      )
                    })()}
                    <div style={{ ...MONO, fontSize: '0.68rem', color: T.mid, marginTop: 3 }}>
                      {sym}{fmt(h.current_price)} · {sym}{fmt(h.target)} target
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Tab: Orders ───────────────────────────────────────────────────────────────
function OrdersTab({ orders, snap }: { orders: PortfolioOrder[]; snap: SnapResponse }) {
  const T = useTheme()

  if (orders.length === 0) {
    return (
      <div style={{ padding: '0 12px' }}>
        <div data-testid="orders-empty" style={{
          background: T.card, borderRadius: 10, padding: '24px', textAlign: 'center',
          color: T.mid, fontSize: '0.85rem',
        }}>No open orders</div>
      </div>
    )
  }

  return (
    <div style={{ padding: '0 12px' }}>
      {snap.snap_label && (
        <div style={{ fontSize: '0.72rem', color: T.mid, marginBottom: 12, textAlign: 'center' }}>
          {snap.snap_label} · {snap.snap_time}
        </div>
      )}
      {orders.map((o, i) => {
        const isSell = o.type === 'SELL LIMIT'
        const typeColor = isSell ? T.red : T.green
        const sym = symFor(o.currency)
        const gc = geoColor(o.geo)
        const h = snap.holdings.find(hh => hh.ticker === o.ticker)
        const curPrice = o.current_price ?? h?.current_price
        const fillDist = curPrice
          ? isSell
            ? ((o.price - curPrice) / curPrice) * 100
            : ((curPrice - o.price) / o.price) * 100
          : null
        const progress = curPrice
          ? isSell
            ? Math.max(0, Math.min(100, (curPrice / o.price) * 100))
            : Math.max(0, Math.min(100, (o.price / curPrice) * 100))
          : null

        return (
          <div key={o.id ?? i} style={{ background: T.card, borderRadius: 10, marginBottom: 8, ...lb(typeColor, T), padding: '12px 14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span data-testid={`order-ticker-${o.ticker}`} style={{ ...MONO, fontWeight: 700, color: T.pale }}>{o.ticker}</span>
                  {o.geo && <span style={{ ...TAG, background: gc + '22', color: gc }}>{o.geo}</span>}
                  <span data-testid={`order-type-${o.ticker}`} style={{ ...TAG, background: typeColor + '22', color: typeColor }}>{o.type}</span>
                  {o.new_flag === 1 && <span style={{ ...TAG, background: C.yellow + '22', color: C.yellow }}>NEW</span>}
                  {o.status && (
                    <span data-testid={`order-status-${o.ticker}`}
                      style={{ ...TAG, background: T.border, color: T.mid }}>{o.status}</span>
                  )}
                </div>
                <div style={{ fontSize: '0.72rem', color: T.mid, marginTop: 2 }}>
                  Qty {o.qty} · {o.placed}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ ...MONO, fontSize: '1.1rem', fontWeight: 700, color: T.pale }}>
                  {sym}{fmt(o.price)}
                </div>
                {fillDist !== null && (
                  <div style={{ fontSize: '0.72rem', color: fillDist > 0 ? T.mid : T.green }}>
                    {fillDist > 0 ? '+' : ''}{fmt(fillDist, 1)}% to fill
                  </div>
                )}
              </div>
            </div>
            <div style={{ height: 4, background: T.inset, borderRadius: 2, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${progress ?? 60}%`,
                background: typeColor, borderRadius: 2, opacity: progress === null ? 0.4 : 1,
              }} />
            </div>
            {o.note && (
              <div style={{ fontSize: '0.7rem', color: T.mid, marginTop: 6 }}>{o.note}</div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Tab: Geo ──────────────────────────────────────────────────────────────────
function GeoTab({ holdings }: { holdings: ExtHolding[] }) {
  const T = useTheme()
  const geos = ['US', 'SG', 'UK', 'HK'] as const
  const totalUSD = holdings.reduce((s, h) => s + valueUSD(h), 0)
  const byGeo = geos
    .map(g => {
      const hs = holdings.filter(h => h.geo === g)
      const val = hs.reduce((s, h) => s + valueUSD(h), 0)
      return { geo: g, val, pct: totalUSD > 0 ? (val / totalUSD) * 100 : 0, count: hs.length }
    })
    .filter(g => g.val > 0)

  const pieData = byGeo.map(g => ({ name: g.geo, value: parseFloat(g.pct.toFixed(1)) }))

  return (
    <div style={{ padding: '0 12px' }}>
      <div style={{ height: 220, marginBottom: 16 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={pieData} cx="50%" cy="50%" innerRadius="55%" outerRadius="78%"
              dataKey="value" paddingAngle={3}>
              {pieData.map((d, i) => (
                <Cell key={i} fill={GEO_COLOR[d.name] ?? T.mid} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 6, fontSize: '0.8rem' }}
              formatter={(v) => [Number(v ?? 0).toFixed(1) + '%', 'Allocation']}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      {byGeo.map(g => (
        <div key={g.geo} style={{ background: T.card, borderRadius: 10, marginBottom: 8, ...lb(geoColor(g.geo), T), padding: '10px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ ...TAG, background: geoColor(g.geo) + '22', color: geoColor(g.geo), fontSize: '0.75rem', padding: '2px 8px' }}>{g.geo}</span>
              <span style={{ color: T.mid, fontSize: '0.8rem' }}>{g.count} holding{g.count !== 1 ? 's' : ''}</span>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ ...MONO, color: T.pale, fontSize: '0.88rem', fontWeight: 600 }}>~${fmt(g.val)}</div>
              <div style={{ ...MONO, fontSize: '0.75rem', color: T.mid }}>{g.pct.toFixed(1)}%</div>
            </div>
          </div>
          <div style={{ marginTop: 8, height: 4, background: T.inset, borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${g.pct}%`, background: geoColor(g.geo), borderRadius: 2 }} />
          </div>
        </div>
      ))}
      <div style={{ fontSize: '0.68rem', color: T.mid, textAlign: 'center', marginTop: 8 }}>
        ~USD totals · SGD≈0.74 · GBP≈1.29
      </div>
    </div>
  )
}

// ── Tab: Sector ───────────────────────────────────────────────────────────────
function SectorTab({ holdings }: { holdings: ExtHolding[] }) {
  const T = useTheme()
  const totalUSD = holdings.reduce((s, h) => s + valueUSD(h), 0)
  const sectorMap = new Map<string, { val: number; count: number }>()
  for (const h of holdings) {
    const s = h.sector ?? 'Other'
    const prev = sectorMap.get(s) ?? { val: 0, count: 0 }
    sectorMap.set(s, { val: prev.val + valueUSD(h), count: prev.count + 1 })
  }
  const sectors = [...sectorMap.entries()]
    .map(([s, d]) => ({ sector: s, val: d.val, count: d.count, pct: totalUSD > 0 ? (d.val / totalUSD) * 100 : 0 }))
    .sort((a, b) => b.val - a.val)

  return (
    <div style={{ padding: '0 12px' }}>
      {sectors.map(s => (
        <div key={s.sector} style={{ background: T.card, borderRadius: 10, marginBottom: 8, ...lb(sectorColor(s.sector), T), padding: '10px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div>
              <span style={{ color: sectorColor(s.sector), fontSize: '0.8rem', fontWeight: 600 }}>{s.sector}</span>
              <span style={{ color: T.mid, fontSize: '0.72rem', marginLeft: 6 }}>{s.count} holding{s.count !== 1 ? 's' : ''}</span>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{ ...MONO, color: T.pale, fontSize: '0.85rem', fontWeight: 600 }}>~${fmt(s.val)}</span>
              <span style={{ ...MONO, color: T.mid, fontSize: '0.75rem', marginLeft: 6 }}>{s.pct.toFixed(1)}%</span>
            </div>
          </div>
          <div style={{ height: 5, background: T.inset, borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${s.pct}%`, background: sectorColor(s.sector), borderRadius: 3 }} />
          </div>
        </div>
      ))}
      <div style={{ fontSize: '0.68rem', color: T.mid, textAlign: 'center', marginTop: 8 }}>
        ~USD totals · NON-USD APPROXIMATED
      </div>
    </div>
  )
}

// ── Tab: P&L ─────────────────────────────────────────────────────────────────
function PnlTab({ holdings, snap }: { holdings: ExtHolding[]; snap: SnapResponse }) {
  const T = useTheme()

  const withPnl = holdings.filter(h => h.pnl !== undefined && h.pnl_pct !== undefined)
  const sorted = [...withPnl].sort((a, b) => (b.pnl_pct ?? 0) - (a.pnl_pct ?? 0))
  const maxAbsPct = Math.max(...sorted.map(h => Math.abs(h.pnl_pct ?? 0)), 1)

  const realisedTotal = snap.realised.reduce((s, r) => s + r.value, 0)

  return (
    <div style={{ padding: '0 12px' }}>
      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 12 }}>
        {[
          {
            label: 'Unrealised P&L',
            val: snap.unrealised_pnl,
            sub: snap.prior_unrealised != null && snap.unrealised_pnl != null
              ? `vs ${snap.prior_unrealised >= 0 ? '+' : ''}$${fmt(Math.abs(snap.prior_unrealised))} prev`
              : null,
          },
          {
            label: 'Realised P&L',
            val: snap.realised_pnl ?? realisedTotal,
            sub: snap.prior_realised != null
              ? `vs $${fmt(Math.abs(snap.prior_realised))} prev`
              : null,
          },
        ].map(k => (
          <div key={k.label} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: '12px' }}>
            <div style={{ fontSize: '0.63rem', color: T.mid, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3 }}>{k.label}</div>
            <div style={{ ...MONO, fontSize: '1.1rem', fontWeight: 700, color: pnlColor(k.val, T) }}>
              {k.val != null ? (k.val >= 0 ? '+' : '') + '$' + fmt(Math.abs(k.val)) : '—'}
            </div>
            {k.sub && <div style={{ fontSize: '0.65rem', color: T.mid, marginTop: 2 }}>{k.sub}</div>}
          </div>
        ))}
      </div>

      {/* Realised breakdown */}
      {snap.realised.length > 0 && (
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: '12px 14px', marginBottom: 12 }}>
          <div style={{ fontSize: '0.72rem', color: T.mid, marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Realised breakdown
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
            {snap.realised.map((r, i) => (
              <div key={i} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <span style={{ ...MONO, fontSize: '0.72rem', color: T.mid }}>{r.key}</span>
                <span style={{ ...MONO, fontSize: '0.72rem', color: pnlColor(r.value, T) }}>
                  {r.value >= 0 ? '+' : ''}${fmt(Math.abs(r.value))}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Holdings ranked by return */}
      <div style={{ fontSize: '0.72rem', color: T.mid, marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Holdings ranked by return
      </div>
      {sorted.map((h, i) => {
        const pct = h.pnl_pct ?? 0
        const barW = Math.abs(pct) / maxAbsPct * 100
        const color = pnlColor(pct, T)
        const sym = symFor(h.currency)
        return (
          <div key={i} style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ ...MONO, fontSize: '0.82rem', color: T.pale, fontWeight: 600 }}>
                {h.ticker ?? h.name.slice(0, 10)}
              </span>
              <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ ...MONO, fontSize: '0.78rem', color: T.mid }}>
                  {h.pnl !== undefined ? (h.pnl >= 0 ? '+' : '') + sym + fmt(Math.abs(h.pnl)) : ''}
                </span>
                <span style={{ ...MONO, fontSize: '0.82rem', fontWeight: 600, color }}>{fmtPct(pct)}</span>
              </span>
            </div>
            <div style={{ height: 5, background: T.inset, borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${barW}%`, background: color, borderRadius: 3 }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Tab: What-If ──────────────────────────────────────────────────────────────
function WhatIfTab({ holdings }: { holdings: ExtHolding[] }) {
  const T = useTheme()
  const [prices, setPrices] = useState<Record<string, string>>({})
  const sorted = [...holdings].sort((a, b) => valueUSD(b) - valueUSD(a))
  const totalBase = sorted.reduce((s, h) => s + h.market_value, 0)

  function hypotheticalValue(h: ExtHolding): number {
    const ticker = h.ticker ?? ''
    const custom = prices[ticker]
    if (!custom || isNaN(parseFloat(custom)) || !h.current_price || !h.units) {
      return h.market_value
    }
    return parseFloat(custom) * h.units
  }

  const totalHypo = sorted.reduce((s, h) => s + hypotheticalValue(h), 0)
  const delta = totalHypo - totalBase

  return (
    <div style={{ padding: '0 12px' }}>
      <div data-testid="whatif-total" style={{
        background: T.card, border: `1px solid ${T.border}`, borderRadius: 10,
        padding: '14px', marginBottom: 12, textAlign: 'center',
      }}>
        <div style={{ fontSize: '0.63rem', color: T.mid, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
          Hypothetical total
        </div>
        <div style={{ ...MONO, fontSize: '1.4rem', fontWeight: 700, color: pnlColor(delta, T) }}>
          ${fmt(totalHypo)}
        </div>
        {Math.abs(delta) > 0.01 && (
          <div style={{ ...MONO, fontSize: '0.82rem', color: pnlColor(delta, T), marginTop: 2 }}>
            {delta >= 0 ? '+' : ''}${fmt(Math.abs(delta))} vs now
          </div>
        )}
        <div style={{ fontSize: '0.68rem', color: T.mid, marginTop: 4 }}>
          Enter hypothetical prices below · empty = current
        </div>
      </div>

      {sorted.map((h, i) => {
        const ticker = h.ticker ?? h.name + i
        const hypoVal = hypotheticalValue(h)
        const hypoChange = hypoVal - h.market_value
        const sym = symFor(h.currency)
        return (
          <div key={ticker} data-testid={`whatif-row-${ticker}`} style={{
            background: T.card, border: `1px solid ${T.border}`, borderRadius: 10,
            marginBottom: 6, padding: '10px 12px',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ ...MONO, fontSize: '0.88rem', fontWeight: 700, color: T.pale }}>{h.ticker}</div>
              <div style={{ fontSize: '0.72rem', color: T.mid }}>{h.name.slice(0, 22)}</div>
            </div>
            <div style={{ textAlign: 'center', minWidth: 64 }}>
              <div style={{ fontSize: '0.6rem', color: T.mid, marginBottom: 2 }}>CURRENT</div>
              <div style={{ ...MONO, fontSize: '0.8rem', color: T.pale }}>
                {h.current_price != null ? sym + fmt(h.current_price) : '—'}
              </div>
            </div>
            <div>
              <input
                type="number"
                step="0.01"
                placeholder={h.current_price != null ? fmt(h.current_price) : '—'}
                value={prices[h.ticker ?? ''] ?? ''}
                onChange={e => setPrices(p => ({ ...p, [h.ticker ?? '']: e.target.value }))}
                style={{
                  width: 80, background: T.inset, border: `1px solid ${T.border}`,
                  borderRadius: 5, color: T.pale, fontSize: '0.82rem',
                  fontFamily: "'DM Mono', monospace", padding: '4px 6px', textAlign: 'right',
                }}
              />
            </div>
            <div style={{ textAlign: 'right', minWidth: 64 }}>
              <div style={{ ...MONO, fontSize: '0.8rem', color: T.pale }}>{sym}{fmt(hypoVal)}</div>
              {Math.abs(hypoChange) > 0.01 && (
                <div style={{ ...MONO, fontSize: '0.7rem', color: pnlColor(hypoChange, T) }}>
                  {hypoChange >= 0 ? '+' : ''}{sym}{fmt(Math.abs(hypoChange))}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Tab: Growth ───────────────────────────────────────────────────────────────
function GrowthTab({ growth, milestones }: { growth: GrowthScore[]; milestones: Milestone[] }) {
  const T = useTheme()
  const [expandedDim, setExpandedDim] = useState<string | null>(null)

  if (growth.length === 0) {
    return (
      <div style={{ padding: '0 12px' }}>
        <div data-testid="growth-empty" style={{
          background: T.card, borderRadius: 10, padding: '24px',
          textAlign: 'center', color: T.mid, fontSize: '0.85rem',
        }}>
          No growth data for this snapshot
        </div>
      </div>
    )
  }

  const ordered = ['K', 'S', 'E'].map(d => growth.find(g => g.dimension === d)).filter(Boolean) as GrowthScore[]

  return (
    <div style={{ padding: '0 12px' }}>
      {/* K/S/E dimension scores */}
      {ordered.map(g => {
        const color = DIM_COLOR[g.dimension] ?? T.orange
        const label = DIM_LABEL[g.dimension] ?? g.dimension
        const items: string[] = (() => {
          try { return JSON.parse(g.items_json) } catch { return [] }
        })()
        const isOpen = expandedDim === g.dimension
        return (
          <div key={g.dimension} data-testid={`growth-dimension-${g.dimension}`}
            onClick={() => setExpandedDim(isOpen ? null : g.dimension)}
            style={{ background: T.card, borderRadius: 10, marginBottom: 8, ...lb(color, T), overflow: 'hidden', cursor: 'pointer' }}>
            <div style={{ padding: '12px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ ...MONO, fontSize: '1rem', fontWeight: 700, color }}>{g.dimension}</span>
                  <span style={{ fontWeight: 600, color: T.pale, fontSize: '0.85rem' }}>{label}</span>
                  <span style={{ ...TAG, background: color + '22', color }}>{g.level ?? 'Developing'}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span data-testid={`growth-score-${g.dimension}`} style={{ ...MONO, fontSize: '1.1rem', fontWeight: 700, color }}>
                    {g.score}
                  </span>
                  <span style={{ fontSize: '0.7rem', color: T.mid }}>{isOpen ? '▲' : '▼'}</span>
                </div>
              </div>
              {/* Score bar */}
              <div style={{ height: 4, background: T.inset, borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(g.score / 5) * 100}%`, background: color, borderRadius: 2 }} />
              </div>
            </div>
            {isOpen && (
              <div style={{ borderTop: `1px solid ${T.border}`, padding: '10px 14px', background: T.inset }}>
                <div style={{ fontSize: '0.72rem', color: T.mid, marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Accomplished
                </div>
                {items.map((item, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                    <span style={{ color: T.green, fontSize: '0.75rem', flexShrink: 0 }}>✓</span>
                    <span style={{ fontSize: '0.78rem', color: T.pale, lineHeight: 1.4 }}>{item}</span>
                  </div>
                ))}
                {g.next_text && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: '0.72rem', color: color, marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Next
                    </div>
                    <div data-testid={`growth-next-${g.dimension}`} style={{ fontSize: '0.78rem', color: T.pale, lineHeight: 1.5 }}>
                      {g.next_text}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}

      {/* Milestones */}
      {milestones.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: '0.72rem', color: T.mid, marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Milestones
          </div>
          {milestones.map((m, i) => {
            const tags: string[] = (() => { try { return JSON.parse(m.tags_json) } catch { return [] } })()
            return (
              <div key={m.id ?? i} style={{
                display: 'flex', gap: 10, paddingBottom: 8, marginBottom: 8,
                borderBottom: `1px solid ${T.border}`,
              }}>
                <div style={{ textAlign: 'right', minWidth: 52, flexShrink: 0 }}>
                  <span style={{ ...MONO, fontSize: '0.72rem', color: T.mid }}>{m.date}</span>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: 4, marginBottom: 3 }}>
                    {tags.map(t => (
                      <span key={t} style={{ ...TAG, background: (DIM_COLOR[t] ?? T.mid) + '22', color: DIM_COLOR[t] ?? T.mid }}>
                        {t}
                      </span>
                    ))}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: T.pale, lineHeight: 1.4 }}>{m.text}</div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export function PortfolioClient() {
  const { showToast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [snapshot, setSnapshot] = useState<SnapResponse | null | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [tab, setTab] = useState<Tab>('holdings')
  const [view, setView] = useState<'dashboard' | 'news'>('dashboard')
  const [portfolioTickers, setPortfolioTickers] = useState<string[]>([])
  const [showDownloads, setShowDownloads] = useState(false)
  const [dark, setDark] = useState(() =>
    typeof document === 'undefined' ? true : document.documentElement.dataset.theme !== 'light'
  )

  useEffect(() => {
    const obs = new MutationObserver(() => {
      setDark(document.documentElement.dataset.theme !== 'light')
    })
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => obs.disconnect()
  }, [])

  const theme = dark ? DARK : LIGHT

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/portfolio/snapshots')
      if (!res.ok) { showToast('Failed to load portfolio', 'error'); return }
      const snap = await res.json()
      setSnapshot(snap)
    } catch { showToast('Failed to load portfolio', 'error') }
    finally { setLoading(false) }
  }, [showToast])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    function onOpenUpload() { fileRef.current?.click() }
    window.addEventListener('portfolio:open-upload', onOpenUpload)
    return () => window.removeEventListener('portfolio:open-upload', onOpenUpload)
  }, [])

  async function handleFile(file: File) {
    setUploading(true)
    try {
      const html = await file.text()
      const res = await fetch('/api/portfolio', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html, snapshot_date: new Date().toISOString() }),
      })
      const data = await res.json()
      if (!res.ok) { showToast(data.error || 'Parse failed', 'error'); return }
      showToast(`Imported ${data.holdings_count} holdings`, 'success')

      // Extract tickers for the News sub-view
      try {
        const form = new FormData()
        form.append('file', file)
        const tickerRes = await fetch('/api/news/upload', { method: 'POST', body: form })
        if (tickerRes.ok) {
          const { tickers } = await tickerRes.json() as { tickers: string[] }
          setPortfolioTickers(tickers)
        }
      } catch { /* ticker extraction is best-effort */ }

      await load()
    } catch { showToast('Upload failed', 'error') }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = '' }
  }

  const BTN_SEC: React.CSSProperties = {
    padding: '0.35rem 0.85rem', borderRadius: 6, cursor: 'pointer',
    fontSize: '0.8rem', fontWeight: 600, background: theme.inset, color: theme.pale,
    border: `1px solid ${theme.border}`,
  }

  const themeToggle = (
    <button
      aria-label="toggle theme"
      onClick={() => setDark(d => !d)}
      style={{
        background: 'none', border: `1px solid ${theme.border}`, borderRadius: 6,
        cursor: 'pointer', fontSize: '1rem', padding: '4px 8px', color: theme.pale,
      }}
    >
      {dark ? '🌙' : '☀️'}
    </button>
  )

  // Snapshot-dependent values (only used in dashboard view when snapshot exists)
  const holdings = snapshot?.holdings ?? []
  const total_value = snapshot?.total_value ?? 0
  const unrealised_pnl = snapshot?.unrealised_pnl ?? null
  const realised_pnl = snapshot?.realised_pnl ?? null
  const cash = snapshot?.cash ?? null
  const totalUSD = holdings.reduce((s, h) => s + valueUSD(h), 0)
  const pnlPct = unrealised_pnl !== null && total_value > 0
    ? (unrealised_pnl / (total_value - (unrealised_pnl ?? 0))) * 100 : null

  return (
    <ThemeCtx.Provider value={theme}>
      <div
        data-theme={dark ? 'dark' : 'light'}
        style={{ minHeight: '100vh', background: theme.bg, color: theme.pale, fontFamily: "'Sora', system-ui, sans-serif" }}
      >
        <div style={WRAP}>

          {/* Topbar — always visible */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '14px 16px 10px', borderBottom: `1px solid ${theme.border}`,
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 700, fontSize: '1rem', color: theme.pale }}>Portfolio</span>
                {snapshot?.snap_label && (
                  <span data-testid="snap-label" style={{ ...TAG, background: theme.orange + '22', color: theme.orange, fontSize: '0.72rem' }}>
                    {snapshot.snap_label}
                  </span>
                )}
              </div>
              {snapshot && (
                <div style={{ fontSize: '0.7rem', color: theme.mid, marginTop: 1 }}>
                  {snapshot.snap_time ?? snapshot.snapshot_date.slice(0, 10)} · {holdings.length} holdings
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input ref={fileRef} type="file" accept=".html,.htm" style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
              <button style={BTN_SEC} onClick={() => setShowDownloads(true)}>
                Downloads
              </button>
              {themeToggle}
            </div>
          </div>

          {/* Dashboard | News toggle — always visible */}
          <ViewToggle view={view} onSwitch={setView} theme={theme} />

          {/* Content */}
          {view === 'news' ? (
            <NewsClient sharedTickers={portfolioTickers} />
          ) : loading ? (
            <div style={{ padding: '3rem 1.5rem', textAlign: 'center', color: theme.mid }}>Loading…</div>
          ) : !snapshot ? (
            <div>
              <div style={{ padding: '2rem 1.5rem 0', textAlign: 'center', color: theme.pale, fontWeight: 600, fontSize: '1.1rem' }}>No portfolio data yet</div>
              <UploadArea onUploaded={load} />
            </div>
          ) : (
            <>
              {/* KPI row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, padding: '10px 12px' }}>
                {[
                  {
                    label: 'Value',
                    primary: `$${fmt(total_value)}`,
                    secondary: Math.abs(totalUSD - total_value) > 10 ? `~$${fmt(totalUSD)} USD` : null,
                    color: theme.pale,
                  },
                  {
                    label: 'Unrealised',
                    primary: unrealised_pnl !== null ? `${unrealised_pnl >= 0 ? '+' : ''}$${fmt(Math.abs(unrealised_pnl))}` : '—',
                    secondary: pnlPct !== null ? fmtPct(pnlPct) : null,
                    color: unrealised_pnl !== null ? pnlColor(unrealised_pnl, theme) : theme.mid,
                  },
                  {
                    label: 'Realised',
                    primary: realised_pnl !== null ? `${realised_pnl >= 0 ? '+' : ''}$${fmt(Math.abs(realised_pnl))}` : `${holdings.length} pos`,
                    secondary: cash !== null ? `Cash $${fmt(cash)}` : null,
                    color: realised_pnl !== null ? pnlColor(realised_pnl, theme) : theme.pale,
                  },
                ].map(k => (
                  <div key={k.label} style={{ background: theme.card, border: `1px solid ${theme.border}`, borderRadius: 10, padding: '10px 12px' }}>
                    <div style={{ fontSize: '0.63rem', color: theme.mid, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3 }}>{k.label}</div>
                    <div style={{ ...MONO, fontSize: '0.92rem', fontWeight: 700, color: k.color }}>{k.primary}</div>
                    {k.secondary && <div style={{ ...MONO, fontSize: '0.65rem', color: k.color, opacity: 0.75 }}>{k.secondary}</div>}
                  </div>
                ))}
              </div>

              {/* Tab bar */}
              <div style={{
                display: 'flex', overflowX: 'auto', padding: '4px 12px 0',
                borderBottom: `1px solid ${theme.border}`,
                scrollbarWidth: 'none',
              }}>
                {TABS.map(t => (
                  <button key={t.id} onClick={() => setTab(t.id)} style={{
                    background: 'none', border: 'none', cursor: 'pointer', padding: '8px 10px',
                    fontSize: '0.78rem', fontWeight: tab === t.id ? 700 : 400, whiteSpace: 'nowrap',
                    color: tab === t.id ? theme.orange : theme.mid,
                    borderBottom: tab === t.id ? `2px solid ${theme.orange}` : '2px solid transparent',
                    transition: 'color 0.15s',
                  }}>
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              <div style={{ paddingTop: 12 }}>
                {tab === 'holdings' && <HoldingsTab holdings={holdings} />}
                {tab === 'orders'   && <OrdersTab orders={snapshot.orders} snap={snapshot} />}
                {tab === 'geo'      && <GeoTab holdings={holdings} />}
                {tab === 'sector'   && <SectorTab holdings={holdings} />}
                {tab === 'pnl'      && <PnlTab holdings={holdings} snap={snapshot} />}
                {tab === 'whatif'   && <WhatIfTab holdings={holdings} />}
                {tab === 'growth'   && <GrowthTab growth={snapshot.growth} milestones={snapshot.milestones} />}
              </div>
            </>
          )}

        </div>
      </div>
      <DownloadsModal open={showDownloads} onClose={() => setShowDownloads(false)} />
    </ThemeCtx.Provider>
  )
}
