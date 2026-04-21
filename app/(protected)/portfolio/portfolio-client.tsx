'use client'

import { useEffect, useRef, useState, useCallback, useContext, createContext } from 'react'
import { useToast } from '../components/toast'
import type { Holding } from '@/lib/types'

// ── Theme tokens ────────────────────────────────────────────────────────────────
const DARK = {
  bg:     '#0E1117',
  card:   '#161C27',
  border: '#242C3A',
  pale:   '#C8D0DC',
  mid:    '#6B7A92',
  inset:  '#0A0D14',
  title:  '#FFFFFF',
  orange: '#E8520A',
  green:  '#3DD68C',
  red:    '#FF5A5A',
  yellow: '#F5C842',
  teal:   '#06D6A0',
}
const LIGHT = {
  bg:     '#F5F5F7',
  card:   '#FFFFFF',
  border: '#E0E0E7',
  pale:   '#1A1D2B',
  mid:    '#6B7A92',
  inset:  '#EAEAEE',
  title:  '#0A0D14',
  orange: '#E8520A',
  green:  '#3DD68C',
  red:    '#FF5A5A',
  yellow: '#F5C842',
  teal:   '#06D6A0',
}
type Theme = typeof DARK
const ThemeCtx = createContext<Theme>(DARK)
function useTheme() { return useContext(ThemeCtx) }

// ── Color constants ─────────────────────────────────────────────────────────────
const COL = {
  orange: '#E8520A', slate: '#4A6FA5', green: '#3DD68C',
  red: '#FF5A5A', yellow: '#F5C842', purple: '#9B6DFF',
  pink: '#FF6B9D', teal: '#06D6A0', amber: '#F0A500',
  sky: '#38BDF8', lime: '#A3E635', agri: '#84CC16',
}

const SECTOR_COLOR: Record<string, string> = {
  'ETF':               COL.slate,
  'Technology':        COL.purple,
  'Metals':            COL.yellow,
  'Financials':        COL.green,
  'Media':             COL.orange,
  'Healthcare':        COL.pink,
  'Utilities':         COL.teal,
  'Energy':            COL.amber,
  'Telecommunications':COL.sky,
  'Consumer Staples':  COL.lime,
  'Agriculture ETF':   COL.agri,
  'Software':          COL.purple,
  'Materials':         COL.yellow,
}

const GEO_COLOR: Record<string, string> = {
  US: COL.slate, SG: COL.orange, UK: COL.green, HK: COL.yellow,
}

const FX: Record<string, number> = { USD: 1, SGD: 0.7852, GBP: 1.29 }

// ── Ticker metadata fallback ────────────────────────────────────────────────────
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
  V:     { geo: 'US', sector: 'Financials',           currency: 'USD' },
  BUD:   { geo: 'US', sector: 'Consumer Staples',     currency: 'USD' },
  KO:    { geo: 'US', sector: 'Consumer Staples',     currency: 'USD' },
  PM:    { geo: 'US', sector: 'Consumer Staples',     currency: 'USD' },
  DD:    { geo: 'US', sector: 'Materials',            currency: 'USD' },
  TEAM:  { geo: 'US', sector: 'Software',             currency: 'USD' },
  ULVR:  { geo: 'UK', sector: 'Consumer Staples',     currency: 'GBP' },
}

function getTickerMeta(ticker?: string): { geo: 'US'|'SG'|'UK'|'HK'; sector: string; currency: string } {
  if (!ticker) return { geo: 'US', sector: 'ETF', currency: 'USD' }
  return TICKER_META[ticker.toUpperCase()] ?? { geo: 'US', sector: 'ETF', currency: 'USD' }
}

// ── Types ───────────────────────────────────────────────────────────────────────
interface SnapResponse {
  id: string
  snapshot_date: string
  total_value: number
  total_pnl: number | null
  holdings: Holding[]
  // summary fields
  cash?: number
  pending?: number
  realised_pnl?: number
  prior_value?: number
  prior_unrealised?: number
  prior_realised?: number
  snap_label?: string
  prior_holdings_count?: number
}

interface Order {
  ticker: string
  geo?: string
  type: string
  price: number
  qty: number
  currency?: string
  placed?: string
  current_price?: number
  note?: string
  is_new?: boolean
}

interface RealisedTrade {
  id: string
  ticker: string
  pnl: number
}

interface GrowthScore {
  dimension: string
  score: number
  label: string
  level: string
  items: string[]
  next_action?: string
}

interface Milestone {
  id: string
  date: string
  tags: string[]
  text: string
}

type Tab = 'holdings' | 'orders' | 'geo' | 'sector' | 'pnl' | 'whatif' | 'growth'
const TABS: { id: Tab; label: string }[] = [
  { id: 'holdings', label: 'Holdings' },
  { id: 'orders',   label: 'Orders'   },
  { id: 'geo',      label: 'Geo'      },
  { id: 'sector',   label: 'Sector'   },
  { id: 'pnl',      label: 'P&L'      },
  { id: 'whatif',   label: 'What If'  },
  { id: 'growth',   label: 'Growth'   },
]

