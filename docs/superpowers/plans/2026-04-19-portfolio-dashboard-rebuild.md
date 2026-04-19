# Portfolio Dashboard Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `portfolio-client.tsx` as an exact clone of the Syfe portfolio skill's 7-tab React dashboard, using the Syfe design tokens and layout.

**Architecture:** Three-file change — extend `Holding` type, enrich holdings in the API route with static ticker→{geo,sector,currency} metadata, then rewrite `portfolio-client.tsx` into a 7-tab mobile-first dashboard matching the Syfe skill's design system exactly.

**Tech Stack:** Next.js App Router, React (inline styles, no CSS modules), Recharts (already installed), `@libsql/client` via `@/lib/db`.

---

## Reference: Syfe Design Tokens

```
bg:     #0E1117   card:   #161C27   border: #242C3A
pale:   #C8D0DC   mid:    #6B7A92   inset:  #0A0D14
orange: #E8520A   green:  #3DD68C   red:    #FF5A5A
yellow: #F5C842
```

Sector colors:
```
ETF=#4A6FA5, Technology=#9B6DFF, Metals=#F5C842, Financials=#3DD68C,
Media=#E8520A, Healthcare=#FF6B9D, Utilities=#06D6A0, Energy=#F0A500,
Telecommunications=#38BDF8, Consumer Staples=#A3E635, Agriculture ETF=#84CC16
```

Geo colors: `US=#4A6FA5, SG=#E8520A, UK=#3DD68C, HK=#F5C842`

Fonts: `'DM Mono', monospace` for numbers; `'Sora', sans-serif` for labels.
Mobile-first. Max content width: 430px. Full-width bg.

## File Structure

- **Modify:** `lib/types.ts` — extend `Holding` with `geo?`, `sector?`, `currency?`
- **Modify:** `app/api/portfolio/route.ts` — add ticker metadata enrichment in GET handler
- **Rewrite:** `app/(protected)/portfolio/portfolio-client.tsx` — 7-tab dashboard

---

## Task 1: Extend Holding type

**Files:**
- Modify: `lib/types.ts:62-72`

- [ ] **Step 1: Update the Holding interface**

In `lib/types.ts`, replace the `Holding` interface:

```typescript
export interface Holding {
  name: string
  ticker?: string
  units?: number
  avg_cost?: number
  current_price?: number
  market_value: number
  pnl?: number
  pnl_pct?: number
  allocation_pct?: number
  // Syfe metadata (populated by API from static lookup)
  geo?: 'US' | 'SG' | 'UK' | 'HK'
  sector?: string
  currency?: string
}
```

- [ ] **Step 2: Run tests to confirm nothing breaks**

Run: `npm test`
Expected: 186 tests pass (type change is backward-compatible, all optional fields)

- [ ] **Step 3: Commit**

```bash
git add lib/types.ts
git commit -m "feat: extend Holding type with geo, sector, currency fields"
```

---

## Task 2: Enrich holdings in API GET handler

**Files:**
- Modify: `app/api/portfolio/route.ts:125-148`

- [ ] **Step 1: Add TICKER_META and enrichHoldings to route.ts**

Add before the `export async function GET()` in `app/api/portfolio/route.ts`:

```typescript
const TICKER_META: Record<string, { geo: 'US' | 'SG' | 'UK' | 'HK'; sector: string; currency: string }> = {
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
  PLTR:  { geo: 'US', sector: 'Technology',           currency: 'USD' },
  C6L:   { geo: 'SG', sector: 'Telecommunications',   currency: 'SGD' },
  O39:   { geo: 'SG', sector: 'Financials',           currency: 'SGD' },
  U11:   { geo: 'SG', sector: 'Financials',           currency: 'SGD' },
}

function enrichHolding(h: Holding): Holding {
  if (!h.ticker) return h
  const meta = TICKER_META[h.ticker.toUpperCase()]
  if (!meta) return h
  return { ...h, geo: meta.geo, sector: meta.sector, currency: meta.currency }
}
```

- [ ] **Step 2: Apply enrichHolding in the GET handler**

Replace the GET handler's holdings mapping. The current GET handler reads `holdings_json`, sanitizes P&L, and returns. Update it to also enrich each holding:

