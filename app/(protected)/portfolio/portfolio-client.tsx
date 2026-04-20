'use client'

import { useEffect, useRef, useState, useCallback, useContext, createContext } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { useToast } from '../components/toast'
import type { Holding } from '@/lib/types'

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
// C = dark constants used in theme-independent statics (sector/geo colors)
const C = DARK

// ── Static color maps ──────────────────────────────────────────────────────────
const SECTOR_COLOR: Record<string, string> = {
  'ETF':               '#4A6FA5',
  'Technology':        '#9B6DFF',
  'Metals':            '#F5C842',
  'Financials':        '#3DD68C',
  'Media':             '#E8520A',
  'Healthcare':        '#FF6B9D',
  'Utilities':         '#06D6A0',
  'Energy':            '#F0A500',
  'Telecommunications':'#38BDF8',
  'Consumer Staples':  '#A3E635',
  'Agriculture ETF':   '#84CC16',
}
const GEO_COLOR: Record<string, string> = {
  US: '#4A6FA5', SG: '#E8520A', UK: '#3DD68C', HK: '#F5C842',
}
const FX: Record<string, number> = { USD: 1, SGD: 0.74, GBP: 1.29 }

// ── Ticker metadata fallback ───────────────────────────────────────────────────
const TICKER_META: Record<string, { geo: 'US'|'SG'|'UK'|'HK'; sector: string; currency: string }> = {
  MU:    { geo: 'US', sector: 'Technology',          currency: 'USD' },
  ABBV:  { geo: 'US', sector: 'Healthcare',           currency: 'USD' },
  Z74:   { geo: 'SG', sector: 'Telecommunications',   currency: 'SGD' },
  NEE:   { geo: 'US', sector: 'Utilities',            currency: 'USD' },
  GOOG:  { geo: 'US', sector: 'Technology',           currency: 'USD' },
  GOOGL: { geo: 'US', sector: 'Technology',           currency: 'USD' },
  SLB:   { geo: 'US', sector: 'Energy',               currency: 'USD' },
  PG:    { geo: 'US', sector: 'Consumer Staples',     currency: 'USD' },
  RING:  { geo: 'US', sector: 'Metals',               currency: 'USD' },
  AGIX:  { geo: 'US', sector: 'ETF',                  currency: 'USD' },
  NFLX:  { geo: 'US', sector: 'Media',                currency: 'USD' },
  D05:   { geo: 'SG', sector: 'Financials',           currency: 'SGD' },
  CMCL:  { geo: 'US', sector: 'Metals',               currency: 'USD' },
  MOO:   { geo: 'US', sector: 'Agriculture ETF',      currency: 'USD' },
  FXI:   { geo: 'HK', sector: 'ETF',                  currency: 'USD' },
  WISE:  { geo: 'UK', sector: 'Financials',           currency: 'GBP' },
  ICLN:  { geo: 'US', sector: 'ETF',                  currency: 'USD' },
  QQQ:   { geo: 'US', sector: 'ETF',                  currency: 'USD' },
  AAPL:  { geo: 'US', sector: 'Technology',           currency: 'USD' },
  MSFT:  { geo: 'US', sector: 'Technology',           currency: 'USD' },
  AMZN:  { geo: 'US', sector: 'Technology',           currency: 'USD' },
  NVDA:  { geo: 'US', sector: 'Technology',           currency: 'USD' },
  META:  { geo: 'US', sector: 'Media',                currency: 'USD' },
  TSLA:  { geo: 'US', sector: 'Technology',           currency: 'USD' },
}

function getTickerMeta(ticker?: string): { geo: 'US'|'SG'|'UK'|'HK'; sector: string; currency: string } {
  if (!ticker) return { geo: 'US', sector: 'ETF', currency: 'USD' }
  return TICKER_META[ticker.toUpperCase()] ?? { geo: 'US', sector: 'ETF', currency: 'USD' }
}

