'use client'

import { useEffect, useState, useCallback } from 'react'
import { useToast } from '../components/toast'
import type { BriefContent, Sentiment, HeadlineItem, JobItem, MarketRow, KeyMover } from '@/lib/types'

// ── styles ────────────────────────────────────────────────────────────────────
const CARD: React.CSSProperties = {
  background: '#161b22',
  border: '1px solid #30363d',
  borderRadius: '10px',
  marginBottom: '0.75rem',
  overflow: 'hidden',
}
const SECTION_HEADER: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '0.85rem 1.1rem',
  cursor: 'pointer',
  userSelect: 'none',
}
const SECTION_BODY: React.CSSProperties = {
  padding: '0 1.1rem 1rem',
  borderTop: '1px solid #21262d',
}
const BTN_PRI: React.CSSProperties = {
  padding: '0.4rem 0.9rem', borderRadius: '6px', border: 'none',
  cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500,
  background: '#f0b429', color: '#0d1117',
}

function sentimentStyle(s: Sentiment | undefined): React.CSSProperties {
  if (s === 'bullish') return { background: 'rgba(63,184,132,0.15)', color: '#3fb884', border: '1px solid rgba(63,184,132,0.3)', padding: '1px 8px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 600, flexShrink: 0 }
  if (s === 'bearish') return { background: 'rgba(248,81,73,0.12)', color: '#f85149', border: '1px solid rgba(248,81,73,0.3)', padding: '1px 8px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 600, flexShrink: 0 }
  return { background: 'rgba(240,180,41,0.12)', color: '#f0b429', border: '1px solid rgba(240,180,41,0.3)', padding: '1px 8px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 600, flexShrink: 0 }
}

function changeColor(n: number | undefined) {
  if (n === undefined) return '#8b949e'
  return n > 0 ? '#3fb884' : n < 0 ? '#f85149' : '#8b949e'
}

function fmtChange(n: number | undefined, pct?: boolean) {
  if (n === undefined) return '-'
  const sign = n > 0 ? '+' : ''
  return pct ? `${sign}${n.toFixed(2)}%` : `${sign}${n.toFixed(2)}`
}

// ── collapsible section ───────────────────────────────────────────────────────
function Section({ title, icon, defaultOpen = true, children }: { title: string; icon: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={CARD}>
      <div style={SECTION_HEADER} onClick={() => setOpen(v => !v)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <span style={{ fontSize: '1rem' }}>{icon}</span>
          <span style={{ color: '#e6edf3', fontWeight: 600, fontSize: '0.9rem' }}>{title}</span>
        </div>
        <span style={{ color: '#8b949e', fontSize: '0.8rem' }}>{open ? '▲' : '▼'}</span>
      </div>
      {open && <div style={SECTION_BODY}>{children}</div>}
    </div>
  )
}

// ── market table ─────────────────────────────────────────────────────────────
function MarketTable({ rows, label }: { rows: MarketRow[]; label: string }) {
  if (!rows || rows.length === 0) return null
  return (
    <div style={{ marginBottom: '1rem' }}>
      <div style={{ fontSize: '0.75rem', color: '#8b949e', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem', paddingTop: '0.75rem' }}>{label}</div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #30363d' }}>
              <th style={{ textAlign: 'left', color: '#8b949e', fontWeight: 500, padding: '0.3rem 0.4rem 0.3rem 0' }}>Name</th>
              <th style={{ textAlign: 'right', color: '#8b949e', fontWeight: 500, padding: '0.3rem 0.4rem' }}>Price</th>
              <th style={{ textAlign: 'right', color: '#8b949e', fontWeight: 500, padding: '0.3rem 0.4rem' }}>Chg</th>
              <th style={{ textAlign: 'right', color: '#8b949e', fontWeight: 500, padding: '0.3rem 0 0.3rem 0.4rem' }}>Chg %</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #21262d' }}>
                <td style={{ padding: '0.45rem 0.4rem 0.45rem 0', color: '#e6edf3' }}>
                  <div>{r.name}</div>
                  {r.ticker && <div style={{ fontSize: '0.72rem', color: '#8b949e' }}>{r.ticker}</div>}
                </td>
                <td style={{ padding: '0.45rem 0.4rem', textAlign: 'right', color: '#e6edf3' }}>
                  {r.value !== undefined ? r.value.toLocaleString() : '-'}
                </td>
                <td style={{ padding: '0.45rem 0.4rem', textAlign: 'right', color: changeColor(r.change) }}>
                  {fmtChange(r.change)}
                </td>
                <td style={{ padding: '0.45rem 0 0.45rem 0.4rem', textAlign: 'right', color: changeColor(r.change_pct) }}>
                  {fmtChange(r.change_pct, true)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── key movers ────────────────────────────────────────────────────────────────
function KeyMovers({ movers }: { movers: KeyMover[] }) {
  if (!movers || movers.length === 0) return null
  return (
    <div style={{ marginBottom: '0.5rem' }}>
      <div style={{ fontSize: '0.75rem', color: '#8b949e', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem', paddingTop: '0.75rem' }}>Key Movers</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        {movers.map((m, i) => (
          <div key={i} style={{ background: '#0d1117', border: '1px solid #30363d', borderRadius: '6px', padding: '0.4rem 0.75rem', minWidth: '90px' }}>
            <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#e6edf3' }}>{m.ticker}</div>
            {m.name && <div style={{ fontSize: '0.72rem', color: '#8b949e' }}>{m.name}</div>}
            <div style={{ fontWeight: 600, fontSize: '0.85rem', color: changeColor(m.change_pct), marginTop: '2px' }}>
              {fmtChange(m.change_pct, true)}
            </div>
            {m.note && <div style={{ fontSize: '0.72rem', color: '#8b949e', marginTop: '2px' }}>{m.note}</div>}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── headline item ─────────────────────────────────────────────────────────────
function HeadlineRow({ item }: { item: HeadlineItem }) {
  return (
    <div style={{ padding: '0.75rem 0', borderBottom: '1px solid #21262d' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', marginBottom: item.summary ? '0.35rem' : 0 }}>
        {item.sentiment && <span style={sentimentStyle(item.sentiment)}>{item.sentiment}</span>}
        <div style={{ flex: 1 }}>
          {item.url ? (
            <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ color: '#e6edf3', textDecoration: 'none', fontWeight: 500, fontSize: '0.88rem', lineHeight: 1.4 }}>
              {item.title}
              {item.ticker && <span style={{ marginLeft: '0.4rem', fontSize: '0.75rem', color: '#58a6ff', fontFamily: 'monospace' }}>{item.ticker}</span>}
            </a>
          ) : (
            <span style={{ color: '#e6edf3', fontWeight: 500, fontSize: '0.88rem', lineHeight: 1.4 }}>
              {item.title}
              {item.ticker && <span style={{ marginLeft: '0.4rem', fontSize: '0.75rem', color: '#58a6ff', fontFamily: 'monospace' }}>{item.ticker}</span>}
            </span>
          )}
        </div>
      </div>
      {item.summary && <p style={{ margin: '0 0 0 0', color: '#8b949e', fontSize: '0.82rem', lineHeight: 1.55 }}>{item.summary}</p>}
      {item.source && <div style={{ fontSize: '0.74rem', color: '#484f58', marginTop: '0.25rem' }}>{item.source}</div>}
    </div>
  )
}

// ── simple headline (no sentiment) ────────────────────────────────────────────
function PlainHeadlineRow({ item }: { item: HeadlineItem | JobItem }) {
  const scope = 'scope' in item ? item.scope : undefined
  return (
    <div style={{ padding: '0.75rem 0', borderBottom: '1px solid #21262d' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', marginBottom: item.summary ? '0.35rem' : 0 }}>
        {scope && (
          <span style={{ background: '#21262d', color: '#8b949e', border: '1px solid #30363d', padding: '1px 8px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 600, flexShrink: 0 }}>
            {scope === 'singapore' ? 'SG' : 'Global'}
          </span>
        )}
        <div style={{ flex: 1 }}>
          {item.url ? (
            <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ color: '#e6edf3', textDecoration: 'none', fontWeight: 500, fontSize: '0.88rem', lineHeight: 1.4 }}>
              {item.title}
            </a>
          ) : (
            <span style={{ color: '#e6edf3', fontWeight: 500, fontSize: '0.88rem', lineHeight: 1.4 }}>{item.title}</span>
          )}
        </div>
      </div>
      {item.summary && <p style={{ margin: 0, color: '#8b949e', fontSize: '0.82rem', lineHeight: 1.55 }}>{item.summary}</p>}
      {item.source && <div style={{ fontSize: '0.74rem', color: '#484f58', marginTop: '0.25rem' }}>{item.source}</div>}
    </div>
  )
}

// ── macro theme ───────────────────────────────────────────────────────────────
function MacroTheme({ text }: { text: string }) {
  return (
    <div style={{ background: 'rgba(240,180,41,0.07)', border: '1px solid rgba(240,180,41,0.2)', borderRadius: '8px', padding: '0.75rem 1rem', marginTop: '0.75rem' }}>
      <div style={{ fontSize: '0.72rem', color: '#f0b429', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.35rem' }}>Macro Theme</div>
      <p style={{ margin: 0, color: '#e6edf3', fontSize: '0.88rem', lineHeight: 1.6 }}>{text}</p>
    </div>
  )
}

// ── empty state ───────────────────────────────────────────────────────────────
function EmptyState({ onRefresh, refreshing }: { onRefresh: () => void; refreshing: boolean }) {
  return (
    <div style={{ maxWidth: '480px', margin: '5rem auto', textAlign: 'center' }}>
      <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📰</div>
      <h2 style={{ color: '#e6edf3', marginBottom: '0.5rem' }}>No brief available yet</h2>
      <p style={{ color: '#8b949e', lineHeight: 1.7, marginBottom: '2rem' }}>
        The morning brief runs daily at 7:30 AM SGT.<br />Check back tomorrow morning.
      </p>
      <button style={BTN_PRI} onClick={onRefresh} disabled={refreshing}>
        {refreshing ? 'Checking...' : 'Check Now'}
      </button>
    </div>
  )
}

// ── main component ────────────────────────────────────────────────────────────
export function NewsClient() {
  const { showToast } = useToast()
  const [brief, setBrief] = useState<{ brief_date: string; content_json: string; created_at: string } | null | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [content, setContent] = useState<BriefContent | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/news')
      const data = await res.json()
      setBrief(data)
      if (data) {
        try {
          setContent(JSON.parse(data.content_json))
        } catch {
          setContent(null)
        }
      }
    } catch {
      showToast('Failed to load brief', 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => { load() }, [load])

  async function handleRefresh() {
    setRefreshing(true)
    await load()
    showToast('Brief is up to date', 'success')
    setRefreshing(false)
  }

  if (loading) {
    return (
      <main style={{ padding: '1.5rem', maxWidth: '760px', margin: '0 auto' }}>
        <p style={{ color: '#8b949e' }}>Loading...</p>
      </main>
    )
  }

  if (!brief || !content) {
    return (
      <main style={{ padding: '1.5rem', maxWidth: '760px', margin: '0 auto' }}>
        <EmptyState onRefresh={handleRefresh} refreshing={refreshing} />
      </main>
    )
  }

  const briefDate = brief.brief_date
  const updatedAt = new Date(brief.created_at).toLocaleString('en-SG', {
    timeZone: 'Asia/Singapore',
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

  return (
    <main style={{ padding: '1.5rem', maxWidth: '760px', margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.4rem', color: '#e6edf3' }}>Market Brief</h1>
          <div style={{ fontSize: '0.78rem', color: '#8b949e', marginTop: '3px' }}>
            {briefDate} - Updated {updatedAt} SGT
          </div>
        </div>
        <button style={BTN_PRI} onClick={handleRefresh} disabled={refreshing}>
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* 1. Market Pre-Open */}
      <Section title="Market Pre-Open" icon="📈" defaultOpen>
        <MarketTable rows={content.market_pre_open?.us_futures ?? []} label="US Futures" />
        <MarketTable rows={content.market_pre_open?.asia_overnight ?? []} label="Asia Overnight" />
        <KeyMovers movers={content.market_pre_open?.key_movers ?? []} />
        {content.market_pre_open?.macro_theme && (
          <MacroTheme text={content.market_pre_open.macro_theme} />
        )}
      </Section>

      {/* 2. World Headlines */}
      {content.world_headlines?.length > 0 && (
        <Section title="World Headlines" icon="🌍">
          {content.world_headlines.map((item, i) => (
            <HeadlineRow key={i} item={item} />
          ))}
        </Section>
      )}

      {/* 3. Singapore Headlines */}
      {content.singapore_headlines?.length > 0 && (
        <Section title="Singapore Headlines" icon="🇸🇬">
          {content.singapore_headlines.map((item, i) => (
            <PlainHeadlineRow key={i} item={item} />
          ))}
        </Section>
      )}

      {/* 4. Singapore Property */}
      {content.singapore_property?.length > 0 && (
        <Section title="Singapore Property" icon="🏠" defaultOpen={false}>
          {content.singapore_property.map((item, i) => (
            <PlainHeadlineRow key={i} item={item} />
          ))}
        </Section>
      )}

      {/* 5. Job Market */}
      {content.job_market?.length > 0 && (
        <Section title="Job Market" icon="💼" defaultOpen={false}>
          {content.job_market.map((item, i) => (
            <PlainHeadlineRow key={i} item={item} />
          ))}
        </Section>
      )}

    </main>
  )
}