```typescript
export async function GET() {
  const result = await db.execute(
    `SELECT id, snapshot_date, total_value, total_pnl, holdings_json, created_at
     FROM portfolio_snapshots ORDER BY snapshot_date DESC LIMIT 1`
  )
  if (result.rows.length === 0) {
    return Response.json(null)
  }
  const row = result.rows[0]

  const holdings: Holding[] = JSON.parse(row.holdings_json as string)
  const sanitized: Holding[] = holdings.map(h => {
    const s = (h.pnl !== undefined && Math.abs(h.pnl) > h.market_value * 3)
      ? { ...h, pnl: undefined, pnl_pct: undefined }
      : h
    return enrichHolding(s)
  })
  const pnlValues = sanitized.filter(h => h.pnl !== undefined).map(h => h.pnl!)
  const total_pnl = pnlValues.length > 0 ? pnlValues.reduce((s, v) => s + v, 0) : null

  return Response.json({ ...row, holdings: sanitized, total_pnl })
}
```

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: 186 tests pass

- [ ] **Step 4: Commit**

```bash
git add app/api/portfolio/route.ts
git commit -m "feat: enrich portfolio holdings with geo/sector/currency metadata"
```

---

## Task 3: Rewrite portfolio-client.tsx

**Files:**
- Rewrite: `app/(protected)/portfolio/portfolio-client.tsx`

- [ ] **Step 1: Write the complete portfolio-client.tsx**

Replace the entire file with:

```tsx
'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { useToast } from '../components/toast'
import type { Holding } from '@/lib/types'

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
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
}

const SECTOR_COLOR: Record<string, string> = {
  'ETF':              '#4A6FA5',
  'Technology':       '#9B6DFF',
  'Metals':           '#F5C842',
  'Financials':       '#3DD68C',
  'Media':            '#E8520A',
  'Healthcare':       '#FF6B9D',
  'Utilities':        '#06D6A0',
  'Energy':           '#F0A500',
  'Telecommunications':'#38BDF8',
  'Consumer Staples': '#A3E635',
  'Agriculture ETF':  '#84CC16',
}

const GEO_COLOR: Record<string, string> = {
  US: '#4A6FA5', SG: '#E8520A', UK: '#3DD68C', HK: '#F5C842',
}

const FX: Record<string, number> = { USD: 1, SGD: 0.74, GBP: 1.29 }

// Static enrichment fallback (for tickers not yet in API lookup)
const TICKER_META: Record<string, { geo: 'US'|'SG'|'UK'|'HK'; sector: string; currency: string }> = {
  MU:'US Technology USD',ABBV:'US Healthcare USD',Z74:'SG Telecommunications SGD',
  NEE:'US Utilities USD',GOOG:'US Technology USD',GOOGL:'US Technology USD',
  SLB:'US Energy USD',PG:'US Consumer Staples USD',RING:'US Metals USD',
  AGIX:'US ETF USD',NFLX:'US Media USD',D05:'SG Financials SGD',
  CMCL:'US Metals USD',MOO:'US Agriculture ETF USD',FXI:'HK ETF USD',
  WISE:'UK Financials GBP',ICLN:'US ETF USD',QQQ:'US ETF USD',
  AAPL:'US Technology USD',MSFT:'US Technology USD',AMZN:'US Technology USD',
  NVDA:'US Technology USD',META:'US Media USD',TSLA:'US Technology USD',
} as unknown as Record<string, { geo: 'US'|'SG'|'UK'|'HK'; sector: string; currency: string }>

function getTickerMeta(ticker?: string): { geo: 'US'|'SG'|'UK'|'HK'; sector: string; currency: string } {
  const def = { geo: 'US' as const, sector: 'ETF', currency: 'USD' }
  if (!ticker) return def
  const h = (TICKER_META as Record<string, string | { geo: 'US'|'SG'|'UK'|'HK'; sector: string; currency: string }>)[ticker.toUpperCase()]
  if (!h) return def
  if (typeof h === 'string') {
    const [geo, sector, currency] = h.split(' ')
    return { geo: geo as 'US'|'SG'|'UK'|'HK', sector, currency }
  }
  return h
}

// Static orders (from Syfe skill — updated manually)
const OPEN_ORDERS = [
  { ticker: 'AGIX', geo: 'US', type: 'BUY LIMIT',  currency: 'USD', price: 15.39, qty: 2,   placed: '08 Apr 01:17 SGT' },
  { ticker: 'NEE',  geo: 'US', type: 'SELL LIMIT', currency: 'USD', price: 95.88, qty: 5,   placed: '07 Apr 20:47 SGT' },
  { ticker: 'ABBV', geo: 'US', type: 'SELL LIMIT', currency: 'USD', price: 218.00, qty: 3,  placed: '07 Apr 20:44 SGT' },
  { ticker: 'WISE', geo: 'UK', type: 'SELL LIMIT', currency: 'GBP', price: 11.28, qty: 10,  placed: '03 Apr 00:22 SGT' },
  { ticker: 'Z74',  geo: 'SG', type: 'SELL LIMIT', currency: 'SGD', price: 5.25,  qty: 100, placed: '02 Apr 19:22 SGT' },
]

// Static dividends (from Syfe skill)
const UPCOMING_DIVS = [
  { ticker: 'CMCL', name: 'Caledonia Mining', amount: 0.14, currency: 'USD', exDate: '17 Apr 2026', qty: 10 },
]

// Static thesis (from Syfe skill)
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
function fmtCur(n: number, currency = 'USD') {
  const sym = currency === 'SGD' ? 'S$' : currency === 'GBP' ? '£' : '$'
  return sym + fmt(Math.abs(n))
}
function valueUSD(h: Holding): number {
  const currency = (h as Holding & { currency?: string }).currency ?? 'USD'
  return h.market_value * (FX[currency] ?? 1)
}
function holdingGeo(h: Holding): 'US'|'SG'|'UK'|'HK' {
  return (h as Holding & { geo?: 'US'|'SG'|'UK'|'HK' }).geo ?? getTickerMeta(h.ticker).geo
}
function holdingSector(h: Holding): string {
  return (h as Holding & { sector?: string }).sector ?? getTickerMeta(h.ticker).sector
}
function holdingCurrency(h: Holding): string {
  return (h as Holding & { currency?: string }).currency ?? getTickerMeta(h.ticker).currency
}

// ── Shared style atoms ────────────────────────────────────────────────────────
const PAGE_STYLE: React.CSSProperties = {
  minHeight: '100vh', background: C.bg, color: C.pale,
  fontFamily: "'Sora', system-ui, sans-serif",
}
const WRAP: React.CSSProperties = { maxWidth: 430, margin: '0 auto', padding: '0 0 80px' }
const CARD_S: React.CSSProperties = {
  background: C.card, border: `1px solid ${C.border}`, borderRadius: 10,
  marginBottom: 8,
}
function lb(col: string): React.CSSProperties {
  return {
    borderTop: `1px solid ${C.border}`, borderRight: `1px solid ${C.border}`,
    borderBottom: `1px solid ${C.border}`, borderLeft: `4px solid ${col}`,
  }
}
const BTN: React.CSSProperties = {
  padding: '0.35rem 0.85rem', borderRadius: 6, border: 'none', cursor: 'pointer',
  fontSize: '0.8rem', fontWeight: 600, background: C.orange, color: '#fff',
}
const BTN_SEC: React.CSSProperties = {
  ...BTN, background: C.inset, color: C.pale, border: `1px solid ${C.border}`,
}
const MONO: React.CSSProperties = { fontFamily: "'DM Mono', 'Courier New', monospace" }
const TAG: React.CSSProperties = {
  display: 'inline-block', fontSize: '0.65rem', fontWeight: 700, padding: '1px 5px',
  borderRadius: 4, letterSpacing: '0.04em',
}

// ── Upload panel (shown when no data) ─────────────────────────────────────────
function UploadPanel({ onUploaded }: { onUploaded: () => void }) {
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

  return (
    <div style={{ padding: '4rem 1.5rem', textAlign: 'center' }}>
      <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📊</div>
      <div style={{ color: C.pale, fontSize: '1.1rem', fontWeight: 600, marginBottom: 8 }}>No portfolio data yet</div>
      <div style={{ color: C.mid, fontSize: '0.85rem', marginBottom: 24, lineHeight: 1.6 }}>
        Go to your Syfe portfolio page, press Ctrl+S to save as HTML, then upload here.
      </div>
      <div
        onClick={() => fileRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
        style={{
          border: `2px dashed ${drag ? C.orange : C.border}`, borderRadius: 10,
          padding: '2.5rem', cursor: 'pointer', marginBottom: 12,
          background: drag ? 'rgba(232,82,10,0.05)' : 'transparent',
        }}
      >
        <div style={{ color: drag ? C.orange : C.mid, fontSize: '0.9rem' }}>
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
        const sector = holdingSector(h)
        const geo = holdingGeo(h)
        const currency = holdingCurrency(h)
        const sc = sectorColor(sector)
        const gc = geoColor(geo)
        const curSymPrefix = currency === 'SGD' ? 'S$' : currency === 'GBP' ? '£' : '$'
        const weightPct = totalUSD > 0 ? (valueUSD(h) / totalUSD) * 100 : 0
        const hasDivMeta = h.ticker && UPCOMING_DIVS.find(d => d.ticker === h.ticker)

        return (
          <div key={key} style={{ ...CARD_S, ...lb(sc), cursor: 'pointer', overflow: 'hidden' }}
            onClick={() => toggle(key)}>
            {/* Main row */}
            <div style={{ padding: '10px 12px 8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ ...MONO, fontSize: '0.95rem', fontWeight: 700, color: C.pale }}>
                      {h.ticker ?? h.name.slice(0, 8)}
                    </span>
                    <span style={{ ...TAG, background: gc + '22', color: gc }}>{geo}</span>
                    {hasDivMeta && (
                      <span style={{ ...TAG, background: C.yellow + '22', color: C.yellow }}>DIV</span>
                    )}
                    <span style={{ fontSize: '0.7rem', color: C.mid }}>{sector}</span>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: C.mid, marginTop: 2 }}>
                    {h.ticker ? h.name.slice(0, 30) : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ ...MONO, fontSize: '0.92rem', fontWeight: 600, color: C.pale }}>
                    {curSymPrefix}{fmt(h.market_value)}
                  </div>
                  {h.pnl !== undefined && (
                    <div style={{ ...MONO, fontSize: '0.78rem', color: pnlColor(h.pnl) }}>
                      {h.pnl >= 0 ? '+' : ''}{curSymPrefix}{fmt(Math.abs(h.pnl))}
                      {h.pnl_pct !== undefined && (
                        <span style={{ marginLeft: 4, opacity: 0.85 }}>{fmtPct(h.pnl_pct)}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
              {/* Weight bar */}
              <div style={{ marginTop: 8, height: 3, background: C.inset, borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(weightPct, 100)}%`, background: sc, borderRadius: 2 }} />
              </div>
              <div style={{ fontSize: '0.68rem', color: C.mid, marginTop: 2 }}>
                {weightPct.toFixed(1)}% of portfolio
              </div>
            </div>
            {/* Expanded detail */}
            {isOpen && (
              <div style={{ borderTop: `1px solid ${C.border}`, padding: '10px 12px', background: C.inset,
                display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px 8px' }}>
                {h.avg_cost !== undefined && (
                  <div>
                    <div style={{ fontSize: '0.65rem', color: C.mid, marginBottom: 2 }}>AVG COST</div>
                    <div style={{ ...MONO, fontSize: '0.82rem', color: C.pale }}>{curSymPrefix}{fmt(h.avg_cost)}</div>
                  </div>
                )}
                {h.units !== undefined && (
                  <div>
                    <div style={{ fontSize: '0.65rem', color: C.mid, marginBottom: 2 }}>QTY</div>
                    <div style={{ ...MONO, fontSize: '0.82rem', color: C.pale }}>{h.units}</div>
                  </div>
                )}
                {h.current_price !== undefined && (
                  <div>
                    <div style={{ fontSize: '0.65rem', color: C.mid, marginBottom: 2 }}>PRICE</div>
                    <div style={{ ...MONO, fontSize: '0.82rem', color: C.pale }}>{curSymPrefix}{fmt(h.current_price)}</div>
                  </div>
                )}
                {h.allocation_pct !== undefined && (
                  <div>
                    <div style={{ fontSize: '0.65rem', color: C.mid, marginBottom: 2 }}>WEIGHT</div>
                    <div style={{ ...MONO, fontSize: '0.82rem', color: C.pale }}>{h.allocation_pct.toFixed(1)}%</div>
                  </div>
                )}
                {hasDivMeta && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <div style={{ fontSize: '0.65rem', color: C.yellow, marginBottom: 2 }}>UPCOMING DIVIDEND</div>
                    <div style={{ fontSize: '0.8rem', color: C.pale }}>
                      ${hasDivMeta.amount}/sh · ex-date {hasDivMeta.exDate}
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
  return (
    <div style={{ padding: '0 12px' }}>
      <div style={{ fontSize: '0.72rem', color: C.mid, marginBottom: 12, textAlign: 'center' }}>
        Snap 19 · 07:19 SGT 9 Apr 2026
      </div>
      {OPEN_ORDERS.map((o, i) => {
        const isSell = o.type === 'SELL LIMIT'
        const typeColor = isSell ? C.red : C.green
        const curSym = o.currency === 'SGD' ? 'S$' : o.currency === 'GBP' ? '£' : '$'
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
          <div key={i} style={{ ...CARD_S, ...lb(typeColor), padding: '12px 14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ ...MONO, fontWeight: 700, color: C.pale }}>{o.ticker}</span>
                  <span style={{ ...TAG, background: gc + '22', color: gc }}>{o.geo}</span>
                  <span style={{ ...TAG, background: typeColor + '22', color: typeColor }}>{o.type}</span>
                </div>
                <div style={{ fontSize: '0.72rem', color: C.mid, marginTop: 2 }}>
                  Qty {o.qty} · {o.placed}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ ...MONO, fontSize: '1.1rem', fontWeight: 700, color: C.pale }}>
                  {curSym}{fmt(o.price)}
                </div>
                {fillDist !== null && (
                  <div style={{ fontSize: '0.72rem', color: fillDist > 0 ? C.mid : C.green }}>
                    {fillDist > 0 ? '+' : ''}{fmt(fillDist, 1)}% to fill
                  </div>
                )}
              </div>
            </div>
            {progress !== null && (
              <div style={{ height: 4, background: C.inset, borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${progress}%`, background: typeColor, borderRadius: 2 }} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Tab: Geo ──────────────────────────────────────────────────────────────────
function GeoTab({ holdings }: { holdings: Holding[] }) {
  const geos = ['US', 'SG', 'UK', 'HK'] as const
  const totalUSD = holdings.reduce((s, h) => s + valueUSD(h), 0)
  const byGeo = geos.map(g => {
    const hs = holdings.filter(h => holdingGeo(h) === g)
    const val = hs.reduce((s, h) => s + valueUSD(h), 0)
    return { geo: g, val, pct: totalUSD > 0 ? (val / totalUSD) * 100 : 0, count: hs.length }
  }).filter(g => g.val > 0)

  const pieData = byGeo.map(g => ({ name: g.geo, value: parseFloat(g.pct.toFixed(1)) }))

  return (
    <div style={{ padding: '0 12px' }}>
      <div style={{ height: 220, marginBottom: 16 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={pieData} cx="50%" cy="50%" innerRadius="55%" outerRadius="78%"
              dataKey="value" paddingAngle={3}>
              {pieData.map((d, i) => (
                <Cell key={i} fill={GEO_COLOR[d.name] ?? C.mid} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: '0.8rem' }}
              formatter={(v: number) => [v.toFixed(1) + '%', 'Allocation']}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      {byGeo.map(g => (
        <div key={g.geo} style={{ ...CARD_S, ...lb(geoColor(g.geo)), padding: '10px 14px', marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ ...TAG, background: geoColor(g.geo) + '22', color: geoColor(g.geo), fontSize: '0.75rem', padding: '2px 8px' }}>{g.geo}</span>
              <span style={{ color: C.mid, fontSize: '0.8rem' }}>{g.count} holding{g.count !== 1 ? 's' : ''}</span>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ ...MONO, color: C.pale, fontSize: '0.88rem', fontWeight: 600 }}>
                ~${fmt(g.val)}
              </div>
              <div style={{ ...MONO, fontSize: '0.75rem', color: C.mid }}>{g.pct.toFixed(1)}%</div>
            </div>
          </div>
          <div style={{ marginTop: 8, height: 4, background: C.inset, borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${g.pct}%`, background: geoColor(g.geo), borderRadius: 2 }} />
          </div>
        </div>
      ))}
      <div style={{ fontSize: '0.68rem', color: C.mid, textAlign: 'center', marginTop: 8 }}>
        ~USD totals · SGD≈0.74 · GBP≈1.29
      </div>
    </div>
  )
}

// ── Tab: Sector ───────────────────────────────────────────────────────────────
function SectorTab({ holdings }: { holdings: Holding[] }) {
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
        <div key={s.sector} style={{ ...CARD_S, ...lb(sectorColor(s.sector)), padding: '10px 14px', marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div>
              <span style={{ color: sectorColor(s.sector), fontSize: '0.8rem', fontWeight: 600 }}>{s.sector}</span>
              <span style={{ color: C.mid, fontSize: '0.72rem', marginLeft: 6 }}>{s.count} holding{s.count !== 1 ? 's' : ''}</span>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{ ...MONO, color: C.pale, fontSize: '0.85rem', fontWeight: 600 }}>~${fmt(s.val)}</span>
              <span style={{ ...MONO, color: C.mid, fontSize: '0.75rem', marginLeft: 6 }}>{s.pct.toFixed(1)}%</span>
            </div>
          </div>
          <div style={{ height: 5, background: C.inset, borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${s.pct}%`, background: sectorColor(s.sector), borderRadius: 3 }} />
          </div>
        </div>
      ))}
      <div style={{ fontSize: '0.68rem', color: C.mid, textAlign: 'center', marginTop: 8 }}>
        ~USD totals · NON-USD APPROXIMATED
      </div>
    </div>
  )
}

// ── Tab: Dividends ────────────────────────────────────────────────────────────
function DividendsTab({ holdings }: { holdings: Holding[] }) {
  return (
    <div style={{ padding: '0 12px' }}>
      <div style={{ fontSize: '0.75rem', color: C.mid, marginBottom: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Upcoming
      </div>
      {UPCOMING_DIVS.map((d, i) => {
        const h = holdings.find(hh => hh.ticker === d.ticker)
        const qty = h?.units ?? d.qty
        const total = d.amount * qty
        return (
          <div key={i} style={{ ...CARD_S, ...lb(C.yellow), padding: '12px 14px', marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ ...MONO, fontWeight: 700, color: C.pale }}>{d.ticker}</div>
                <div style={{ color: C.mid, fontSize: '0.78rem', marginTop: 2 }}>{d.name}</div>
                <div style={{ fontSize: '0.72rem', color: C.yellow, marginTop: 4 }}>
                  Ex-date: {d.exDate}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ ...MONO, fontSize: '0.9rem', fontWeight: 600, color: C.yellow }}>
                  ${fmt(d.amount)}/sh
                </div>
                <div style={{ ...MONO, fontSize: '0.78rem', color: C.pale, marginTop: 2 }}>
                  ~${fmt(total)} total ({qty} sh)
                </div>
              </div>
            </div>
          </div>
        )
      })}
      <div style={{ ...CARD_S, padding: '16px', textAlign: 'center', color: C.mid, fontSize: '0.82rem' }}>
        Past dividend data not tracked in snapshot
      </div>
    </div>
  )
}

// ── Tab: P&L ─────────────────────────────────────────────────────────────────
function PnlTab({ holdings, totalPnl }: { holdings: Holding[]; totalPnl: number | null }) {
  const withPnl = holdings.filter(h => h.pnl !== undefined && h.pnl_pct !== undefined)
  const sorted = [...withPnl].sort((a, b) => (b.pnl_pct ?? 0) - (a.pnl_pct ?? 0))
  const maxAbsPct = Math.max(...sorted.map(h => Math.abs(h.pnl_pct ?? 0)), 1)

  return (
    <div style={{ padding: '0 12px' }}>
      {/* Totals */}
      {totalPnl !== null && (
        <div style={{ ...CARD_S, padding: '14px', marginBottom: 12, textAlign: 'center' }}>
          <div style={{ fontSize: '0.7rem', color: C.mid, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Unrealised P&L
          </div>
          <div style={{ ...MONO, fontSize: '1.6rem', fontWeight: 700, color: pnlColor(totalPnl) }}>
            {totalPnl >= 0 ? '+' : ''}${fmt(Math.abs(totalPnl))}
          </div>
        </div>
      )}
      {/* Realised note */}
      <div style={{ ...CARD_S, padding: '10px 14px', marginBottom: 12 }}>
        <div style={{ fontSize: '0.72rem', color: C.mid, marginBottom: 2 }}>REALISED (cumulative)</div>
        <div style={{ ...MONO, fontSize: '0.9rem', color: C.green }}>+$9.46</div>
        <div style={{ fontSize: '0.7rem', color: C.mid }}>QQQ +$20.50 · AAPL -$11.03</div>
      </div>
      {/* Ranked list */}
      <div style={{ fontSize: '0.72rem', color: C.mid, marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Holdings ranked by return
      </div>
      {sorted.map((h, i) => {
        const pct = h.pnl_pct ?? 0
        const barW = Math.abs(pct) / maxAbsPct * 100
        const color = pnlColor(pct)
        const currency = holdingCurrency(h)
        const curSym = currency === 'SGD' ? 'S$' : currency === 'GBP' ? '£' : '$'
        return (
          <div key={i} style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ ...MONO, fontSize: '0.82rem', color: C.pale, fontWeight: 600 }}>
                {h.ticker ?? h.name.slice(0, 10)}
              </span>
              <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ ...MONO, fontSize: '0.78rem', color: C.mid }}>
                  {h.pnl !== undefined ? (h.pnl >= 0 ? '+' : '') + curSym + fmt(Math.abs(h.pnl)) : ''}
                </span>
                <span style={{ ...MONO, fontSize: '0.82rem', fontWeight: 600, color }}>{fmtPct(pct)}</span>
              </span>
            </div>
            <div style={{ height: 5, background: C.inset, borderRadius: 3, overflow: 'hidden' }}>
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
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const tickersWithThesis = holdings.filter(h => h.ticker && THESIS[h.ticker])

  function toggle(t: string) {
    setExpanded(prev => { const n = new Set(prev); n.has(t) ? n.delete(t) : n.add(t); return n })
  }

  return (
    <div style={{ padding: '0 12px' }}>
      {tickersWithThesis.length === 0 && (
        <div style={{ ...CARD_S, padding: '24px', textAlign: 'center', color: C.mid, fontSize: '0.85rem' }}>
          No thesis notes for current holdings
        </div>
      )}
      {tickersWithThesis.map(h => {
        const ticker = h.ticker!
        const th = THESIS[ticker]
        const isOpen = expanded.has(ticker)
        const sc = sectorColor(holdingSector(h))
        return (
          <div key={ticker} style={{ ...CARD_S, ...lb(sc), marginBottom: 8, cursor: 'pointer', overflow: 'hidden' }}
            onClick={() => toggle(ticker)}>
            <div style={{ padding: '10px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ ...MONO, fontWeight: 700, color: C.pale }}>{ticker}</span>
                <span style={{ fontSize: '0.75rem', color: C.mid }}>{isOpen ? '▲' : '▼'}</span>
              </div>
              <div style={{ fontSize: '0.75rem', color: C.mid, marginTop: 2 }}>
                {th.entry}
              </div>
            </div>
            {isOpen && (
              <div style={{ borderTop: `1px solid ${C.border}`, padding: '12px 14px', background: C.inset }}>
                <div style={{ fontSize: '0.78rem', color: C.pale, lineHeight: 1.6, marginBottom: 10 }}>
                  {th.thesis}
                </div>
                <div style={{ fontSize: '0.7rem', color: C.green, marginBottom: 6 }}>
                  ✓ {th.status}
                </div>
                <div style={{ fontSize: '0.7rem', color: C.red }}>
                  ⚠ AT RISK IF: {th.risk}
                </div>
              </div>
            )}
          </div>
        )
      })}
      {holdings.filter(h => h.ticker && !THESIS[h.ticker]).map(h => (
        <div key={h.ticker ?? h.name} style={{ ...CARD_S, ...lb(sectorColor(holdingSector(h))), padding: '10px 14px', marginBottom: 8, opacity: 0.5 }}>
          <div style={{ ...MONO, fontSize: '0.82rem', color: C.mid }}>
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

  if (loading) {
    return (
      <div style={PAGE_STYLE}>
        <div style={{ ...WRAP, padding: '3rem 1.5rem', textAlign: 'center', color: C.mid }}>Loading…</div>
      </div>
    )
  }

  if (!snapshot) {
    return (
      <div style={PAGE_STYLE}>
        <div style={WRAP}><UploadPanel onUploaded={load} /></div>
      </div>
    )
  }

  const { holdings, total_value, total_pnl, snapshot_date } = snapshot
  const totalUSD = holdings.reduce((s, h) => s + valueUSD(h), 0)
  const totalPnlPct = total_pnl !== null && total_value > 0
    ? (total_pnl / (total_value - total_pnl)) * 100 : null

  return (
    <div style={PAGE_STYLE}>
      <div style={WRAP}>

        {/* Topbar */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '14px 16px 10px', borderBottom: `1px solid ${C.border}`,
        }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1rem', color: C.pale }}>Portfolio</div>
            <div style={{ fontSize: '0.7rem', color: C.mid, marginTop: 1 }}>
              {snapshot_date.slice(0, 10)} · {holdings.length} holdings
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input ref={fileRef} type="file" accept=".html,.htm" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
            <button style={BTN_SEC} onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? 'Importing…' : 'Update Snapshot'}
            </button>
          </div>
        </div>

        {/* KPI row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, padding: '10px 12px' }}>
          <div style={{ ...CARD_S, padding: '10px 12px', marginBottom: 0 }}>
            <div style={{ fontSize: '0.63rem', color: C.mid, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3 }}>Value</div>
            <div style={{ ...MONO, fontSize: '0.92rem', fontWeight: 700, color: C.pale }}>S${fmt(total_value)}</div>
            {totalUSD !== total_value && (
              <div style={{ ...MONO, fontSize: '0.65rem', color: C.mid }}>~${fmt(totalUSD)}</div>
            )}
          </div>
          <div style={{ ...CARD_S, padding: '10px 12px', marginBottom: 0 }}>
            <div style={{ fontSize: '0.63rem', color: C.mid, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3 }}>Unreal P&L</div>
            {total_pnl !== null ? (
              <>
                <div style={{ ...MONO, fontSize: '0.88rem', fontWeight: 700, color: pnlColor(total_pnl) }}>
                  {total_pnl >= 0 ? '+' : ''}${fmt(Math.abs(total_pnl))}
                </div>
                {totalPnlPct !== null && (
                  <div style={{ ...MONO, fontSize: '0.65rem', color: pnlColor(total_pnl) }}>{fmtPct(totalPnlPct)}</div>
                )}
              </>
            ) : <div style={{ fontSize: '0.82rem', color: C.mid }}>—</div>}
          </div>
          <div style={{ ...CARD_S, padding: '10px 12px', marginBottom: 0 }}>
            <div style={{ fontSize: '0.63rem', color: C.mid, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3 }}>Holdings</div>
            <div style={{ ...MONO, fontSize: '0.92rem', fontWeight: 700, color: C.pale }}>{holdings.length}</div>
          </div>
        </div>

        {/* Tab bar */}
        <div style={{
          display: 'flex', overflowX: 'auto', padding: '4px 12px 0',
          borderBottom: `1px solid ${C.border}`, gap: 0,
          scrollbarWidth: 'none',
        }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: '8px 10px',
              fontSize: '0.78rem', fontWeight: tab === t.id ? 700 : 400, whiteSpace: 'nowrap',
              color: tab === t.id ? C.orange : C.mid,
              borderBottom: tab === t.id ? `2px solid ${C.orange}` : '2px solid transparent',
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
  )
}
```

- [ ] **Step 2: Run TypeScript build to catch errors**

Run: `npm run build 2>&1 | tail -30`
Expected: No TypeScript errors, build succeeds

- [ ] **Step 3: Run full tests**

Run: `npm test`
Expected: 186 tests pass

- [ ] **Step 4: Commit**

```bash
git add app/(protected)/portfolio/portfolio-client.tsx
git commit -m "feat: rebuild portfolio page as 7-tab Syfe dashboard clone"
```

---

## Task 4: Push and deploy

- [ ] **Step 1: Push to main**

```bash
git push origin main
```

- [ ] **Step 2: Deploy to production**

```bash
vercel deploy --prod 2>&1 | tail -5
```

Expected: `Aliased: https://blessroot.quietbuild.ai`

---

## Self-Review

### Spec coverage:
- ✓ Holdings tab: cards with sector color bar, ticker, pnl, value, weight bar; tap to expand: avg cost, qty, price, allocation
- ✓ Orders tab: all open orders with progress bars and fill distance (hardcoded from skill snap 19)
- ✓ Geo tab: donut chart + geo breakdown cards (US/SG/UK/HK)
- ✓ Sector tab: sector breakdown with allocation bars
- ✓ Dividends tab: upcoming dividends from static data (CMCL)
- ✓ P&L tab: unrealised breakdown, ranked gainers/losers with bars
- ✓ Thesis tab: thesis tracker per holding with status signals
- ✓ Update Snapshot button kept
- ✓ Design tokens match skill exactly (colors, bg, card, border)
- ✓ Mobile-first, 430px max width
- ✓ Sector color bars using 4-side explicit border (not border+borderLeft conflict)

### Placeholder scan:
- No TBD or TODO
- All code is complete and executable
- All types reference `Holding` from `lib/types.ts`

### Type consistency:
- `holdingGeo(h)`, `holdingSector(h)`, `holdingCurrency(h)` — consistent helpers used throughout
- `CARD_S` = shared card style (background + border + borderRadius + marginBottom)
- `lb(col)` = left-border helper, returns 4-side explicit border properties
