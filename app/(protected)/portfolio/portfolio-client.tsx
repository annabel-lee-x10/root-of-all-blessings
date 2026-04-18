'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import { useToast } from '../components/toast'
import type { Holding } from '@/lib/types'

// ── styles ──────────────────────────────────────────────────────────────────
const BTN = { padding: '0.4rem 0.9rem', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500 } as const
const BTN_PRI = { ...BTN, background: '#f0b429', color: '#0d1117' }
const BTN_SEC = { ...BTN, background: '#21262d', color: '#e6edf3', border: '1px solid #30363d' }
const CARD = { background: '#161b22', border: '1px solid #30363d', borderRadius: '10px', padding: '1.25rem 1.5rem' }

const PIE_COLORS = [
  '#f0b429', '#3fb884', '#58a6ff', '#f85149', '#a78bfa',
  '#fb923c', '#34d399', '#60a5fa', '#f472b6', '#facc15',
]

type SortKey = 'name' | 'market_value' | 'pnl' | 'pnl_pct' | 'allocation_pct'
type SortDir = 'asc' | 'desc'

interface Snapshot {
  id: string
  snapshot_date: string
  total_value: number
  total_pnl: number | null
  holdings: Holding[]
}

interface HistoryPoint {
  snapshot_date: string
  total_value: number
  total_pnl: number | null
}