// ── Static Snap 19 data ────────────────────────────────────────────────────────
const OPEN_ORDERS = [
  { ticker: 'AGIX', geo: 'US', type: 'BUY LIMIT',  currency: 'USD', price: 15.39, qty: 2,   placed: '08 Apr 01:17 SGT' },
  { ticker: 'NEE',  geo: 'US', type: 'SELL LIMIT', currency: 'USD', price: 95.88, qty: 5,   placed: '07 Apr 20:47 SGT' },
  { ticker: 'ABBV', geo: 'US', type: 'SELL LIMIT', currency: 'USD', price: 218.00, qty: 3,  placed: '07 Apr 20:44 SGT' },
  { ticker: 'WISE', geo: 'UK', type: 'SELL LIMIT', currency: 'GBP', price: 11.28, qty: 10,  placed: '03 Apr 00:22 SGT' },
  { ticker: 'Z74',  geo: 'SG', type: 'SELL LIMIT', currency: 'SGD', price: 5.25,  qty: 100, placed: '02 Apr 19:22 SGT' },
]

const UPCOMING_DIVS = [
  { ticker: 'CMCL', name: 'Caledonia Mining', amount: 0.14, currency: 'USD', exDate: '17 Apr 2026', qty: 10 },
]

const THESIS: Record<string, { thesis: string; entry: string; status: string; risk: string }> = {
  MU: {
    thesis: 'HBM/AI infrastructure play. One of only 3 global DRAM manufacturers. Nvidia HBM3E supply chain. AI capex cycle supports sustained DRAM pricing.',
    entry: 'avg cost $337.20, qty 5, target $500',
    status: 'INTACT: price rising, AI capex news positive, no DRAM inventory glut news',
    risk: 'DRAM inventory cycle turns, major customer cuts AI capex, China competition escalates',
  },
  ABBV: {
    thesis: 'Lowest pharma risk score (3.4 composite) across 6 peers. Humira patent cliff already priced in. Growth now Skyrizi + Rinvoq. Strong dividend (~3.5-4% yield).',
    entry: 'avg cost $213.20, qty 3 — research-driven entry from 5-factor pharma analysis',
    status: 'EXIT PLAN: SELL LIMIT $218 active',
    risk: 'Pipeline failure, FDA action on Skyrizi/Rinvoq, IRA surprise, management change',
  },
}