// ── Utils ────────────────────────────────────────────────────────────────────────
function sectorColor(sector?: string) { return SECTOR_COLOR[sector ?? ''] ?? COL.slate }
function geoColor(geo?: string) { return GEO_COLOR[geo ?? ''] ?? COL.slate }
function pnlColor(n: number | undefined | null, T: Theme) {
  if (n === undefined || n === null) return T.mid
  return n >= 0 ? T.green : T.red
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
function currSym(currency: string) {
  return currency === 'SGD' ? 'S$' : currency === 'GBP' ? '£' : '$'
}

// ── Shared style atoms ──────────────────────────────────────────────────────────
const MONO: React.CSSProperties = { fontFamily: "'DM Mono', 'Courier New', monospace" }
const TAG: React.CSSProperties = {
  display: 'inline-block', fontSize: '0.65rem', fontWeight: 700, padding: '1px 5px',
  borderRadius: 4, letterSpacing: '0.04em',
}
const WRAP: React.CSSProperties = { maxWidth: 430, margin: '0 auto', padding: '0 0 80px' }

// ── Sparkline (mulberry32 PRNG — deterministic per ticker) ──────────────────────
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

// ── Upload panel ────────────────────────────────────────────────────────────────
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

// ── Holdings tab ────────────────────────────────────────────────────────────────
function HoldingsTab({ holdings, orders }: { holdings: Holding[]; orders: Order[] }) {
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
        const sym = currSym(currency)
        const weightPct = totalUSD > 0 ? (valueUSD(h) / totalUSD) * 100 : 0
        // Limit orders from API
        const limitOrders = h.ticker ? orders.filter(o => o.ticker === h.ticker) : []
        const hasSell = h.sell_limit !== undefined || limitOrders.some(o => o.type === 'SELL LIMIT')
        const hasBuy  = h.buy_limit  !== undefined || limitOrders.some(o => o.type === 'BUY LIMIT')

        return (
          <div
            key={key}
            data-testid={`holding-card-${key}`}
            style={{ background: T.card, borderRadius: 10, marginBottom: 8, ...lb(sc), cursor: 'pointer', overflow: 'hidden' }}
            onClick={() => toggle(key)}
          >
            {/* Main row */}
            <div style={{ padding: '10px 12px 8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ ...MONO, fontSize: '0.95rem', fontWeight: 700, color: T.title }}>
                      {h.ticker ?? h.name.slice(0, 8)}
                    </span>
                    <span style={{ ...TAG, background: gc + '22', color: gc }}>{geo}</span>
                    {h.is_new && (
                      <span style={{ ...TAG, background: COL.teal + '22', color: COL.teal }}>NEW</span>
                    )}
                    {hasSell && (
                      <span
                        data-testid={`limit-badge-${h.ticker}`}
                        style={{ ...TAG, background: COL.purple + '22', color: COL.purple }}
                      >SELL</span>
                    )}
                    {hasBuy && (
                      <span
                        data-testid={`limit-badge-${h.ticker}`}
                        style={{ ...TAG, background: COL.green + '22', color: COL.green }}
                      >BUY</span>
                    )}
                    {h.approx && <span style={{ fontSize: '0.65rem', color: T.mid }}>~APPROX</span>}
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
                    <div style={{ ...MONO, fontSize: '0.78rem', color: pnlColor(h.pnl, T) }}>
                      {h.pnl >= 0 ? '+' : ''}{sym}{fmt(Math.abs(h.pnl))}
                      {h.pnl_pct !== undefined && (
                        <span style={{ marginLeft: 4, opacity: 0.85 }}>{fmtPct(h.pnl_pct)}</span>
                      )}
                    </div>
                  )}
                  {h.change_1d_pct !== undefined && (
                    <div
                      data-testid={`change-1d-${h.ticker}`}
                      style={{ ...MONO, fontSize: '0.72rem', color: pnlColor(h.change_1d_pct, T) }}
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
                {h.avg_cost !== undefined && (
                  <div>
                    <div style={{ fontSize: '0.65rem', color: T.mid, marginBottom: 2 }}>AVG COST</div>
                    <div style={{ ...MONO, fontSize: '0.82rem', color: T.pale }}>{sym}{fmt(h.avg_cost)}</div>
                  </div>
                )}
                {/* Target price progress bar */}
                {h.target !== undefined && h.avg_cost !== undefined && h.current_price !== undefined && (
                  <div data-testid={`target-bar-${h.ticker}`} style={{ gridColumn: '1 / -1', marginTop: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: T.mid, marginBottom: 4 }}>
                      <span>ENTRY {sym}{fmt(h.avg_cost)}</span>
                      <span style={{ color: COL.orange }}>TARGET {sym}{fmt(h.target)}</span>
                    </div>
                    {(() => {
                      const range = h.target - h.avg_cost
                      const curr = h.current_price - h.avg_cost
                      const pct = range > 0 ? Math.max(0, Math.min(100, (curr / range) * 100)) : 0
                      return (
                        <div style={{ height: 5, background: T.border, borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: COL.orange, borderRadius: 3 }} />
                        </div>
                      )
                    })()}
                    <div style={{ ...MONO, fontSize: '0.68rem', color: T.mid, marginTop: 3 }}>
                      {sym}{fmt(h.current_price)} · {sym}{fmt(h.target)} target
                    </div>
                  </div>
                )}
                {/* Sell limit row */}
                {(h.sell_limit !== undefined || limitOrders.some(o => o.type === 'SELL LIMIT')) && (() => {
                  const price = h.sell_limit ?? limitOrders.find(o => o.type === 'SELL LIMIT')?.price
                  if (price === undefined) return null
                  const dist = h.current_price ? (((price - h.current_price) / h.current_price) * 100).toFixed(1) : null
                  return (
                    <div style={{ gridColumn: '1 / -1', fontSize: '0.78rem', color: COL.purple }}>
                      SELL LIMIT {sym}{fmt(price)}{dist !== null ? ` · ${dist}% away` : ''}
                    </div>
                  )
                })()}
                {/* Buy limit row */}
                {(h.buy_limit !== undefined || limitOrders.some(o => o.type === 'BUY LIMIT')) && (() => {
                  const price = h.buy_limit ?? limitOrders.find(o => o.type === 'BUY LIMIT')?.price
                  if (price === undefined) return null
                  const dist = h.current_price ? (((price - h.current_price) / h.current_price) * 100).toFixed(1) : null
                  return (
                    <div style={{ gridColumn: '1 / -1', fontSize: '0.78rem', color: COL.green }}>
                      BUY LIMIT {sym}{fmt(price)}{dist !== null ? ` · ${dist}% from current` : ''}
                    </div>
                  )
                })()}
              </div>
            )}
          </div>
        )
      })}
      <div style={{ fontSize: '0.68rem', color: T.mid, textAlign: 'center', marginTop: 8 }}>
        SPARKLINES INDICATIVE · NON-USD APPROXIMATED (SGD 0.7852 · GBP ~1.29)
      </div>
    </div>
  )
}