function fmt(n: number, decimals = 2) {
  return n.toLocaleString('en-SG', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function fmtSGD(n: number) {
  return 'S$' + fmt(n)
}

function fmtPct(n: number) {
  return (n >= 0 ? '+' : '') + fmt(n, 2) + '%'
}

function pnlColor(n: number | undefined | null) {
  if (n === undefined || n === null) return '#8b949e'
  return n >= 0 ? '#3fb884' : '#f85149'
}

// ── upload panel ─────────────────────────────────────────────────────────────
function UploadPanel({ onUploaded }: { onUploaded: () => void }) {
  const { showToast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  async function handleFile(file: File) {
    if (!file.name.endsWith('.html') && !file.name.endsWith('.htm') && file.type !== 'text/html') {
      showToast('Please upload an HTML file (save the Syfe page as HTML)', 'error')
      return
    }
    setUploading(true)
    try {
      const html = await file.text()
      const snapshotDate = new Date().toISOString()
      const res = await fetch('/api/portfolio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html, snapshot_date: snapshotDate }),
      })
      const data = await res.json()
      if (!res.ok) {
        showToast(data.error || 'Failed to parse portfolio', 'error')
        return
      }
      showToast(`Imported ${data.holdings_count} holdings - S$${fmt(data.total_value)}`, 'success')
      onUploaded()
    } catch {
      showToast('Upload failed', 'error')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div style={{ maxWidth: '520px', margin: '4rem auto', textAlign: 'center' }}>
      <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📊</div>
      <h2 style={{ color: '#e6edf3', marginBottom: '0.5rem' }}>No portfolio data yet</h2>
      <p style={{ color: '#8b949e', marginBottom: '2rem', lineHeight: 1.6 }}>
        Go to your Syfe portfolio page, press Ctrl+S (or Cmd+S) to save the page as HTML,
        then upload that file here.
      </p>

      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
        onClick={() => fileRef.current?.click()}
        style={{
          border: `2px dashed ${dragOver ? '#f0b429' : '#30363d'}`,
          borderRadius: '12px',
          padding: '3rem',
          cursor: 'pointer',
          background: dragOver ? 'rgba(240,180,41,0.05)' : 'transparent',
          transition: 'all 0.15s',
          marginBottom: '1rem',
        }}
      >
        <div style={{ color: dragOver ? '#f0b429' : '#8b949e', fontSize: '0.95rem' }}>
          {uploading ? 'Parsing...' : 'Drop HTML file here, or click to browse'}
        </div>
      </div>

      <input ref={fileRef} type="file" accept=".html,.htm" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
      <button style={BTN_PRI} onClick={() => fileRef.current?.click()} disabled={uploading}>
        {uploading ? 'Importing...' : 'Choose File'}
      </button>
    </div>
  )
}

// ── main component ────────────────────────────────────────────────────────────
export function PortfolioClient() {
  const { showToast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [snapshot, setSnapshot] = useState<Snapshot | null | undefined>(undefined)
  const [history, setHistory] = useState<HistoryPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('market_value')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const load = useCallback(async () => {
    try {
      const [snapRes, histRes] = await Promise.all([
        fetch('/api/portfolio'),
        fetch('/api/portfolio/history'),
      ])
      const snap = await snapRes.json()
      const hist = await histRes.json()
      setSnapshot(snap)
      setHistory(hist)
    } catch {
      showToast('Failed to load portfolio', 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => { load() }, [load])

  async function handleFile(file: File) {
    setUploading(true)
    try {
      const html = await file.text()
      const res = await fetch('/api/portfolio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html, snapshot_date: new Date().toISOString() }),
      })
      const data = await res.json()
      if (!res.ok) { showToast(data.error || 'Parse failed', 'error'); return }
      showToast(`Imported ${data.holdings_count} holdings - S$${fmt(data.total_value)}`, 'success')
      await load()
    } catch {
      showToast('Upload failed', 'error')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortKey(key); setSortDir('desc') }
  }

  function sortIndicator(key: SortKey) {
    if (sortKey !== key) return ' '
    return sortDir === 'desc' ? ' v' : ' ^'
  }

  if (loading) {
    return (
      <main style={{ padding: '1.5rem', maxWidth: '900px', margin: '0 auto' }}>
        <p style={{ color: '#8b949e' }}>Loading...</p>
      </main>
    )
  }

  if (!snapshot) {
    return (
      <main style={{ padding: '1.5rem', maxWidth: '900px', margin: '0 auto' }}>
        <UploadPanel onUploaded={load} />
      </main>
    )
  }

  // Sort holdings
  const sorted = [...snapshot.holdings].sort((a, b) => {
    const av = a[sortKey] ?? (sortDir === 'desc' ? -Infinity : Infinity)
    const bv = b[sortKey] ?? (sortDir === 'desc' ? -Infinity : Infinity)
    const av2 = typeof av === 'string' ? av.toLowerCase() : av
    const bv2 = typeof bv === 'string' ? bv.toLowerCase() : bv
    if (av2 < bv2) return sortDir === 'desc' ? 1 : -1
    if (av2 > bv2) return sortDir === 'desc' ? -1 : 1
    return 0
  })

  // Top gainers / losers (by pnl_pct)
  const withPnlPct = snapshot.holdings.filter(h => h.pnl_pct !== undefined)
  const gainers = [...withPnlPct].sort((a, b) => (b.pnl_pct ?? 0) - (a.pnl_pct ?? 0)).slice(0, 3)
  const losers = [...withPnlPct].sort((a, b) => (a.pnl_pct ?? 0) - (b.pnl_pct ?? 0)).slice(0, 3)

  // Pie data
  const pieData = snapshot.holdings
    .filter(h => h.allocation_pct && h.allocation_pct > 0)
    .sort((a, b) => (b.allocation_pct ?? 0) - (a.allocation_pct ?? 0))
    .slice(0, 10)
    .map(h => ({ name: h.ticker || h.name.slice(0, 20), value: h.allocation_pct ?? 0 }))

  // History chart data
  const chartData = history.map(h => ({
    date: h.snapshot_date.slice(0, 10),
    value: h.total_value,
  }))

  const snapshotLabel = snapshot.snapshot_date.slice(0, 10)

  return (
    <main style={{ padding: '1.5rem', maxWidth: '900px', margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.4rem', color: '#e6edf3' }}>Portfolio</h1>
          <div style={{ fontSize: '0.78rem', color: '#8b949e', marginTop: '2px' }}>
            Last snapshot: {snapshotLabel} - {snapshot.holdings.length} holdings
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <input ref={fileRef} type="file" accept=".html,.htm" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
          <button style={BTN_SEC} onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? 'Importing...' : 'Update Snapshot'}
          </button>
        </div>
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <div style={CARD}>
          <div style={{ fontSize: '0.75rem', color: '#8b949e', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total Value</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#e6edf3' }}>{fmtSGD(snapshot.total_value)}</div>
        </div>
        {snapshot.total_pnl !== null && (
          <div style={CARD}>
            <div style={{ fontSize: '0.75rem', color: '#8b949e', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total P&L</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 700, color: pnlColor(snapshot.total_pnl) }}>
              {snapshot.total_pnl >= 0 ? '+' : ''}{fmtSGD(snapshot.total_pnl)}
            </div>
            {snapshot.total_value > 0 && (
              <div style={{ fontSize: '0.85rem', color: pnlColor(snapshot.total_pnl), marginTop: '2px' }}>
                {fmtPct((snapshot.total_pnl / (snapshot.total_value - snapshot.total_pnl)) * 100)}
              </div>
            )}
          </div>
        )}
        <div style={CARD}>
          <div style={{ fontSize: '0.75rem', color: '#8b949e', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Holdings</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#e6edf3' }}>{snapshot.holdings.length}</div>
        </div>
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: pieData.length > 0 ? '1fr 1fr' : '1fr', gap: '1rem', marginBottom: '1.5rem' }}>

        {/* Portfolio value over time */}
        {chartData.length > 1 && (
          <div style={CARD}>
            <div style={{ fontSize: '0.8rem', color: '#8b949e', marginBottom: '1rem', fontWeight: 600 }}>Value over Time</div>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={chartData}>
                <XAxis dataKey="date" tick={{ fill: '#8b949e', fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: '#8b949e', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => 'S$' + (v / 1000).toFixed(0) + 'k'} width={55} />
                <Tooltip
                  contentStyle={{ background: '#161b22', border: '1px solid #30363d', borderRadius: '6px', fontSize: '0.8rem' }}
                  formatter={(v) => [fmtSGD(Number(v)), 'Value']}
                  labelStyle={{ color: '#8b949e' }}
                />
                <Line type="monotone" dataKey="value" stroke="#f0b429" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Allocation donut */}
        {pieData.length > 0 && (
          <div style={CARD}>
            <div style={{ fontSize: '0.8rem', color: '#8b949e', marginBottom: '0.5rem', fontWeight: 600 }}>Allocation</div>
            <ResponsiveContainer width="100%" height={chartData.length > 1 ? 180 : 220}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius="55%"
                  outerRadius="80%"
                  dataKey="value"
                  paddingAngle={2}
                >
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: '#161b22', border: '1px solid #30363d', borderRadius: '6px', fontSize: '0.8rem' }}
                  formatter={(v) => [Number(v).toFixed(1) + '%', 'Allocation']}
                />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  formatter={(v) => <span style={{ color: '#8b949e', fontSize: '0.75rem' }}>{v}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Gainers / Losers */}
      {(gainers.length > 0 || losers.length > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
          {gainers.length > 0 && (
            <div style={CARD}>
              <div style={{ fontSize: '0.8rem', color: '#8b949e', marginBottom: '0.75rem', fontWeight: 600 }}>Top Gainers</div>
              {gainers.map((h, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0', borderBottom: i < gainers.length - 1 ? '1px solid #21262d' : 'none' }}>
                  <span style={{ color: '#e6edf3', fontSize: '0.85rem' }}>{h.ticker || h.name.slice(0, 18)}</span>
                  <span style={{ color: '#3fb884', fontSize: '0.85rem', fontWeight: 600 }}>{fmtPct(h.pnl_pct!)}</span>
                </div>
              ))}
            </div>
          )}
          {losers.length > 0 && (
            <div style={CARD}>
              <div style={{ fontSize: '0.8rem', color: '#8b949e', marginBottom: '0.75rem', fontWeight: 600 }}>Top Losers</div>
              {losers.map((h, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0', borderBottom: i < losers.length - 1 ? '1px solid #21262d' : 'none' }}>
                  <span style={{ color: '#e6edf3', fontSize: '0.85rem' }}>{h.ticker || h.name.slice(0, 18)}</span>
                  <span style={{ color: '#f85149', fontSize: '0.85rem', fontWeight: 600 }}>{fmtPct(h.pnl_pct!)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Holdings table */}
      <div style={CARD}>
        <div style={{ fontSize: '0.8rem', color: '#8b949e', marginBottom: '1rem', fontWeight: 600 }}>Holdings</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr>
                {[
                  { key: 'name' as SortKey, label: 'Name' },
                  { key: 'market_value' as SortKey, label: 'Value' },
                  { key: 'pnl' as SortKey, label: 'P&L' },
                  { key: 'pnl_pct' as SortKey, label: 'Return' },
                  { key: 'allocation_pct' as SortKey, label: 'Alloc %' },
                ].map(col => (
                  <th
                    key={col.key}
                    onClick={() => toggleSort(col.key)}
                    style={{
                      textAlign: col.key === 'name' ? 'left' : 'right',
                      color: sortKey === col.key ? '#f0b429' : '#8b949e',
                      fontWeight: 500,
                      padding: '0.4rem 0.5rem',
                      cursor: 'pointer',
                      borderBottom: '1px solid #30363d',
                      whiteSpace: 'nowrap',
                      userSelect: 'none',
                    }}
                  >
                    {col.label}{sortIndicator(col.key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((h, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #21262d' }}>
                  <td style={{ padding: '0.55rem 0.5rem', color: '#e6edf3' }}>
                    <div style={{ fontWeight: 500 }}>{h.name}</div>
                    {h.ticker && h.ticker !== h.name && (
                      <div style={{ fontSize: '0.75rem', color: '#8b949e' }}>{h.ticker}</div>
                    )}
                  </td>
                  <td style={{ padding: '0.55rem 0.5rem', textAlign: 'right', color: '#e6edf3' }}>{fmtSGD(h.market_value)}</td>
                  <td style={{ padding: '0.55rem 0.5rem', textAlign: 'right', color: pnlColor(h.pnl) }}>
                    {h.pnl !== undefined ? `${h.pnl >= 0 ? '+' : ''}${fmtSGD(h.pnl)}` : '-'}
                  </td>
                  <td style={{ padding: '0.55rem 0.5rem', textAlign: 'right', color: pnlColor(h.pnl_pct) }}>
                    {h.pnl_pct !== undefined ? fmtPct(h.pnl_pct) : '-'}
                  </td>
                  <td style={{ padding: '0.55rem 0.5rem', textAlign: 'right', color: '#8b949e' }}>
                    {h.allocation_pct !== undefined ? h.allocation_pct.toFixed(1) + '%' : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </main>
  )
}
