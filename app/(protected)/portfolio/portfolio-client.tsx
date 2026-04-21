'use client'

import { useEffect, useRef, useState, useCallback, useContext, createContext } from 'react'
import { useToast } from '../components/toast'

// ── Design tokens ──────────────────────────────────────────────────────────────
const TOKENS = {
  dark: {
    bg: '#0E1117', card: '#161C27', border: '#242C3A',
    pale: '#C8D0DC', mid: '#6B7A92', inset: '#0A0D14', title: '#FFFFFF',
  },
  light: {
    bg: '#F5F5F7', card: '#FFFFFF', border: '#E0E0E7',
    pale: '#1A1D2B', mid: '#6B7A92', inset: '#EAEAEE', title: '#0A0D14',
  },
}
const COL = {
  orange: '#E8520A', slate: '#4A6FA5', green: '#3DD68C',
  red: '#FF5A5A', yellow: '#F5C842', purple: '#9B6DFF',
  pink: '#FF6B9D', teal: '#06D6A0', amber: '#F0A500',
  sky: '#38BDF8', lime: '#A3E635', agri: '#84CC16',
}
const SECTOR_COL: Record<string, string> = {
  'ETF': COL.slate, 'Technology': COL.purple, 'Metals': COL.yellow,
  'Financials': COL.green, 'Media': COL.orange, 'Healthcare': COL.pink,
  'Utilities': COL.teal, 'Energy': COL.amber, 'Telecommunications': COL.sky,
  'Consumer Staples': COL.lime, 'Agriculture ETF': COL.agri,
  'Software': COL.purple, 'Materials': COL.yellow,
}
const GEO_COL: Record<string, string> = {
  US: COL.slate, SG: COL.orange, UK: COL.green, HK: COL.yellow,
}
const FX: Record<string, number> = { USD: 1, SGD: 0.74, GBP: 1.29 }

type ThemeKey = 'dark' | 'light'
type Theme = typeof TOKENS.dark
const ThemeCtx = createContext<Theme>(TOKENS.dark)
function useTheme() { return useContext(ThemeCtx) }

// ── Data types ─────────────────────────────────────────────────────────────────
interface Holding {
  name: string; ticker?: string; units?: number; avg_cost?: number
  current_price?: number; market_value: number; pnl?: number; pnl_pct?: number
  allocation_pct?: number; change_1d_pct?: number; geo?: string; sector?: string
  currency?: string; target?: number; sell_limit?: number; buy_limit?: number
  is_new?: boolean; approx?: boolean; note?: string
  dividend?: { amount: number; date: string }; value_usd?: number
}
interface Order {
  id: string; ticker: string; geo: string; type: string; price: number
  qty: number; currency: string; placed?: string; current_price?: number
  note?: string; new_flag: number
}
interface RealisedTrade { id: string; ticker: string; amount: number }
interface GrowthScore { dimension: string; score: number; level: string; items: string[]; next?: string }
interface Milestone { id: string; date: string; tags: string[]; text: string }
interface SnapResponse {
  id: string; snapshot_date: string; snap_label?: string; snap_time?: string
  total_value: number; total_pnl?: number; cash?: number; pending?: number
  net_invested?: number; realised_pnl?: number; net_deposited?: number; dividends?: number
  prior_value?: number; prior_unrealised?: number; prior_realised?: number
  prior_cash?: number; prior_holdings?: number
  holdings: Holding[]; orders: Order[]; realised_trades: RealisedTrade[]
  growth: GrowthScore[]; milestones: Milestone[]
}

// ── Utils ──────────────────────────────────────────────────────────────────────
const MONO: React.CSSProperties = { fontFamily: "'DM Mono', 'Courier New', monospace" }
const lb = (col: string, w = 1): React.CSSProperties => ({
  borderTop: `${w}px solid ${col}`, borderRight: `${w}px solid ${col}`,
  borderBottom: `${w}px solid ${col}`, borderLeft: `${w}px solid ${col}`,
})
function fmt(v: number, decimals = 2) {
  return Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}
function fmtSigned(v: number, ccy = 'USD') {
  const sym = { USD: '$', SGD: 'S$', GBP: '£' }[ccy] ?? '$'
  return v < 0 ? `-${sym}${fmt(Math.abs(v))}` : `+${sym}${fmt(v)}`
}
function currSym(ccy?: string) { return { SGD: 'S$', GBP: '£' }[ccy ?? ''] ?? '$' }
function valueUSD(h: Holding) { return (h.value_usd ?? h.market_value) * (FX[h.currency ?? 'USD'] ?? 1) }
function secCol(s?: string) { return SECTOR_COL[s ?? ''] ?? COL.slate }
function geoCol(g?: string) { return GEO_COL[g ?? ''] ?? COL.slate }
function pnlColor(n: number, theme: Theme) { return n >= 0 ? COL.green : COL.red }