// ── Orders tab ──────────────────────────────────────────────────────────────────
function OrdersTab({ orders, holdings }: { orders: Order[]; holdings: Holding[] }) {
  const T = useTheme()
  function lb(col: string): React.CSSProperties {
    return {
      borderTop: `1px solid ${T.border}`, borderRight: `1px solid ${T.border}`,
      borderBottom: `1px solid ${T.border}`, borderLeft: `4px solid ${col}`,
    }
  }

  return (
    <div style={{ padding: '0 12px' }}>
      <div style={{ fontSize: '0.72rem', color: T.mid, marginBottom: 12, textAlign: 'center' }}>
        {orders.length} open order{orders.length !== 1 ? 's' : ''}
      </div>
      {orders.map((o, i) => {
        const isBuy = o.type.includes('BUY')
        const typeColor = isBuy ? COL.green : COL.purple
        const currency = o.currency ?? 'USD'
        const sym = currSym(currency)
        const gc = geoColor(o.geo ?? 'US')
        const h = holdings.find(hh => hh.ticker === o.ticker)
        const curPrice = o.current_price ?? h?.current_price
        const fillDist = curPrice
          ? isBuy
            ? ((curPrice - o.price) / o.price) * 100
            : ((o.price - curPrice) / curPrice) * 100
          : null
        const distance = curPrice ? ((o.price - curPrice) / curPrice) * 100 : null
        const progress = curPrice
          ? isBuy
            ? Math.max(0, Math.min(100, (o.price / curPrice) * 100))
            : Math.max(0, Math.min(100, (curPrice / o.price) * 100))
          : null

        return (
          <div key={i} style={{ background: T.card, borderRadius: 10, marginBottom: 8, ...lb(typeColor), padding: '12px 14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ ...MONO, fontWeight: 700, color: T.title }}>{o.ticker}</span>
                  <span style={{ ...TAG, background: gc + '22', color: gc }}>{o.geo ?? 'US'}</span>
                  <span style={{ ...TAG, background: typeColor + '22', color: typeColor }}>{o.type}</span>
                  {o.is_new && (
                    <span style={{ ...TAG, background: COL.teal + '22', color: COL.teal }}>NEW</span>
                  )}
                </div>
                <div style={{ fontSize: '0.72rem', color: T.mid, marginTop: 2 }}>
                  Qty {o.qty}{o.placed ? ` · ${o.placed}` : ''}
                </div>
                {o.note && <div style={{ fontSize: '0.72rem', color: T.pale, marginTop: 4 }}>{o.note}</div>}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ ...MONO, fontSize: '1.1rem', fontWeight: 700, color: T.title }}>
                  {sym}{fmt(o.price)}
                </div>
                {distance !== null && (
                  <div style={{ fontSize: '0.72rem', color: distance >= 0 ? T.green : T.red, fontFamily: 'monospace', marginTop: 2 }}>
                    {distance >= 0 ? '+' : ''}{distance.toFixed(1)}%
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
            {curPrice && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: T.mid, marginTop: 3, ...MONO }}>
                <span>now {sym}{fmt(curPrice)}</span>
                <span>limit {sym}{fmt(o.price)}</span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Geo tab (custom SVG donut) ──────────────────────────────────────────────────
function GeoTab({ holdings }: { holdings: Holding[] }) {
  const T = useTheme()
  function lb(col: string): React.CSSProperties {
    return {
      borderTop: `1px solid ${T.border}`, borderRight: `1px solid ${T.border}`,
      borderBottom: `1px solid ${T.border}`, borderLeft: `4px solid ${col}`,
    }
  }

  const geos = ['US', 'SG', 'UK', 'HK'] as const
  const totalUSD = holdings.reduce((s, h) => s + valueUSD(h), 0)
  const byGeo = geos
    .map(g => {
      const hs = holdings.filter(h => holdingGeo(h) === g)
      const val = hs.reduce((s, h) => s + valueUSD(h), 0)
      return { geo: g, val, pct: totalUSD > 0 ? (val / totalUSD) * 100 : 0, count: hs.length }
    })
    .filter(g => g.val > 0)

  // Custom SVG donut
  const size = 180
  const stroke = 32
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  let cumulative = 0
  const segments = byGeo.map(g => {
    const start = cumulative
    cumulative += g.pct
    return { ...g, start, end: cumulative }
  })

  return (
    <div style={{ padding: '0 12px' }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
        <svg width={size} height={size}>
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={T.inset} strokeWidth={stroke} />
          {segments.map((s, i) => (
            <circle key={i}
              cx={size / 2} cy={size / 2} r={radius}
              fill="none" stroke={geoColor(s.geo)} strokeWidth={stroke}
              strokeDasharray={`${(s.pct / 100) * circumference} ${circumference}`}
              strokeDashoffset={-((s.start / 100) * circumference)}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          ))}
          <text x="50%" y="46%" textAnchor="middle" fontFamily="DM Mono" fontSize="11" fill={T.mid}>TOTAL</text>
          <text x="50%" y="58%" textAnchor="middle" fontFamily="DM Mono" fontSize="14" fontWeight="600" fill={T.title}>${totalUSD.toFixed(0)}</text>
        </svg>
      </div>
      {byGeo.map(g => (
        <div key={g.geo} style={{ background: T.card, borderRadius: 10, marginBottom: 8, ...lb(geoColor(g.geo)), padding: '10px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ ...TAG, background: geoColor(g.geo) + '22', color: geoColor(g.geo), fontSize: '0.75rem', padding: '2px 8px' }}>{g.geo}</span>
              <span style={{ color: T.mid, fontSize: '0.8rem' }}>{g.count} holding{g.count !== 1 ? 's' : ''}</span>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ ...MONO, color: T.pale, fontSize: '0.88rem', fontWeight: 600 }}>~${fmt(g.val)}</div>
              <div style={{ ...MONO, fontSize: '0.75rem', color: geoColor(g.geo) }}>{g.pct.toFixed(1)}%</div>
            </div>
          </div>
          <div style={{ marginTop: 8, height: 4, background: T.inset, borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${g.pct}%`, background: geoColor(g.geo), borderRadius: 2 }} />
          </div>
        </div>
      ))}
      <div style={{ fontSize: '0.68rem', color: T.mid, textAlign: 'center', marginTop: 8 }}>
        ~USD totals · SGD≈0.7852 · GBP≈1.29
      </div>
    </div>
  )
}

// ── Sector tab ──────────────────────────────────────────────────────────────────
function SectorTab({ holdings }: { holdings: Holding[] }) {
  const T = useTheme()
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
  const maxVal = sectors[0]?.val ?? 1

  return (
    <div style={{ padding: '0 12px' }}>
      <div style={{ background: T.card, padding: 14, borderRadius: 10, border: `1px solid ${T.border}`, marginBottom: 12 }}>
        {sectors.map(s => {
          const barWidth = (s.val / maxVal) * 100
          const col = sectorColor(s.sector)
          return (
            <div key={s.sector} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: 3 }}>
                <span style={{ color: T.pale }}>{s.sector}</span>
                <span style={{ color: col, ...MONO }}>{s.pct.toFixed(1)}%</span>
              </div>
              <div style={{ height: 6, background: T.inset, borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${barWidth}%`, height: '100%', background: col, borderRadius: 3 }} />
              </div>
            </div>
          )
        })}
      </div>
      <div style={{ fontSize: '0.68rem', color: T.mid, textAlign: 'center', marginTop: 8 }}>
        ~USD totals · NON-USD APPROXIMATED
      </div>
    </div>
  )
}

// ── P&L tab ─────────────────────────────────────────────────────────────────────
function PnlTab({
  holdings, snap, realised,
}: {
  holdings: Holding[]
  snap: SnapResponse
  realised: RealisedTrade[]
}) {
  const T = useTheme()
  const cardBase: React.CSSProperties = { background: T.card, borderRadius: 10, marginBottom: 8 }

  const unrealisedPnL = snap.total_pnl ?? holdings.reduce((s, h) => s + (h.pnl ?? 0), 0)
  const realisedPnL   = snap.realised_pnl ?? 0
  const priorUnrealisedPnL = snap.prior_unrealised ?? 0
  const priorRealisedPnL   = snap.prior_realised   ?? 0

  const withPnl = holdings.filter(h => h.pnl !== undefined)
  const sorted  = [...withPnl].sort((a, b) => (b.pnl ?? 0) - (a.pnl ?? 0))
  const maxAbs  = Math.max(...sorted.map(h => Math.abs(h.pnl ?? 0)), 1)

  return (
    <div style={{ padding: '0 12px' }}>
      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
        <div style={{ ...cardBase, padding: 14 }}>
          <div style={{ fontSize: '0.68rem', color: T.mid, letterSpacing: 1, textTransform: 'uppercase' }}>Unrealised</div>
          <div style={{ ...MONO, fontSize: '1.4rem', fontWeight: 600, color: pnlColor(unrealisedPnL, T), marginTop: 4 }}>
            {unrealisedPnL >= 0 ? '+' : ''}${fmt(Math.abs(unrealisedPnL))}
          </div>
          {priorUnrealisedPnL !== 0 && (
            <div style={{ ...MONO, fontSize: '0.68rem', color: T.mid }}>
              {unrealisedPnL - priorUnrealisedPnL >= 0 ? '+' : ''}${fmt(Math.abs(unrealisedPnL - priorUnrealisedPnL))} vs prior
            </div>
          )}
        </div>
        <div style={{ ...cardBase, padding: 14 }}>
          <div style={{ fontSize: '0.68rem', color: T.mid, letterSpacing: 1, textTransform: 'uppercase' }}>Realised</div>
          <div style={{ ...MONO, fontSize: '1.4rem', fontWeight: 600, color: pnlColor(realisedPnL, T), marginTop: 4 }}>
            {realisedPnL >= 0 ? '+' : ''}${fmt(Math.abs(realisedPnL))}
          </div>
          {priorRealisedPnL !== 0 && (
            <div style={{ ...MONO, fontSize: '0.68rem', color: T.mid }}>
              {realisedPnL - priorRealisedPnL >= 0 ? '+' : ''}${fmt(Math.abs(realisedPnL - priorRealisedPnL))} vs prior
            </div>
          )}
        </div>
      </div>
      {/* Gainers/Losers waterfall */}
      <div style={{ ...cardBase, padding: '10px 14px', marginBottom: 12 }}>
        <div style={{ fontSize: '0.72rem', color: COL.orange, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>
          Gainers / Losers · Unrealised
        </div>
        {sorted.map(h => {
          const pnl = h.pnl ?? 0
          const barW = (Math.abs(pnl) / maxAbs) * 100
          const color = pnlColor(pnl, T)
          const currency = holdingCurrency(h)
          const sym = currSym(currency)
          return (
            <div key={h.ticker ?? h.name} style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ ...MONO, fontSize: '0.82rem', color: T.pale, fontWeight: 600 }}>
                  {h.ticker ?? h.name.slice(0, 10)}
                </span>
                <span style={{ ...MONO, fontSize: '0.78rem', color }}>{pnl >= 0 ? '+' : ''}{sym}{fmt(Math.abs(pnl))}</span>
              </div>
              <div style={{ height: 5, background: T.inset, borderRadius: 2, overflow: 'hidden',
                display: 'flex', justifyContent: pnl >= 0 ? 'flex-start' : 'flex-end' }}>
                <div style={{ width: `${barW}%`, height: '100%', background: color, borderRadius: 2 }} />
              </div>
            </div>
          )
        })}
      </div>
      {/* Realised breakdown from API */}
      {realised.length > 0 && (
        <div style={{ ...cardBase, padding: '10px 14px' }}>
          <div style={{ fontSize: '0.72rem', color: COL.orange, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>
            Realised breakdown · +${fmt(realisedPnL)}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {realised.map(r => (
              <div key={r.id} style={{
                padding: '5px 10px', background: T.inset, border: `1px solid ${T.border}`,
                borderRadius: 16, fontSize: '0.72rem', ...MONO,
                color: r.pnl >= 0 ? COL.green : COL.red,
              }}>
                {r.ticker}: {r.pnl >= 0 ? '+' : ''}${fmt(Math.abs(r.pnl))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── What-If tab ─────────────────────────────────────────────────────────────────
function WhatIfTab({ holdings }: { holdings: Holding[] }) {
  const T = useTheme()
  const [deltas, setDeltas] = useState<Record<string, number>>({})
  const [preset, setPreset] = useState<string | null>(null)

  function applyPreset(name: string, pct: number) {
    const n: Record<string, number> = {}
    holdings.forEach(h => { n[h.ticker ?? h.name] = pct })
    setDeltas(n); setPreset(name)
  }
  function reset() { setDeltas({}); setPreset(null) }

  const sorted = [...holdings].sort((a, b) => valueUSD(b) - valueUSD(a))
  const currentTotal = sorted.reduce((a, h) => a + valueUSD(h), 0)
  const scenarioTotal = sorted.reduce((a, h) => {
    const key = h.ticker ?? h.name
    const d = deltas[key] || 0
    return a + valueUSD(h) * (1 + d / 100)
  }, 0)
  const scenarioDelta = scenarioTotal - currentTotal

  return (
    <div style={{ padding: '0 12px' }}>
      {/* Scenario summary */}
      <div style={{ background: T.card, padding: 14, borderRadius: 10, border: `1px solid ${T.border}`, marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '0.68rem', color: T.mid, letterSpacing: 1 }}>SCENARIO</div>
            <div style={{ ...MONO, fontSize: '1.2rem', fontWeight: 600, color: T.title }}>
              ${scenarioTotal.toFixed(2)}
            </div>
            <div style={{ ...MONO, fontSize: '0.8rem', color: pnlColor(scenarioDelta, T), marginTop: 2 }}>
              {scenarioDelta >= 0 ? '+' : ''}${scenarioDelta.toFixed(2)}
              {' · '}{scenarioDelta >= 0 ? '+' : ''}{((scenarioDelta / currentTotal) * 100).toFixed(2)}%
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.68rem', color: T.mid, letterSpacing: 1 }}>NOW</div>
            <div style={{ ...MONO, fontSize: '1rem', fontWeight: 600, color: T.pale }}>
              ${currentTotal.toFixed(2)}
            </div>
          </div>
        </div>
      </div>
      {/* Presets */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {[['Crash', -20], ['Dip', -10], ['Flat', 0], ['Rally', 10], ['Moon', 25]].map(([name, pct]) => (
          <button key={String(name)} onClick={() => applyPreset(String(name), Number(pct))}
            style={{ flex: 1, minWidth: 60, padding: '8px 4px', borderRadius: 6,
              background: preset === name ? COL.orange : T.inset,
              color: preset === name ? '#fff' : T.pale,
              border: `1px solid ${preset === name ? COL.orange : T.border}`,
              fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'Sora, sans-serif' }}>
            {name}<br /><span style={{ fontSize: '0.65rem', opacity: 0.7 }}>{Number(pct) >= 0 ? '+' : ''}{pct}%</span>
          </button>
        ))}
        <button onClick={reset} style={{ padding: '8px 12px', borderRadius: 6, background: T.inset, color: T.mid,
          border: `1px solid ${T.border}`, fontSize: '0.72rem', cursor: 'pointer', fontFamily: 'Sora, sans-serif' }}>Reset</button>
      </div>
      {/* Per-holding sliders */}
      {sorted.map(h => {
        const key = h.ticker ?? h.name
        const d = deltas[key] || 0
        const newVal = valueUSD(h) * (1 + d / 100)
        const diff = newVal - valueUSD(h)
        const sc = sectorColor(holdingSector(h))
        return (
          <div key={key} style={{ background: T.card, padding: '10px 14px', marginBottom: 6, borderRadius: 8,
            borderTop: `1px solid ${T.border}`, borderRight: `1px solid ${T.border}`,
            borderBottom: `1px solid ${T.border}`, borderLeft: `4px solid ${sc}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ ...MONO, fontWeight: 600, color: T.title }}>{key}</span>
              <span style={{ ...MONO, fontSize: '0.8rem', color: pnlColor(diff, T) }}>
                {diff >= 0 ? '+' : ''}${diff.toFixed(2)}
              </span>
            </div>
            <input type="range" min="-50" max="50" value={d}
              onChange={e => { setDeltas({ ...deltas, [key]: parseInt(e.target.value) }); setPreset(null) }}
              style={{ width: '100%', accentColor: sc }} />
            <div style={{ ...MONO, fontSize: '0.68rem', color: T.mid, marginTop: 2,
              display: 'flex', justifyContent: 'space-between' }}>
              <span>{d >= 0 ? '+' : ''}{d}%</span><span>${newVal.toFixed(2)}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Score ring SVG ──────────────────────────────────────────────────────────────
function ScoreRing({ score, color, size = 72, stroke = 6 }: { score: number; color: string; size?: number; stroke?: number }) {
  const T = useTheme()
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const pct = score / 10
  const offset = circumference * (1 - pct)
  return (
    <svg width={size} height={size}>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={T.border} strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="52%" textAnchor="middle" dominantBaseline="middle"
        fontFamily="DM Mono" fontSize="20" fontWeight="600" fill={color}>{score}</text>
    </svg>
  )
}

// ── Growth tab ──────────────────────────────────────────────────────────────────
function GrowthTab({ growth }: { growth: { scores: GrowthScore[]; milestones: Milestone[] } }) {
  const T = useTheme()
  const [expanded, setExpanded] = useState<string | null>(null)

  const tagCol: Record<string, string> = { K: COL.slate, S: COL.orange, E: COL.green }
  const scores = growth.scores
  const milestones = growth.milestones

  return (
    <div style={{ padding: '0 12px' }}>
      {scores.length > 0 ? (
        <>
          {/* Score rings row */}
          <div style={{ display: 'flex', justifyContent: 'space-around', background: T.card,
            padding: '16px 8px', borderRadius: 10, border: `1px solid ${T.border}`, marginBottom: 16 }}>
            {scores.map(s => {
              const dim = s.dimension
              const col = tagCol[dim] ?? COL.slate
              return (
                <div key={dim} onClick={() => setExpanded(expanded === dim ? null : dim)}
                  style={{ textAlign: 'center', cursor: 'pointer' }}>
                  <ScoreRing score={s.score} color={col} />
                  <div style={{ fontSize: '0.78rem', color: T.pale, marginTop: 6, fontWeight: 600 }}>{s.label}</div>
                  <div style={{ fontSize: '0.65rem', color: T.mid, letterSpacing: 1 }}>{(s.level ?? '').toUpperCase()}</div>
                </div>
              )
            })}
          </div>
          {/* Expanded dimension detail */}
          {expanded && (() => {
            const s = scores.find(sc => sc.dimension === expanded)
            if (!s) return null
            const col = tagCol[expanded] ?? COL.slate
            return (
              <div style={{ background: T.card, padding: 14, borderRadius: 10,
                borderTop: `1px solid ${T.border}`, borderRight: `1px solid ${T.border}`,
                borderBottom: `1px solid ${T.border}`, borderLeft: `4px solid ${col}`, marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ fontWeight: 600, color: T.title }}>{s.label}</div>
                  <div style={{ ...MONO, fontSize: '0.78rem', color: T.mid }}>{s.score}/10 · {s.level}</div>
                </div>
                <div style={{ fontSize: '0.78rem', color: T.pale, marginBottom: 8 }}>Items logged:</div>
                {(s.items ?? []).map((it, i) => (
                  <div key={i} style={{ fontSize: '0.78rem', color: T.mid, padding: '3px 0', lineHeight: 1.5 }}>• {it}</div>
                ))}
                {s.next_action && (
                  <div style={{ fontSize: '0.72rem', color: col, marginTop: 10, fontStyle: 'italic' }}>
                    Next: {s.next_action}
                  </div>
                )}
              </div>
            )
          })()}
        </>
      ) : (
        <div style={{ background: T.card, padding: 24, borderRadius: 10, border: `1px solid ${T.border}`,
          textAlign: 'center', color: T.mid, fontSize: '0.85rem', marginBottom: 16 }}>
          No growth scores yet
        </div>
      )}

      {/* Milestones timeline */}
      {milestones.length > 0 && (
        <>
          <div style={{ fontSize: '0.78rem', color: COL.orange, letterSpacing: 1, textTransform: 'uppercase',
            marginBottom: 10, padding: '0 4px' }}>Milestones</div>
          <div style={{ position: 'relative', paddingLeft: 20 }}>
            <div style={{ position: 'absolute', left: 7, top: 0, bottom: 0, width: 1, background: T.border }} />
            {milestones.map((m, i) => (
              <div key={m.id ?? i} style={{ position: 'relative', marginBottom: 12 }}>
                <div style={{ position: 'absolute', left: -17, top: 5, width: 10, height: 10,
                  borderRadius: '50%', background: T.bg, border: `2px solid ${COL.orange}` }} />
                <div style={{ background: T.card, padding: '8px 12px', borderRadius: 8, border: `1px solid ${T.border}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ ...MONO, fontSize: '0.72rem', color: T.mid }}>{m.date}</div>
                    <div style={{ display: 'flex', gap: 3 }}>
                      {(m.tags ?? []).map(tag => (
                        <span key={tag} style={{ fontSize: '0.62rem', padding: '2px 6px', borderRadius: 3,
                          background: `${tagCol[tag] ?? COL.slate}22`, color: tagCol[tag] ?? COL.slate, fontWeight: 600 }}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: T.pale, marginTop: 3 }}>{m.text}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Main component ──────────────────────────────────────────────────────────────
export function PortfolioClient() {
  const { showToast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [snapshot, setSnapshot] = useState<SnapResponse | null | undefined>(undefined)
  const [orders, setOrders] = useState<Order[]>([])
  const [realised, setRealised] = useState<RealisedTrade[]>([])
  const [growth, setGrowth] = useState<{ scores: GrowthScore[]; milestones: Milestone[] }>({ scores: [], milestones: [] })
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [tab, setTab] = useState<Tab>('holdings')
  const [dark, setDark] = useState(true)

  const theme = dark ? DARK : LIGHT

  const load = useCallback(async () => {
    try {
      const [snapRes, ordersRes, realisedRes, growthRes] = await Promise.all([
        fetch('/api/portfolio'),
        fetch('/api/portfolio/orders'),
        fetch('/api/portfolio/realised'),
        fetch('/api/portfolio/growth'),
      ])
      const snap = await snapRes.json()
      setSnapshot(snap)

      if (ordersRes.ok) {
        const ords = await ordersRes.json()
        setOrders(Array.isArray(ords) ? ords : [])
      }
      if (realisedRes.ok) {
        const rlz = await realisedRes.json()
        setRealised(Array.isArray(rlz) ? rlz : [])
      }
      if (growthRes.ok) {
        const grw = await growthRes.json()
        setGrowth(grw && typeof grw === 'object' ? grw : { scores: [], milestones: [] })
      }
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
        <div data-theme={dark ? 'dark' : 'light'} style={{ minHeight: '100vh', background: theme.bg, color: theme.pale, fontFamily: "'Sora', system-ui, sans-serif" }}>
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
        <div data-theme={dark ? 'dark' : 'light'} style={{ minHeight: '100vh', background: theme.bg, color: theme.pale, fontFamily: "'Sora', system-ui, sans-serif" }}>
          <div style={WRAP}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '14px 16px 0' }}>{themeToggle}</div>
            <UploadPanel onUploaded={load} />
          </div>
        </div>
      </ThemeCtx.Provider>
    )
  }

  const { holdings, total_value, snapshot_date } = snapshot
  const snap_label  = snapshot.snap_label ?? ''
  const cash        = snapshot.cash        ?? 0
  const pending     = snapshot.pending     ?? 0
  const urz         = snapshot.total_pnl   ?? 0
  const rlz         = snapshot.realised_pnl ?? 0
  const priorValue  = snapshot.prior_value  ?? 0
  const deltaValue  = priorValue > 0 ? total_value - priorValue : 0
  const deltaPct    = priorValue > 0 ? (deltaValue / priorValue) * 100 : 0
  const snapDate    = snapshot_date.length >= 10 ? snapshot_date.slice(0, 10) : snapshot_date

  return (
    <ThemeCtx.Provider value={theme}>
      <div
        data-theme={dark ? 'dark' : 'light'}
        style={{ minHeight: '100vh', background: theme.bg, color: theme.pale, fontFamily: "'Sora', system-ui, sans-serif" }}
      >
        <div style={WRAP}>

          {/* Sticky header */}
          <div style={{
            position: 'sticky', top: 0, zIndex: 10, background: theme.bg,
            borderBottom: `1px solid ${theme.border}`,
            padding: '12px 16px 0',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: '0.65rem', color: COL.orange, letterSpacing: 2, fontWeight: 700 }}>
                  SYFE PORTFOLIO
                </div>
                <div style={{ ...MONO, fontSize: '1.5rem', fontWeight: 700, color: theme.title, marginTop: 2 }}>
                  ${total_value.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
                <div style={{ ...MONO, fontSize: '0.72rem', color: theme.mid }}>
                  {snap_label ? `${snap_label} · ` : ''}{snapDate}
                </div>
                {priorValue > 0 && (
                  <div style={{ display: 'flex', gap: 8, fontSize: '0.72rem', ...MONO, marginTop: 3 }}>
                    <span style={{ color: deltaValue >= 0 ? theme.green : theme.red }}>
                      {deltaValue >= 0 ? '+' : ''}${Math.abs(deltaValue).toFixed(2)}
                    </span>
                    <span style={{ color: theme.mid }}>vs prior</span>
                    <span style={{ color: deltaValue >= 0 ? theme.green : theme.red }}>
                      {deltaPct >= 0 ? '+' : ''}{deltaPct.toFixed(2)}%
                    </span>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                {themeToggle}
                <input ref={fileRef} type="file" accept=".html,.htm" style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
              </div>
            </div>
            {/* 4-cell KPI mini-bar */}
            <div style={{ display: 'flex', gap: 4, marginTop: 10, marginBottom: 10, fontSize: '0.72rem', ...MONO }}>
              {[
                { label: 'CASH', value: `$${cash.toFixed(0)}`,    color: theme.pale },
                { label: 'PEND', value: `$${pending.toFixed(0)}`, color: theme.yellow },
                { label: 'URZ',  value: `${urz >= 0 ? '+' : ''}$${Math.abs(urz).toFixed(0)}`, color: urz >= 0 ? theme.green : theme.red },
                { label: 'RLZ',  value: `${rlz >= 0 ? '+' : ''}$${Math.abs(rlz).toFixed(0)}`, color: rlz >= 0 ? theme.green : theme.red },
              ].map(k => (
                <div key={k.label} style={{ flex: 1, textAlign: 'center', padding: '4px 0', background: theme.inset, borderRadius: 4 }}>
                  <div style={{ color: theme.mid, fontSize: '0.6rem' }}>{k.label}</div>
                  <div style={{ color: k.color, fontSize: '0.72rem' }}>{k.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Sticky tab bar */}
          <div style={{
            position: 'sticky', top: 130, zIndex: 9, background: theme.bg,
            display: 'flex', overflowX: 'auto', padding: '0 4px',
            borderBottom: `1px solid ${theme.border}`,
            scrollbarWidth: 'none',
          }}>
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: '10px 12px',
                fontSize: '0.78rem', fontWeight: tab === t.id ? 700 : 400, whiteSpace: 'nowrap',
                color: tab === t.id ? theme.orange : theme.mid,
                borderBottom: tab === t.id ? `2px solid ${theme.orange}` : '2px solid transparent',
                transition: 'color 0.15s', fontFamily: "'Sora', system-ui, sans-serif",
              }}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div style={{ paddingTop: 12 }}>
            {tab === 'holdings' && <HoldingsTab holdings={holdings} orders={orders} />}
            {tab === 'orders'   && <OrdersTab   orders={orders}     holdings={holdings} />}
            {tab === 'geo'      && <GeoTab       holdings={holdings} />}
            {tab === 'sector'   && <SectorTab    holdings={holdings} />}
            {tab === 'pnl'      && <PnlTab       holdings={holdings} snap={snapshot} realised={realised} />}
            {tab === 'whatif'   && <WhatIfTab     holdings={holdings} />}
            {tab === 'growth'   && <GrowthTab    growth={growth} />}
          </div>

          <div style={{ padding: '16px 16px 24px', borderTop: `1px solid ${theme.border}`,
            fontSize: '0.65rem', color: theme.mid, textAlign: 'center', ...MONO }}>
            INDICATIVE · NON-USD APPROXIMATED (SGD 0.7852 · GBP ~1.29) · NOT FINANCIAL ADVICE
          </div>

        </div>
      </div>
    </ThemeCtx.Provider>
  )
}