const PRICE_TARGETS: Record<string, number> = {
  MU: 500,
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface SnapResponse {
  id: string
  snapshot_date: string
  total_value: number
  total_pnl: number | null
  holdings: Holding[]
}

type Tab = 'holdings' | 'orders' | 'geo' | 'sector' | 'dividends' | 'pnl' | 'thesis'
const TABS: { id: Tab; label: string }[] = [
  { id: 'holdings',  label: 'Holdings' },
  { id: 'orders',    label: 'Orders' },
  { id: 'geo',       label: 'Geo' },
  { id: 'sector',    label: 'Sector' },
  { id: 'dividends', label: 'Dividends' },
  { id: 'pnl',       label: 'P&L' },
  { id: 'thesis',    label: 'Thesis' },
]

// ── Utils ─────────────────────────────────────────────────────────────────────
function sectorColor(sector?: string) { return SECTOR_COLOR[sector ?? ''] ?? '#6B7A92' }
function geoColor(geo?: string) { return GEO_COLOR[geo ?? ''] ?? '#6B7A92' }
function pnlColor(n: number | undefined | null) {
  if (n === undefined || n === null) return C.mid
  return n >= 0 ? C.green : C.red
}
function fmt(n: number, d = 2) {
  return n.toLocaleString('en-SG', { minimumFractionDigits: d, maximumFractionDigits: d })
}
function fmtPct(n: number) { return (n >= 0 ? '+' : '') + fmt(n, 2) + '%' }
function valueUSD(h: Holding): number {
  const currency = h.currency ?? 'USD'
  return h.market_value * (FX[currency] ?? 1)
}
function holdingGeo(h: Holding): 'US' | 'SG' | 'UK' | 'HK' {
  return h.geo ?? getTickerMeta(h.ticker).geo
}
function holdingSector(h: Holding): string {
  return h.sector ?? getTickerMeta(h.ticker).sector
}
function holdingCurrency(h: Holding): string {
  return h.currency ?? getTickerMeta(h.ticker).currency
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
  const points = raw
    .map((v, i) => {
      const x = ((i / (N - 1)) * width).toFixed(1)
      const y = (height - 2 - ((v - min) / span) * (height - 4)).toFixed(1)
      return `${x},${y}`
    })
    .join(' ')
  return (
    <svg data-testid="sparkline" width={width} height={height} style={{ display: 'block', flexShrink: 0 }}>
      <polyline points={points} fill="none" stroke={strokeColor} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ── Shared style atoms (theme-independent) ─────────────────────────────────────
const MONO: React.CSSProperties = { fontFamily: "'DM Mono', 'Courier New', monospace" }
const TAG: React.CSSProperties = {
  display: 'inline-block', fontSize: '0.65rem', fontWeight: 700, padding: '1px 5px',
  borderRadius: 4, letterSpacing: '0.04em',
}
const WRAP: React.CSSProperties = { maxWidth: 430, margin: '0 auto', padding: '0 0 80px' }

// ── Upload panel ──────────────────────────────────────────────────────────────
function UploadPanel({ onUploaded }: { onUploaded: () => void }) {
  const T = useTheme()
  const { showToast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [drag, setDrag] = useState(false)

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
      onUploaded()
    } catch { showToast('Upload failed', 'error') }
    finally { setUploading(false) }
  }

  const BTN: React.CSSProperties = {
    padding: '0.35rem 0.85rem', borderRadius: 6, border: 'none', cursor: 'pointer',
    fontSize: '0.8rem', fontWeight: 600, background: T.orange, color: '#fff',
  }

  return (
    <div style={{ padding: '4rem 1.5rem', textAlign: 'center' }}>
      <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📊</div>
      <div style={{ color: T.pale, fontSize: '1.1rem', fontWeight: 600, marginBottom: 8 }}>No portfolio data yet</div>
      <div style={{ color: T.mid, fontSize: '0.85rem', marginBottom: 24, lineHeight: 1.6 }}>
        Go to your Syfe portfolio page, press Ctrl+S to save as HTML, then upload here.
      </div>
      <div
        onClick={() => fileRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
        style={{
          border: `2px dashed ${drag ? T.orange : T.border}`, borderRadius: 10,
          padding: '2.5rem', cursor: 'pointer', marginBottom: 12,
          background: drag ? 'rgba(232,82,10,0.05)' : 'transparent',
        }}
      >
        <div style={{ color: drag ? T.orange : T.mid, fontSize: '0.9rem' }}>
          {uploading ? 'Parsing…' : 'Drop HTML file here, or click to browse'}
        </div>
      </div>
      <input ref={fileRef} type="file" accept=".html,.htm" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
      <button style={BTN} onClick={() => fileRef.current?.click()} disabled={uploading}>
        {uploading ? 'Importing…' : 'Choose File'}
      </button>
    </div>
  )
}

// ── Tab: Holdings ─────────────────────────────────────────────────────────────
function HoldingsTab({ holdings }: { holdings: Holding[] }) {
  const T = useTheme()
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const sorted = [...holdings].sort((a, b) => valueUSD(b) - valueUSD(a))
  const totalUSD = sorted.reduce((s, h) => s + valueUSD(h), 0)

  function lb(col: string): React.CSSProperties {
    return {
      borderTop: `1px solid ${T.border}`, borderRight: `1px solid ${T.border}`,
      borderBottom: `1px solid ${T.border}`, borderLeft: `4px solid ${col}`,
    }
  }
  const cardBase: React.CSSProperties = { background: T.card, borderRadius: 10, marginBottom: 8 }

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
        const sector = holdingSector(h)
        const geo = holdingGeo(h)
        const currency = holdingCurrency(h)
        const sc = sectorColor(sector)
        const gc = geoColor(geo)
        const sym = currency === 'SGD' ? 'S$' : currency === 'GBP' ? '£' : '$'
        const weightPct = totalUSD > 0 ? (valueUSD(h) / totalUSD) * 100 : 0
        const divMeta = h.ticker ? UPCOMING_DIVS.find(d => d.ticker === h.ticker) : undefined
        const limitOrders = h.ticker ? OPEN_ORDERS.filter(o => o.ticker === h.ticker) : []
        const hasSell = limitOrders.some(o => o.type === 'SELL LIMIT')
        const hasBuy = limitOrders.some(o => o.type === 'BUY LIMIT')
        const target = h.ticker ? PRICE_TARGETS[h.ticker] : undefined

        return (
          <div
            key={key}
            data-testid={`holding-card-${key}`}
            style={{ ...cardBase, ...lb(sc), cursor: 'pointer', overflow: 'hidden' }}
            onClick={() => toggle(key)}
          >
            {/* Main row */}
            <div style={{ padding: '10px 12px 8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ ...MONO, fontSize: '0.95rem', fontWeight: 700, color: T.pale }}>
                      {h.ticker ?? h.name.slice(0, 8)}
                    </span>
                    <span style={{ ...TAG, background: gc + '22', color: gc }}>{geo}</span>
                    {divMeta && (
                      <span style={{ ...TAG, background: C.yellow + '22', color: C.yellow }}>DIV</span>
                    )}
                    {hasSell && (
                      <span
                        data-testid={`limit-badge-${h.ticker}`}
                        style={{ ...TAG, background: C.red + '22', color: C.red }}
                      >SELL</span>
                    )}
                    {hasBuy && (
                      <span
                        data-testid={`limit-badge-${h.ticker}`}
                        style={{ ...TAG, background: C.teal + '22', color: C.teal }}
                      >BUY</span>
                    )}
                    <span style={{ fontSize: '0.7rem', color: T.mid }}>{sector}</span>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: T.mid, marginTop: 2 }}>
                    {h.ticker ? h.name.slice(0, 30) : ''}
                  </div>
                </div>
                {/* Sparkline */}
                {h.ticker && (
                  <div style={{ marginLeft: 8, marginTop: 4, flexShrink: 0 }}>
                    <Sparkline ticker={h.ticker} />
                  </div>
                )}
                {/* Value + P&L + 1D% */}
                <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>
                  <div style={{ ...MONO, fontSize: '0.92rem', fontWeight: 600, color: T.pale }}>
                    {sym}{fmt(h.market_value)}
                  </div>
                  {h.pnl !== undefined && (
                    <div style={{ ...MONO, fontSize: '0.78rem', color: pnlColor(h.pnl) }}>
                      {h.pnl >= 0 ? '+' : ''}{sym}{fmt(Math.abs(h.pnl))}
                      {h.pnl_pct !== undefined && (
                        <span style={{ marginLeft: 4, opacity: 0.85 }}>{fmtPct(h.pnl_pct)}</span>
                      )}
                    </div>
                  )}
                  {h.change_1d_pct !== undefined && (
                    <div
                      data-testid={`change-1d-${h.ticker}`}
                      style={{ ...MONO, fontSize: '0.72rem', color: pnlColor(h.change_1d_pct) }}
                    >
                      {fmtPct(h.change_1d_pct)} 1D
                    </div>
                  )}
                </div>
              </div>
              {/* Weight bar */}
              <div style={{ marginTop: 8, height: 3, background: T.inset, borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(weightPct, 100)}%`, background: sc, borderRadius: 2 }} />
              </div>
              <div style={{ fontSize: '0.68rem', color: T.mid, marginTop: 2 }}>
                {weightPct.toFixed(1)}% of portfolio
              </div>
            </div>
            {/* Expanded detail */}
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
                {h.allocation_pct !== undefined && (
                  <div>
                    <div style={{ fontSize: '0.65rem', color: T.mid, marginBottom: 2 }}>WEIGHT</div>
                    <div style={{ ...MONO, fontSize: '0.82rem', color: T.pale }}>{h.allocation_pct.toFixed(1)}%</div>
                  </div>
                )}
                {divMeta && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <div style={{ fontSize: '0.65rem', color: C.yellow, marginBottom: 2 }}>UPCOMING DIVIDEND</div>
                    <div style={{ fontSize: '0.8rem', color: T.pale }}>
                      ${divMeta.amount}/sh · ex-date {divMeta.exDate}
                    </div>
                  </div>
                )}
                {/* Target price progress bar */}
                {target !== undefined && h.avg_cost !== undefined && h.current_price !== undefined && (
                  <div data-testid={`target-bar-${h.ticker}`} style={{ gridColumn: '1 / -1', marginTop: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: T.mid, marginBottom: 4 }}>
                      <span>ENTRY {sym}{fmt(h.avg_cost)}</span>
                      <span style={{ color: C.orange }}>TARGET {sym}{fmt(target)}</span>
                    </div>
                    {(() => {
                      const range = target - h.avg_cost
                      const curr = h.current_price - h.avg_cost
                      const pct = range > 0 ? Math.max(0, Math.min(100, (curr / range) * 100)) : 0
                      return (
                        <div style={{ height: 5, background: T.border, borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: C.orange, borderRadius: 3 }} />
                        </div>
                      )
                    })()}
                    <div style={{ ...MONO, fontSize: '0.68rem', color: T.mid, marginTop: 3 }}>
                      {sym}{fmt(h.current_price)} · {sym}{fmt(target)} target
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
function OrdersTab({ holdings }: { holdings: Holding[] }) {
  const T = useTheme()
  function lb(col: string): React.CSSProperties {
    return {
      borderTop: `1px solid ${T.border}`, borderRight: `1px solid ${T.border}`,
      borderBottom: `1px solid ${T.border}`, borderLeft: `4px solid ${col}`,
    }
  }
  const cardBase: React.CSSProperties = { background: T.card, borderRadius: 10, marginBottom: 8 }

  return (
    <div style={{ padding: '0 12px' }}>
      <div style={{ fontSize: '0.72rem', color: T.mid, marginBottom: 12, textAlign: 'center' }}>
        Snap 19 · 07:19 SGT 9 Apr 2026
      </div>
      {OPEN_ORDERS.map((o, i) => {
        const isSell = o.type === 'SELL LIMIT'
        const typeColor = isSell ? T.red : T.green
        const sym = o.currency === 'SGD' ? 'S$' : o.currency === 'GBP' ? '£' : '$'
        const gc = geoColor(o.geo)
        const h = holdings.find(hh => hh.ticker === o.ticker)
        const curPrice = h?.current_price
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
          <div key={i} style={{ ...cardBase, ...lb(typeColor), padding: '12px 14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ ...MONO, fontWeight: 700, color: T.pale }}>{o.ticker}</span>
                  <span style={{ ...TAG, background: gc + '22', color: gc }}>{o.geo}</span>
                  <span style={{ ...TAG, background: typeColor + '22', color: typeColor }}>{o.type}</span>
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
                height: '100%',
                width: `${progress ?? 60}%`,
                background: typeColor,
                borderRadius: 2,
                opacity: progress === null ? 0.4 : 1,
              }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Tab: Geo ──────────────────────────────────────────────────────────────────
function GeoTab({ holdings }: { holdings: Holding[] }) {
  const T = useTheme()
  function lb(col: string): React.CSSProperties {
    return {
      borderTop: `1px solid ${T.border}`, borderRight: `1px solid ${T.border}`,
      borderBottom: `1px solid ${T.border}`, borderLeft: `4px solid ${col}`,
    }
  }
  const cardBase: React.CSSProperties = { background: T.card, borderRadius: 10, marginBottom: 8 }

  const geos = ['US', 'SG', 'UK', 'HK'] as const
  const totalUSD = holdings.reduce((s, h) => s + valueUSD(h), 0)
  const byGeo = geos
    .map(g => {
      const hs = holdings.filter(h => holdingGeo(h) === g)
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
        <div key={g.geo} style={{ ...cardBase, ...lb(geoColor(g.geo)), padding: '10px 14px', marginBottom: 8 }}>
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
function SectorTab({ holdings }: { holdings: Holding[] }) {
  const T = useTheme()
  function lb(col: string): React.CSSProperties {
    return {
      borderTop: `1px solid ${T.border}`, borderRight: `1px solid ${T.border}`,
      borderBottom: `1px solid ${T.border}`, borderLeft: `4px solid ${col}`,
    }
  }
  const cardBase: React.CSSProperties = { background: T.card, borderRadius: 10, marginBottom: 8 }

  const totalUSD = holdings.reduce((s, h) => s + valueUSD(h), 0)
  const sectorMap = new Map<string, { val: number; count: number }>()
  for (const h of holdings) {
    const s = holdingSector(h)
    const prev = sectorMap.get(s) ?? { val: 0, count: 0 }
    sectorMap.set(s, { val: prev.val + valueUSD(h), count: prev.count + 1 })
  }
  const sectors = [...sectorMap.entries()]
    .map(([s, d]) => ({ sector: s, val: d.val, count: d.count, pct: totalUSD > 0 ? (d.val / totalUSD) * 100 : 0 }))
    .sort((a, b) => b.val - a.val)

  return (
    <div style={{ padding: '0 12px' }}>
      {sectors.map(s => (
        <div key={s.sector} style={{ ...cardBase, ...lb(sectorColor(s.sector)), padding: '10px 14px', marginBottom: 8 }}>
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

// ── Tab: Dividends ────────────────────────────────────────────────────────────
function DividendsTab({ holdings }: { holdings: Holding[] }) {
  const T = useTheme()
  function lb(col: string): React.CSSProperties {
    return {
      borderTop: `1px solid ${T.border}`, borderRight: `1px solid ${T.border}`,
      borderBottom: `1px solid ${T.border}`, borderLeft: `4px solid ${col}`,
    }
  }
  const cardBase: React.CSSProperties = { background: T.card, borderRadius: 10, marginBottom: 8 }

  return (
    <div style={{ padding: '0 12px' }}>
      <div style={{ fontSize: '0.75rem', color: T.mid, marginBottom: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Upcoming
      </div>
      {UPCOMING_DIVS.map((d, i) => {
        const h = holdings.find(hh => hh.ticker === d.ticker)
        const qty = h?.units ?? d.qty
        const total = d.amount * qty
        return (
          <div key={i} style={{ ...cardBase, ...lb(C.yellow), padding: '12px 14px', marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ ...MONO, fontWeight: 700, color: T.pale }}>{d.ticker}</div>
                <div style={{ color: T.mid, fontSize: '0.78rem', marginTop: 2 }}>{d.name}</div>
                <div style={{ fontSize: '0.72rem', color: C.yellow, marginTop: 4 }}>Ex-date: {d.exDate}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ ...MONO, fontSize: '0.9rem', fontWeight: 600, color: C.yellow }}>${fmt(d.amount)}/sh</div>
                <div style={{ ...MONO, fontSize: '0.78rem', color: T.pale, marginTop: 2 }}>~${fmt(total)} total ({qty} sh)</div>
              </div>
            </div>
          </div>
        )
      })}
      <div style={{ ...cardBase, padding: '16px', textAlign: 'center', color: T.mid, fontSize: '0.82rem' }}>
        Past dividend data not tracked in snapshot
      </div>
    </div>
  )
}

// ── Tab: P&L ─────────────────────────────────────────────────────────────────
function PnlTab({ holdings, totalPnl }: { holdings: Holding[]; totalPnl: number | null }) {
  const T = useTheme()
  const cardBase: React.CSSProperties = { background: T.card, borderRadius: 10, marginBottom: 8 }

  const withPnl = holdings.filter(h => h.pnl !== undefined && h.pnl_pct !== undefined)
  const sorted = [...withPnl].sort((a, b) => (b.pnl_pct ?? 0) - (a.pnl_pct ?? 0))
  const maxAbsPct = Math.max(...sorted.map(h => Math.abs(h.pnl_pct ?? 0)), 1)

  return (
    <div style={{ padding: '0 12px' }}>
      {totalPnl !== null && (
        <div style={{ ...cardBase, padding: '14px', marginBottom: 12, textAlign: 'center' }}>
          <div style={{ fontSize: '0.7rem', color: T.mid, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Unrealised P&L
          </div>
          <div style={{ ...MONO, fontSize: '1.6rem', fontWeight: 700, color: pnlColor(totalPnl) }}>
            {totalPnl >= 0 ? '+' : ''}${fmt(Math.abs(totalPnl))}
          </div>
        </div>
      )}
      <div style={{ ...cardBase, padding: '10px 14px', marginBottom: 12 }}>
        <div style={{ fontSize: '0.72rem', color: T.mid, marginBottom: 2 }}>REALISED (cumulative)</div>
        <div style={{ ...MONO, fontSize: '0.9rem', color: C.green }}>+$9.46</div>
        <div style={{ fontSize: '0.7rem', color: T.mid }}>QQQ +$20.50 · AAPL -$11.03</div>
      </div>
      <div style={{ fontSize: '0.72rem', color: T.mid, marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Holdings ranked by return
      </div>
      {sorted.map((h, i) => {
        const pct = h.pnl_pct ?? 0
        const barW = Math.abs(pct) / maxAbsPct * 100
        const color = pnlColor(pct)
        const currency = holdingCurrency(h)
        const sym = currency === 'SGD' ? 'S$' : currency === 'GBP' ? '£' : '$'
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

// ── Tab: Thesis ───────────────────────────────────────────────────────────────
function ThesisTab({ holdings }: { holdings: Holding[] }) {
  const T = useTheme()
  function lb(col: string): React.CSSProperties {
    return {
      borderTop: `1px solid ${T.border}`, borderRight: `1px solid ${T.border}`,
      borderBottom: `1px solid ${T.border}`, borderLeft: `4px solid ${col}`,
    }
  }
  const cardBase: React.CSSProperties = { background: T.card, borderRadius: 10, marginBottom: 8 }

  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const tickersWithThesis = holdings.filter(h => h.ticker && THESIS[h.ticker])

  function toggle(t: string) {
    setExpanded(prev => { const n = new Set(prev); n.has(t) ? n.delete(t) : n.add(t); return n })
  }

  return (
    <div style={{ padding: '0 12px' }}>
      {tickersWithThesis.length === 0 && (
        <div style={{ ...cardBase, padding: '24px', textAlign: 'center', color: T.mid, fontSize: '0.85rem' }}>
          No thesis notes for current holdings
        </div>
      )}
      {tickersWithThesis.map(h => {
        const ticker = h.ticker!
        const th = THESIS[ticker]
        const isOpen = expanded.has(ticker)
        const sc = sectorColor(holdingSector(h))
        return (
          <div key={ticker} style={{ ...cardBase, ...lb(sc), marginBottom: 8, cursor: 'pointer', overflow: 'hidden' }}
            onClick={() => toggle(ticker)}>
            <div style={{ padding: '10px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ ...MONO, fontWeight: 700, color: T.pale }}>{ticker}</span>
                <span style={{ fontSize: '0.75rem', color: T.mid }}>{isOpen ? '▲' : '▼'}</span>
              </div>
              <div style={{ fontSize: '0.75rem', color: T.mid, marginTop: 2 }}>{th.entry}</div>
            </div>
            {isOpen && (
              <div style={{ borderTop: `1px solid ${T.border}`, padding: '12px 14px', background: T.inset }}>
                <div style={{ fontSize: '0.78rem', color: T.pale, lineHeight: 1.6, marginBottom: 10 }}>{th.thesis}</div>
                <div style={{ fontSize: '0.7rem', color: C.green, marginBottom: 6 }}>✓ {th.status}</div>
                <div style={{ fontSize: '0.7rem', color: C.red }}>⚠ AT RISK IF: {th.risk}</div>
              </div>
            )}
          </div>
        )
      })}
      {holdings.filter(h => h.ticker && !THESIS[h.ticker]).map(h => (
        <div key={h.ticker ?? h.name} style={{ ...cardBase, ...lb(sectorColor(holdingSector(h))), padding: '10px 14px', marginBottom: 8, opacity: 0.5 }}>
          <div style={{ ...MONO, fontSize: '0.82rem', color: T.mid }}>
            {h.ticker ?? h.name.slice(0, 12)} — no thesis notes
          </div>
        </div>
      ))}
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
      const res = await fetch('/api/portfolio')
      const snap = await res.json()
      setSnapshot(snap)
    } catch { showToast('Failed to load portfolio', 'error') }
    finally { setLoading(false) }
  }, [showToast])

  useEffect(() => { load() }, [load])

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

  if (loading) {
    return (
      <ThemeCtx.Provider value={theme}>
        <div style={{ minHeight: '100vh', background: theme.bg, color: theme.pale, fontFamily: "'Sora', system-ui, sans-serif" }}>
          <div style={{ ...WRAP }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '14px 16px 0' }}>{themeToggle}</div>
            <div style={{ padding: '3rem 1.5rem', textAlign: 'center', color: theme.mid }}>Loading…</div>
          </div>
        </div>
      </ThemeCtx.Provider>
    )
  }

  if (!snapshot) {
    return (
      <ThemeCtx.Provider value={theme}>
        <div style={{ minHeight: '100vh', background: theme.bg, color: theme.pale, fontFamily: "'Sora', system-ui, sans-serif" }}>
          <div style={WRAP}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '14px 16px 0' }}>{themeToggle}</div>
            <UploadPanel onUploaded={load} />
          </div>
        </div>
      </ThemeCtx.Provider>
    )
  }

  const { holdings, total_value, total_pnl, snapshot_date } = snapshot
  const totalUSD = holdings.reduce((s, h) => s + valueUSD(h), 0)
  const totalPnlPct = total_pnl !== null && total_value > 0
    ? (total_pnl / (total_value - total_pnl)) * 100 : null

  return (
    <ThemeCtx.Provider value={theme}>
      <div
        data-theme={dark ? 'dark' : 'light'}
        style={{ minHeight: '100vh', background: theme.bg, color: theme.pale, fontFamily: "'Sora', system-ui, sans-serif" }}
      >
        <div style={WRAP}>

          {/* Topbar */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '14px 16px 10px', borderBottom: `1px solid ${theme.border}`,
          }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: '1rem', color: theme.pale }}>Portfolio</div>
              <div style={{ fontSize: '0.7rem', color: theme.mid, marginTop: 1 }}>
                {snapshot_date.slice(0, 10)} · {holdings.length} holdings
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input ref={fileRef} type="file" accept=".html,.htm" style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
              <button style={BTN_SEC} onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? 'Importing…' : 'Update Snapshot'}
              </button>
              {themeToggle}
            </div>
          </div>

          {/* KPI row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, padding: '10px 12px' }}>
            {[
              {
                label: 'Value',
                primary: `S$${fmt(total_value)}`,
                secondary: Math.abs(totalUSD - total_value) > 10 ? `~$${fmt(totalUSD)}` : null,
                color: theme.pale,
              },
              {
                label: 'Unreal P&L',
                primary: total_pnl !== null ? `${total_pnl >= 0 ? '+' : ''}$${fmt(Math.abs(total_pnl))}` : '—',
                secondary: totalPnlPct !== null && total_pnl !== null ? `${fmtPct(totalPnlPct)}` : null,
                color: total_pnl !== null ? pnlColor(total_pnl) : theme.mid,
              },
              { label: 'Holdings', primary: String(holdings.length), secondary: null, color: theme.pale },
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
            {tab === 'holdings'  && <HoldingsTab  holdings={holdings} />}
            {tab === 'orders'    && <OrdersTab    holdings={holdings} />}
            {tab === 'geo'       && <GeoTab       holdings={holdings} />}
            {tab === 'sector'    && <SectorTab    holdings={holdings} />}
            {tab === 'dividends' && <DividendsTab holdings={holdings} />}
            {tab === 'pnl'       && <PnlTab       holdings={holdings} totalPnl={total_pnl} />}
            {tab === 'thesis'    && <ThesisTab    holdings={holdings} />}
          </div>

        </div>
      </div>
    </ThemeCtx.Provider>
  )
}