// ── Sparkline (seeded deterministic) ──────────────────────────────────────────
function seeded(seed: number) {
  let s = seed
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646 }
}
function makeSpark(ticker: string, price: number, len = 20) {
  const seed = ticker.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  const r = seeded(seed)
  const vol = 0.015 + r() * 0.02, drift = (r() - 0.48) * 0.002
  const pts = [price]
  for (let i = 1; i < len; i++) pts.unshift(pts[0] * (1 + drift + (r() - 0.5) * vol))
  pts[len - 1] = price
  return pts
}
function Sparkline({ ticker, price, color, width = 60, height = 20 }: {
  ticker: string; price: number; color: string; width?: number; height?: number
}) {
  const data = makeSpark(ticker, price)
  const min = Math.min(...data), max = Math.max(...data), range = max - min || 1
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * width},${height - ((v - min) / range) * height}`).join(' ')
  return <svg data-testid="sparkline" width={width} height={height} style={{ display: 'block', flexShrink: 0 }}>
    <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
}

// ── Score ring ─────────────────────────────────────────────────────────────────
function ScoreRing({ score, color, size = 72, stroke = 6 }: { score: number; color: string; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - score / 10)
  return (
    <svg width={size} height={size}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#242C3A" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="52%" textAnchor="middle" dominantBaseline="middle"
        fontFamily="DM Mono" fontSize="20" fontWeight="600" fill={color}>{score}</text>
    </svg>
  )
}

// ── Holdings tab ───────────────────────────────────────────────────────────────
function HoldingsTab({ holdings, orders = [] }: { holdings: Holding[]; orders?: Order[] }) {
  const t = useTheme()
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null)
  const total = holdings.reduce((a, h) => a + valueUSD(h), 0)
  const sorted = [...holdings].sort((a, b) => valueUSD(b) - valueUSD(a))
  const sellTickers = new Set(orders.filter(o => o.type.includes('SELL')).map(o => o.ticker))
  const buyTickers = new Set(orders.filter(o => o.type.includes('BUY')).map(o => o.ticker))

  return (
    <div style={{ padding: '8px 0' }}>
      {sorted.map(h => {
        const sc = secCol(h.sector), gc = geoCol(h.geo)
        const weight = (valueUSD(h) / total) * 100
        const isOpen = expandedTicker === h.ticker
        const sym = currSym(h.currency)
        const chgCol = (h.change_1d_pct ?? 0) >= 0 ? COL.green : COL.red
        const pnlCol = (h.pnl ?? 0) >= 0 ? COL.green : COL.red
        return (
          <div key={h.ticker ?? h.name}
            data-testid={`holding-card-${h.ticker ?? h.name}`}
            onClick={() => setExpandedTicker(isOpen ? null : (h.ticker ?? h.name))}
            style={{ background: t.card, marginBottom: 8, borderRadius: 10,
              ...lb(t.border), borderLeftWidth: 3, borderLeftColor: sc,
              cursor: 'pointer', padding: '12px 14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
                {h.ticker && h.current_price !== undefined && (
                  <Sparkline ticker={h.ticker} price={h.current_price} color={sc} />
                )}
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ ...MONO, fontWeight: 700, color: t.title }}>{h.ticker ?? h.name}</span>
                    {h.geo && (
                      <span style={{ fontSize: 9, background: `${gc}20`, color: gc,
                        padding: '2px 5px', borderRadius: 3, letterSpacing: 1 }}>{h.geo}</span>
                    )}
                    {h.is_new && (
                      <span style={{ fontSize: 9, background: `${COL.teal}20`, color: COL.teal,
                        padding: '2px 5px', borderRadius: 3, letterSpacing: 0.5 }}>NEW</span>
                    )}
                    {h.dividend && (
                      <span style={{ fontSize: 9, background: `${COL.yellow}20`, color: COL.yellow,
                        padding: '2px 5px', borderRadius: 3, letterSpacing: 0.5 }}>DIV</span>
                    )}
                    {h.ticker && sellTickers.has(h.ticker) && (
                      <span data-testid={`limit-badge-${h.ticker}`}
                        style={{ fontSize: 9, background: `${COL.red}20`, color: COL.red,
                        padding: '2px 5px', borderRadius: 3, letterSpacing: 0.5 }}>SELL</span>
                    )}
                    {h.ticker && buyTickers.has(h.ticker) && (
                      <span data-testid={`limit-badge-${h.ticker}`}
                        style={{ fontSize: 9, background: `${COL.teal}20`, color: COL.teal,
                        padding: '2px 5px', borderRadius: 3, letterSpacing: 0.5 }}>BUY</span>
                    )}
                    {h.approx && <span style={{ fontSize: 9, color: t.mid }}>~APPROX</span>}
                  </div>
                  <div style={{ fontSize: 10, color: t.mid, marginTop: 2 }}>{h.sector}</div>
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ ...MONO, fontSize: 13, color: t.pale }}>{sym}{fmt(h.market_value)}</div>
                {h.pnl !== undefined && (
                  <div style={{ ...MONO, fontSize: 11, color: pnlCol }}>{fmtSigned(h.pnl, h.currency)}</div>
                )}
                {h.change_1d_pct !== undefined && (
                  <div data-testid={h.ticker ? `change-1d-${h.ticker}` : undefined}
                    style={{ ...MONO, fontSize: 10, color: chgCol, marginTop: 2 }}>
                    {h.change_1d_pct >= 0 ? '+' : ''}{h.change_1d_pct.toFixed(2)}%
                  </div>
                )}
              </div>
            </div>
            <div style={{ marginTop: 8, height: 4, background: t.inset, borderRadius: 2 }}>
              <div style={{ width: `${Math.min(weight * 3.5, 100)}%`, height: '100%', background: sc, borderRadius: 2 }} />
            </div>
            <div style={{ fontSize: 10, color: t.mid, marginTop: 4, ...MONO }}>{weight.toFixed(2)}% weight</div>
            {isOpen && (
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${t.border}`,
                fontSize: 12, color: t.pale }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {h.units !== undefined && (
                    <div><span style={{ color: t.mid }}>Qty: </span><span style={MONO}>{h.units}</span></div>
                  )}
                  {h.current_price !== undefined && (
                    <div><span style={{ color: t.mid }}>Price: </span><span style={MONO}>{sym}{fmt(h.current_price)}</span></div>
                  )}
                  {h.avg_cost !== undefined && (
                    <div><span style={{ color: t.mid }}>Avg cost: </span><span style={MONO}>{sym}{fmt(h.avg_cost)}</span></div>
                  )}
                  <div><span style={{ color: t.mid }}>USD val: </span><span style={MONO}>${fmt(valueUSD(h))}</span></div>
                </div>
                {h.target !== undefined && h.current_price !== undefined && (
                  <div data-testid={h.ticker ? `target-bar-${h.ticker}` : undefined} style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 10, color: t.mid, marginBottom: 3 }}>
                      Target {sym}{fmt(h.target)} · {((h.current_price / h.target) * 100).toFixed(1)}% there
                    </div>
                    <div style={{ height: 5, background: t.inset, borderRadius: 2 }}>
                      <div style={{ width: `${Math.min((h.current_price / h.target) * 100, 100)}%`, height: '100%', background: COL.orange, borderRadius: 2 }} />
                    </div>
                  </div>
                )}
                {h.sell_limit !== undefined && h.current_price !== undefined && (
                  <div style={{ marginTop: 6, fontSize: 11, color: COL.purple }}>
                    SELL LIMIT {sym}{fmt(h.sell_limit)} · {(((h.sell_limit - h.current_price) / h.current_price) * 100).toFixed(1)}% away
                  </div>
                )}
                {h.buy_limit !== undefined && h.current_price !== undefined && (
                  <div style={{ marginTop: 4, fontSize: 11, color: COL.green }}>
                    BUY LIMIT {sym}{fmt(h.buy_limit)} · {(((h.buy_limit - h.current_price) / h.current_price) * 100).toFixed(1)}% from current
                  </div>
                )}
                {h.dividend && (
                  <div style={{ marginTop: 4, fontSize: 11, color: COL.yellow }}>
                    DIV {sym}{fmt(h.dividend.amount)}/sh · ex {h.dividend.date}
                  </div>
                )}
                {h.note && <div style={{ marginTop: 8, fontSize: 11, color: t.mid, fontStyle: 'italic' }}>{h.note}</div>}
              </div>
            )}
          </div>
        )
      })}
      <div style={{ fontSize: 9, color: t.mid, textAlign: 'center', marginTop: 16, ...MONO }}>
        SPARKLINES INDICATIVE · NON-USD APPROXIMATED
      </div>
    </div>
  )
}

// ── Orders tab ─────────────────────────────────────────────────────────────────
function OrdersTab({ orders }: { orders: Order[] }) {
  const t = useTheme()
  return (
    <div style={{ padding: '8px 0' }}>
      {orders.length === 0 && (
        <div style={{ textAlign: 'center', color: t.mid, padding: '2rem', fontSize: '0.9rem' }}>
          No open orders in this snapshot
        </div>
      )}
      {orders.map((o, i) => {
        const gc = geoCol(o.geo)
        const isBuy = o.type.includes('BUY')
        const orderCol = isBuy ? COL.green : COL.purple
        const sym = currSym(o.currency)
        const curPrice = o.current_price
        const distance = curPrice ? ((o.price - curPrice) / curPrice) * 100 : null
        const progress = curPrice
          ? isBuy
            ? Math.min((o.price / curPrice) * 100, 100)
            : Math.min((curPrice / o.price) * 100, 100)
          : null
        return (
          <div key={o.id ?? i} style={{ background: t.card, marginBottom: 8, borderRadius: 10,
            ...lb(t.border), borderLeftWidth: 3, borderLeftColor: orderCol, padding: '12px 14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700, color: t.title, ...MONO }}>{o.ticker}</span>
                  <span style={{ fontSize: 9, background: `${gc}20`, color: gc,
                    padding: '2px 5px', borderRadius: 3, letterSpacing: 1 }}>{o.geo}</span>
                  <span style={{ fontSize: 9, background: `${orderCol}20`, color: orderCol,
                    padding: '2px 5px', borderRadius: 3, letterSpacing: 0.5 }}>{o.type}</span>
                  {!!o.new_flag && (
                    <span style={{ fontSize: 9, background: `${COL.teal}20`, color: COL.teal,
                      padding: '2px 5px', borderRadius: 3, letterSpacing: 0.5 }}>NEW</span>
                  )}
                </div>
                <div style={{ fontSize: 10, color: t.mid, marginTop: 4, ...MONO }}>
                  {o.qty} shares{o.placed ? ` · ${o.placed}` : ''}
                </div>
                {o.note && <div style={{ fontSize: 11, color: t.pale, marginTop: 4 }}>{o.note}</div>}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ ...MONO, fontSize: 16, fontWeight: 600, color: t.title }}>{sym}{fmt(o.price)}</div>
                {distance !== null && (
                  <div style={{ fontSize: 10, color: distance >= 0 ? COL.green : COL.red, ...MONO, marginTop: 2 }}>
                    {distance >= 0 ? '+' : ''}{distance.toFixed(1)}%
                  </div>
                )}
              </div>
            </div>
            {progress !== null && (
              <>
                <div style={{ marginTop: 10, height: 4, background: t.inset, borderRadius: 2 }}>
                  <div style={{ width: `${progress}%`, height: '100%', background: orderCol, borderRadius: 2 }} />
                </div>
                {curPrice !== undefined && curPrice !== null && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: t.mid,
                    marginTop: 3, ...MONO }}>
                    <span>now {sym}{fmt(curPrice)}</span>
                    <span>limit {sym}{fmt(o.price)}</span>
                  </div>
                )}
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Geo tab ────────────────────────────────────────────────────────────────────
function GeoTab({ holdings }: { holdings: Holding[] }) {
  const t = useTheme()
  const byGeo = holdings.reduce<Record<string, number>>((acc, h) => {
    acc[h.geo ?? 'US'] = (acc[h.geo ?? 'US'] ?? 0) + valueUSD(h)
    return acc
  }, {})
  const total = Object.values(byGeo).reduce((a, b) => a + b, 0)
  const entries = Object.entries(byGeo).sort((a, b) => b[1] - a[1])
  let cumulative = 0
  const segments = entries.map(([g, v]) => {
    const pct = (v / total) * 100
    const start = cumulative
    cumulative += pct
    return { geo: g, value: v, pct, start, color: geoCol(g) }
  })
  const size = 180, stroke = 32, radius = (size - stroke) / 2
  const circ = 2 * Math.PI * radius
  return (
    <div style={{ padding: '8px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
        <svg width={size} height={size}>
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={t.inset} strokeWidth={stroke} />
          {segments.map((s, i) => (
            <circle key={i} cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={s.color}
              strokeWidth={stroke}
              strokeDasharray={`${(s.pct / 100) * circ} ${circ}`}
              strokeDashoffset={-((s.start / 100) * circ)}
              transform={`rotate(-90 ${size / 2} ${size / 2})`} />
          ))}
          <text x="50%" y="46%" textAnchor="middle" fontFamily="DM Mono" fontSize="11" fill={t.mid}>TOTAL</text>
          <text x="50%" y="58%" textAnchor="middle" fontFamily="DM Mono" fontSize="14" fontWeight="600" fill={t.title}>${total.toFixed(0)}</text>
        </svg>
      </div>
      {entries.map(([g, v]) => {
        const pct = (v / total) * 100
        const count = holdings.filter(h => (h.geo ?? 'US') === g).length
        const gc = geoCol(g)
        return (
          <div key={g} style={{ background: t.card, padding: '10px 14px', marginBottom: 6, borderRadius: 8,
            ...lb(t.border), borderLeftWidth: 3, borderLeftColor: gc,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 600, color: t.title }}>{g}</div>
              <div style={{ fontSize: 11, color: t.mid, ...MONO }}>{count} holding{count !== 1 ? 's' : ''}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ ...MONO, fontSize: 13, color: t.pale }}>${v.toFixed(2)}</div>
              <div style={{ ...MONO, fontSize: 11, color: gc }}>{pct.toFixed(1)}%</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Sector tab ─────────────────────────────────────────────────────────────────
function SectorTab({ holdings }: { holdings: Holding[] }) {
  const t = useTheme()
  const bySector = holdings.reduce<Record<string, number>>((acc, h) => {
    const s = h.sector ?? 'Other'
    acc[s] = (acc[s] ?? 0) + valueUSD(h)
    return acc
  }, {})
  const total = Object.values(bySector).reduce((a, b) => a + b, 0)
  const entries = Object.entries(bySector).sort((a, b) => b[1] - a[1])
  const maxVal = entries[0]?.[1] ?? 1
  return (
    <div style={{ padding: '8px 0' }}>
      <div style={{ background: t.card, padding: 14, borderRadius: 10, ...lb(t.border), marginBottom: 12 }}>
        {entries.map(([s, v]) => {
          const pct = (v / total) * 100
          const barWidth = (v / maxVal) * 100
          const col = secCol(s)
          return (
            <div key={s} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                <span style={{ color: t.pale }}>{s}</span>
                <span style={{ color: col, ...MONO }}>{pct.toFixed(1)}%</span>
              </div>
              <div style={{ height: 8, background: t.inset, borderRadius: 3 }}>
                <div style={{ width: `${barWidth}%`, height: '100%', background: col, borderRadius: 3 }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── P&L tab ────────────────────────────────────────────────────────────────────
function PnlTab({
  holdings, totalPnl, realisedPnl, realisedTrades,
  priorUnrealised, priorRealised,
}: {
  holdings: Holding[]
  totalPnl?: number
  realisedPnl?: number
  realisedTrades: RealisedTrade[]
  priorUnrealised?: number
  priorRealised?: number
}) {
  const t = useTheme()
  const sorted = [...holdings].filter(h => h.pnl !== undefined).sort((a, b) => (b.pnl ?? 0) - (a.pnl ?? 0))
  const maxAbs = Math.max(...sorted.map(h => Math.abs(h.pnl ?? 0)), 0.01)
  return (
    <div style={{ padding: '8px 0' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
        <div style={{ background: t.card, padding: 14, borderRadius: 10, ...lb(t.border) }}>
          <div style={{ fontSize: 10, color: t.mid, letterSpacing: 1, textTransform: 'uppercase' }}>Unrealised</div>
          <div style={{ fontSize: 22, fontWeight: 600, color: COL.green, ...MONO, marginTop: 4 }}>
            {totalPnl !== undefined ? fmtSigned(totalPnl) : '—'}
          </div>
          {priorUnrealised !== undefined && totalPnl !== undefined && (
            <div style={{ fontSize: 10, color: t.mid, ...MONO }}>
              {fmtSigned(totalPnl - priorUnrealised)} vs prior
            </div>
          )}
        </div>
        <div style={{ background: t.card, padding: 14, borderRadius: 10, ...lb(t.border) }}>
          <div style={{ fontSize: 10, color: t.mid, letterSpacing: 1, textTransform: 'uppercase' }}>Realised</div>
          <div style={{ fontSize: 22, fontWeight: 600, color: COL.green, ...MONO, marginTop: 4 }}>
            {realisedPnl !== undefined ? fmtSigned(realisedPnl) : '—'}
          </div>
          {priorRealised !== undefined && realisedPnl !== undefined && (
            <div style={{ fontSize: 10, color: t.mid, ...MONO }}>
              {fmtSigned(realisedPnl - priorRealised)} · prior
            </div>
          )}
        </div>
      </div>

      {sorted.length > 0 && (
        <div style={{ background: t.card, padding: 14, borderRadius: 10, ...lb(t.border), marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: COL.orange, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>
            Gainers / Losers · Unrealised
          </div>
          {sorted.map(h => {
            const barPct = (Math.abs(h.pnl ?? 0) / maxAbs) * 100
            const col = (h.pnl ?? 0) >= 0 ? COL.green : COL.red
            return (
              <div key={h.ticker ?? h.name} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                  <span style={{ fontWeight: 600, color: t.pale, ...MONO }}>{h.ticker ?? h.name}</span>
                  <span style={{ color: col, ...MONO }}>{fmtSigned(h.pnl ?? 0, h.currency)}</span>
                </div>
                <div style={{ height: 5, background: t.inset, borderRadius: 2,
                  display: 'flex', justifyContent: (h.pnl ?? 0) >= 0 ? 'flex-start' : 'flex-end' }}>
                  <div style={{ width: `${barPct}%`, height: '100%', background: col, borderRadius: 2 }} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {realisedTrades.length > 0 && (
        <div style={{ background: t.card, padding: 14, borderRadius: 10, ...lb(t.border) }}>
          <div style={{ fontSize: 11, color: COL.orange, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>
            Realised breakdown · {realisedPnl !== undefined ? fmtSigned(realisedPnl) : ''}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {realisedTrades.map((r, i) => (
              <div key={i} style={{ padding: '5px 10px', background: t.inset, ...lb(t.border),
                borderRadius: 16, fontSize: 10, ...MONO,
                color: r.amount >= 0 ? COL.green : COL.red }}>
                {r.ticker}: {r.amount >= 0 ? '+' : ''}${Math.abs(r.amount).toFixed(2)}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── What-If tab ────────────────────────────────────────────────────────────────
function WhatIfTab({ holdings }: { holdings: Holding[] }) {
  const t = useTheme()
  const [deltas, setDeltas] = useState<Record<string, number>>({})
  const [preset, setPreset] = useState<string | null>(null)

  function applyPreset(name: string, pct: number) {
    const n: Record<string, number> = {}
    holdings.forEach(h => { if (h.ticker) n[h.ticker] = pct })
    setDeltas(n); setPreset(name)
  }
  function reset() { setDeltas({}); setPreset(null) }

  const currentTotal = holdings.reduce((a, h) => a + valueUSD(h), 0)
  const scenarioTotal = holdings.reduce((a, h) => {
    const d = h.ticker ? (deltas[h.ticker] ?? 0) : 0
    return a + valueUSD(h) * (1 + d / 100)
  }, 0)
  const delta = scenarioTotal - currentTotal

  return (
    <div style={{ padding: '8px 0' }}>
      <div style={{ background: t.card, padding: 14, borderRadius: 10, ...lb(t.border), marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 10, color: t.mid, letterSpacing: 1 }}>SCENARIO</div>
            <div style={{ fontSize: 18, fontWeight: 600, ...MONO, color: t.title }}>${scenarioTotal.toFixed(2)}</div>
            <div style={{ fontSize: 11, ...MONO, color: delta >= 0 ? COL.green : COL.red, marginTop: 2 }}>
              {delta >= 0 ? '+' : ''}${delta.toFixed(2)} · {delta >= 0 ? '+' : ''}{((delta / currentTotal) * 100).toFixed(2)}%
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, color: t.mid, letterSpacing: 1 }}>NOW</div>
            <div style={{ fontSize: 15, fontWeight: 600, ...MONO, color: t.pale }}>${currentTotal.toFixed(2)}</div>
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {([['Crash', -20], ['Dip', -10], ['Flat', 0], ['Rally', 10], ['Moon', 25]] as [string, number][]).map(([name, pct]) => (
          <button key={name} onClick={() => applyPreset(name, pct)}
            style={{ flex: 1, minWidth: 60, padding: '8px 4px', borderRadius: 6,
              background: preset === name ? COL.orange : t.inset,
              color: preset === name ? '#fff' : t.pale,
              ...lb(preset === name ? COL.orange : t.border),
              fontSize: 11, fontFamily: 'Sora, sans-serif', fontWeight: 600, cursor: 'pointer' }}>
            {name}<br /><span style={{ fontSize: 9, opacity: 0.7 }}>{pct >= 0 ? '+' : ''}{pct}%</span>
          </button>
        ))}
        <button onClick={reset} style={{ padding: '8px 12px', borderRadius: 6, background: t.inset,
          color: t.mid, ...lb(t.border), fontSize: 10, fontFamily: 'Sora, sans-serif', cursor: 'pointer' }}>
          Reset
        </button>
      </div>
      {holdings.map(h => {
        const d = h.ticker ? (deltas[h.ticker] ?? 0) : 0
        const newVal = valueUSD(h) * (1 + d / 100)
        const diff = newVal - valueUSD(h)
        const sc = secCol(h.sector)
        return (
          <div key={h.ticker ?? h.name} style={{ background: t.card, padding: '10px 14px', marginBottom: 6,
            borderRadius: 8, ...lb(t.border), borderLeftWidth: 3, borderLeftColor: sc }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontWeight: 600, color: t.title, ...MONO }}>{h.ticker ?? h.name}</span>
              <span style={{ ...MONO, fontSize: 11, color: diff >= 0 ? COL.green : COL.red }}>
                {diff >= 0 ? '+' : ''}${diff.toFixed(2)}
              </span>
            </div>
            <input type="range" min="-50" max="50" value={d}
              onChange={e => {
                if (!h.ticker) return
                setDeltas({ ...deltas, [h.ticker]: parseInt(e.target.value) })
                setPreset(null)
              }}
              style={{ width: '100%', accentColor: sc }} />
            <div style={{ fontSize: 10, color: t.mid, ...MONO, marginTop: 2,
              display: 'flex', justifyContent: 'space-between' }}>
              <span>{d >= 0 ? '+' : ''}{d}%</span><span>${newVal.toFixed(2)}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Growth tab ─────────────────────────────────────────────────────────────────
function GrowthTab({ growth, milestones }: { growth: GrowthScore[]; milestones: Milestone[] }) {
  const t = useTheme()
  const [expanded, setExpanded] = useState<string | null>(null)
  const tagCol: Record<string, string> = { K: COL.slate, S: COL.orange, E: COL.green }

  if (growth.length === 0 && milestones.length === 0) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: t.mid, fontSize: '0.9rem' }}>
        No growth data in this snapshot
      </div>
    )
  }

  return (
    <div style={{ padding: '8px 0' }}>
      {growth.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-around', background: t.card,
          padding: '16px 8px', borderRadius: 10, ...lb(t.border), marginBottom: 16 }}>
          {growth.map(g => (
            <div key={g.dimension}
              onClick={() => setExpanded(expanded === g.dimension ? null : g.dimension)}
              style={{ textAlign: 'center', cursor: 'pointer' }}>
              <ScoreRing score={g.score} color={tagCol[g.dimension] ?? COL.slate} />
              <div style={{ fontSize: 11, color: t.pale, marginTop: 6, fontWeight: 600 }}>{g.dimension === 'K' ? 'Knowledge' : g.dimension === 'S' ? 'Strategy' : 'Execution'}</div>
              <div style={{ fontSize: 9, color: t.mid, letterSpacing: 1 }}>{g.level.toUpperCase()}</div>
            </div>
          ))}
        </div>
      )}
      {expanded && (() => {
        const g = growth.find(x => x.dimension === expanded)
        if (!g) return null
        const col = tagCol[g.dimension] ?? COL.slate
        return (
          <div style={{ background: t.card, padding: 14, borderRadius: 10, ...lb(t.border),
            borderLeftWidth: 3, borderLeftColor: col, marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontWeight: 600, color: t.title }}>
                {g.dimension === 'K' ? 'Knowledge' : g.dimension === 'S' ? 'Strategy' : 'Execution'}
              </div>
              <div style={{ fontSize: 11, color: t.mid, ...MONO }}>{g.score}/10 · {g.level}</div>
            </div>
            <div style={{ fontSize: 11, color: t.pale, marginBottom: 8 }}>Items logged:</div>
            {g.items.map((it, i) => (
              <div key={i} style={{ fontSize: 11, color: t.mid, padding: '3px 0', lineHeight: 1.5 }}>• {it}</div>
            ))}
            {g.next && (
              <div style={{ fontSize: 10, color: col, marginTop: 10, fontStyle: 'italic' }}>Next: {g.next}</div>
            )}
          </div>
        )
      })()}
      {milestones.length > 0 && (
        <>
          <div style={{ fontSize: 11, color: COL.orange, letterSpacing: 1, textTransform: 'uppercase',
            marginBottom: 10, padding: '0 4px' }}>Milestones</div>
          <div style={{ position: 'relative', paddingLeft: 20 }}>
            <div style={{ position: 'absolute', left: 7, top: 0, bottom: 0, width: 1, background: t.border }} />
            {milestones.map((m, i) => (
              <div key={m.id ?? i} style={{ position: 'relative', marginBottom: 12 }}>
                <div style={{ position: 'absolute', left: -17, top: 5, width: 10, height: 10,
                  borderRadius: '50%', background: t.bg, border: `2px solid ${COL.orange}` }} />
                <div style={{ background: t.card, padding: '8px 12px', borderRadius: 8, ...lb(t.border) }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: 11, color: t.mid, ...MONO }}>{m.date}</div>
                    <div style={{ display: 'flex', gap: 3 }}>
                      {m.tags.map(tag => (
                        <span key={tag} style={{ fontSize: 9, padding: '2px 6px', borderRadius: 3,
                          background: `${tagCol[tag] ?? COL.slate}20`, color: tagCol[tag] ?? COL.slate, fontWeight: 600 }}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: t.pale, marginTop: 3 }}>{m.text}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Upload panel ───────────────────────────────────────────────────────────────
function UploadPanel({ onUploaded }: { onUploaded: () => void }) {
  const t = useTheme()
  const { showToast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [drag, setDrag] = useState(false)

  async function handleFile(file: File) {
    setUploading(true)
    try {
      const text = await file.text()
      const isJson = file.name.endsWith('.json')
      let body: object
      if (isJson) {
        try { body = JSON.parse(text) }
        catch { showToast('Invalid JSON file', 'error'); return }
      } else {
        body = { html: text, snapshot_date: new Date().toISOString() }
      }
      const res = await fetch('/api/portfolio', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) { showToast(data.error || 'Import failed', 'error'); return }
      showToast(`Imported ${data.holdings_count} holdings`, 'success')
      onUploaded()
    } catch { showToast('Upload failed', 'error') }
    finally { setUploading(false) }
  }

  return (
    <div style={{ padding: '4rem 1.5rem', textAlign: 'center' }}>
      <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📊</div>
      <div style={{ color: t.pale, fontSize: '1.1rem', fontWeight: 600, marginBottom: 8 }}>No portfolio data yet</div>
      <div style={{ color: t.mid, fontSize: '0.85rem', marginBottom: 24, lineHeight: 1.6 }}>
        Upload a Syfe HTML export or a JSON snapshot file.
      </div>
      <div onClick={() => fileRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
        style={{ border: `2px dashed ${drag ? COL.orange : t.border}`, borderRadius: 10,
          padding: '2.5rem', cursor: 'pointer', marginBottom: 12,
          background: drag ? 'rgba(232,82,10,0.05)' : 'transparent' }}>
        <div style={{ color: drag ? COL.orange : t.mid, fontSize: '0.9rem' }}>
          {uploading ? 'Importing…' : 'Drop .html or .json here, or click to browse'}
        </div>
      </div>
      <input ref={fileRef} type="file" accept=".html,.htm,.json" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
      <button style={{ padding: '0.35rem 0.85rem', borderRadius: 6, border: 'none', cursor: 'pointer',
        fontSize: '0.8rem', fontWeight: 600, background: COL.orange, color: '#fff', minHeight: 44 }}
        onClick={() => fileRef.current?.click()} disabled={uploading}>
        {uploading ? 'Importing…' : 'Choose File'}
      </button>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
const TABS = [
  { id: 'holdings', label: 'Holdings' },
  { id: 'orders',   label: 'Orders'   },
  { id: 'geo',      label: 'Geo'      },
  { id: 'sector',   label: 'Sector'   },
  { id: 'pnl',      label: 'P&L'      },
  { id: 'whatif',   label: 'What If'  },
  { id: 'growth',   label: 'Growth'   },
] as const
type TabId = typeof TABS[number]['id']

export function PortfolioClient() {
  const { showToast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [snapshot, setSnapshot] = useState<SnapResponse | null | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [tab, setTab] = useState<TabId>('holdings')
  const [themeKey, setThemeKey] = useState<ThemeKey>(() =>
    typeof document === 'undefined' ? 'dark'
      : document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
  )

  useEffect(() => {
    const obs = new MutationObserver(() => {
      setThemeKey(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark')
    })
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => obs.disconnect()
  }, [])

  const t = TOKENS[themeKey]

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/portfolio')
      const data = await res.json()
      setSnapshot(data)
    } catch { showToast('Failed to load portfolio', 'error') }
    finally { setLoading(false) }
  }, [showToast])

  useEffect(() => { load() }, [load])

  async function handleFile(file: File) {
    setUploading(true)
    try {
      const text = await file.text()
      const isJson = file.name.endsWith('.json')
      let body: object
      if (isJson) {
        try { body = JSON.parse(text) }
        catch { showToast('Invalid JSON file', 'error'); return }
      } else {
        body = { html: text, snapshot_date: new Date().toISOString() }
      }
      const res = await fetch('/api/portfolio', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) { showToast(data.error || 'Import failed', 'error'); return }
      showToast(`Imported ${data.holdings_count} holdings`, 'success')
      await load()
    } catch { showToast('Upload failed', 'error') }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = '' }
  }

  const themeToggle = (
    <button aria-label="toggle theme"
      onClick={() => setThemeKey(k => k === 'dark' ? 'light' : 'dark')}
      style={{ background: 'none', border: `1px solid ${t.border}`, borderRadius: 6,
        cursor: 'pointer', fontSize: '1rem', padding: '4px 8px', color: t.pale, minHeight: 44 }}>
      {themeKey === 'dark' ? '🌙' : '☀️'}
    </button>
  )

  const wrap: React.CSSProperties = { maxWidth: 430, margin: '0 auto', minHeight: '100vh', background: t.bg }

  if (loading) return (
    <ThemeCtx.Provider value={t}>
      <div style={{ minHeight: '100vh', background: t.bg, fontFamily: 'Sora, sans-serif' }}>
        <div style={wrap}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '14px 16px 0' }}>{themeToggle}</div>
          <div style={{ padding: '3rem 1.5rem', textAlign: 'center', color: t.mid }}>Loading…</div>
        </div>
      </div>
    </ThemeCtx.Provider>
  )

  if (!snapshot) return (
    <ThemeCtx.Provider value={t}>
      <div style={{ minHeight: '100vh', background: t.bg, fontFamily: 'Sora, sans-serif' }}>
        <div style={wrap}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '14px 16px 0' }}>{themeToggle}</div>
          <UploadPanel onUploaded={load} />
        </div>
      </div>
    </ThemeCtx.Provider>
  )

  const { holdings, orders = [], realised_trades = [], growth = [], milestones = [] } = snapshot
  const deltaValue = snapshot.prior_value != null ? snapshot.total_value - snapshot.prior_value : null

  return (
    <ThemeCtx.Provider value={t}>
      <div data-theme={themeKey}
        style={{ background: t.bg, minHeight: '100vh', color: t.pale, fontFamily: 'Sora, sans-serif' }}>
        <div style={wrap}>

          {/* ── Sticky header ── */}
          <div style={{ padding: '16px 16px 12px', borderBottom: `1px solid ${t.border}`,
            position: 'sticky', top: 0, background: t.bg, zIndex: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
              <div>
                <div style={{ fontSize: 10, color: COL.orange, letterSpacing: 2, fontWeight: 600 }}>
                  SYFE PORTFOLIO
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, ...MONO, color: t.title, marginTop: 2 }}>
                  ${snapshot.total_value.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
                <div style={{ fontSize: 11, color: t.mid, ...MONO }}>
                  {snapshot.snap_label ?? snapshot.snapshot_date.slice(0, 10)}
                  {snapshot.snap_time ? ` · ${snapshot.snap_time}` : ''}
                </div>
                {deltaValue !== null && (
                  <div style={{ display: 'flex', gap: 10, fontSize: 10, ...MONO, marginTop: 4 }}>
                    <span style={{ color: deltaValue >= 0 ? COL.green : COL.red }}>
                      {deltaValue >= 0 ? '+' : ''}${Math.abs(deltaValue).toFixed(2)}
                    </span>
                    <span style={{ color: t.mid }}>vs prior</span>
                    <span style={{ color: deltaValue >= 0 ? COL.green : COL.red }}>
                      {deltaValue >= 0 ? '+' : ''}{((deltaValue / snapshot.prior_value!) * 100).toFixed(2)}%
                    </span>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input ref={fileRef} type="file" accept=".html,.htm,.json" style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
                <button style={{ padding: '0.35rem 0.85rem', borderRadius: 6, cursor: 'pointer',
                  fontSize: '0.75rem', fontWeight: 600, background: t.inset, color: t.pale,
                  border: `1px solid ${t.border}`, minHeight: 44 }}
                  onClick={() => fileRef.current?.click()} disabled={uploading}>
                  {uploading ? 'Importing…' : 'Update Snapshot'}
                </button>
                {themeToggle}
              </div>
            </div>

            {/* Mini KPI chips */}
            {(snapshot.cash != null || snapshot.pending != null ||
              snapshot.total_pnl != null || snapshot.realised_pnl != null) && (
              <div style={{ display: 'flex', gap: 4, marginTop: 10, fontSize: 10, ...MONO }}>
                {snapshot.cash != null && (
                  <div style={{ flex: 1, textAlign: 'center', padding: '4px 0', background: t.inset, borderRadius: 4 }}>
                    <div style={{ color: t.mid, fontSize: 9 }}>CASH</div>
                    <div style={{ color: t.pale }}>${snapshot.cash.toFixed(0)}</div>
                  </div>
                )}
                {snapshot.pending != null && (
                  <div style={{ flex: 1, textAlign: 'center', padding: '4px 0', background: t.inset, borderRadius: 4 }}>
                    <div style={{ color: t.mid, fontSize: 9 }}>PEND</div>
                    <div style={{ color: COL.yellow }}>${snapshot.pending.toFixed(0)}</div>
                  </div>
                )}
                {snapshot.total_pnl != null && (
                  <div style={{ flex: 1, textAlign: 'center', padding: '4px 0', background: t.inset, borderRadius: 4 }}>
                    <div style={{ color: t.mid, fontSize: 9 }}>URZ</div>
                    <div style={{ color: COL.green }}>+${snapshot.total_pnl.toFixed(0)}</div>
                  </div>
                )}
                {snapshot.realised_pnl != null && (
                  <div style={{ flex: 1, textAlign: 'center', padding: '4px 0', background: t.inset, borderRadius: 4 }}>
                    <div style={{ color: t.mid, fontSize: 9 }}>RLZ</div>
                    <div style={{ color: COL.green }}>+${snapshot.realised_pnl.toFixed(0)}</div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Tab bar ── */}
          <div style={{ display: 'flex', borderBottom: `1px solid ${t.border}`, overflowX: 'auto',
            background: t.bg, position: 'sticky', top: 115, zIndex: 9, scrollbarWidth: 'none' }}>
            {TABS.map(tb => (
              <button key={tb.id} onClick={() => setTab(tb.id)} style={{
                flex: '1 0 auto', padding: '10px 12px', fontSize: 11, fontWeight: 600,
                background: 'transparent',
                color: tab === tb.id ? COL.orange : t.mid,
                borderTop: 'none', borderRight: 'none', borderLeft: 'none',
                borderBottom: tab === tb.id ? `2px solid ${COL.orange}` : '2px solid transparent',
                cursor: 'pointer', fontFamily: 'Sora, sans-serif', whiteSpace: 'nowrap',
              }}>
                {tb.label}
              </button>
            ))}
          </div>

          {/* ── Tab content ── */}
          <div style={{ padding: '8px 16px 32px' }}>
            {tab === 'holdings' && <HoldingsTab holdings={holdings} orders={orders} />}
            {tab === 'orders'   && <OrdersTab   orders={orders} />}
            {tab === 'geo'      && <GeoTab       holdings={holdings} />}
            {tab === 'sector'   && <SectorTab    holdings={holdings} />}
            {tab === 'pnl'      && <PnlTab
              holdings={holdings}
              totalPnl={snapshot.total_pnl ?? undefined}
              realisedPnl={snapshot.realised_pnl ?? undefined}
              realisedTrades={realised_trades}
              priorUnrealised={snapshot.prior_unrealised ?? undefined}
              priorRealised={snapshot.prior_realised ?? undefined}
            />}
            {tab === 'whatif'   && <WhatIfTab    holdings={holdings} />}
            {tab === 'growth'   && <GrowthTab    growth={growth} milestones={milestones} />}
          </div>

          <div style={{ padding: '16px 16px 24px', borderTop: `1px solid ${t.border}`,
            fontSize: 9, color: t.mid, textAlign: 'center', ...MONO }}>
            INDICATIVE · NON-USD APPROXIMATED (SGD 0.74 · GBP 1.29) · NOT FINANCIAL ADVICE
          </div>
        </div>
      </div>
    </ThemeCtx.Provider>
  )
}
