'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useToast } from '../components/toast'
import type { QsNewsCard, QsBriefSections, QsNewsBriefRow, Sentiment } from '@/lib/types'
import { stripCiteTags, parseArr } from '@/lib/news-utils'

// ── design tokens ─────────────────────────────────────────────────────────────
const BG = 'var(--bg)'
const CARD = 'var(--bg-card)'
const BORDER = 'var(--border)'
const ACCENT = 'var(--accent)'
const TEXT = 'var(--text)'
const MUTED = 'var(--text-muted)'
const BLUE = '#4A6FA5'

const SENT_COLOR: Record<string, string> = {
  bullish: '#3DD68C',
  bearish: '#FF5A5A',
  neutral: '#6B7A92',
}

const SEC_COLOR: Record<string, string> = {
  world: '#4A6FA5',
  sg: '#3DD68C',
  prop: '#F5C842',
  jobs: '#E8520A',
  port: '#9B6DFF',
}

const TICKER_COLOR: Record<string, string> = {
  MU: '#9B6DFF', NVDA: '#9B6DFF', INTC: '#9B6DFF', GOOG: '#9B6DFF',
  AAPL: '#9B6DFF', AMD: '#9B6DFF',
  ABBV: '#FF6B9D', NEE: '#06D6A0',
  RING: '#F5C842', CMCL: '#F5C842', COPX: '#F5C842',
  AGIX: '#4A6FA5', FXI: '#4A6FA5', ICLN: '#4A6FA5', QQQ: '#4A6FA5',
  VCX: '#4A6FA5', BSTZ: '#4A6FA5',
  D05: '#3DD68C', WISE: '#3DD68C',
  NFLX: '#E8520A', SLB: '#F0A500',
  PG: '#8A96AA', KO: '#A3E635', BUD: '#A3E635', MNST: '#A3E635', ULVR: '#A3E635',
  Z74: '#38BDF8', MOO: '#84CC16', DD: '#C87941',
}

// ── system prompt (baked in, matches skill spec) ───────────────────────────────
const SEARCH_SYS = `You are a news analyst. Search for the latest news using web_search. Return ONLY a raw JSON array — no markdown fences, no backticks, no preamble, nothing outside the array. Each item must have exactly these keys: {"id":"string","category":"string","sentiment":"bullish|bearish|neutral","headline":"string (max 12 words)","catalyst":"string (one line or empty)","summary":"string (2-3 sentences)","keyPoints":["str","str","str"],"source":"string","url":"string or empty string","timestamp":"placeholder"}. Return [] if nothing found. NEVER fabricate URLs or statistics.`

const PORT_SYS = `You are a financial news analyst. Search for recent stock news using web_search. Return ONLY a raw JSON array — no markdown, no preamble. Each item: {"ticker":"TICKER","category":"string","sentiment":"bullish|bearish|neutral","headline":"string (max 12 words)","catalyst":"string (one line or empty)","summary":"string (2-3 sentences)","keyPoints":["str","str","str"],"source":"string","url":"string or empty string"}. Only include tickers for which you found genuine recent news. Skip tickers with no news. Return []. NEVER fabricate.`

// ── agentic loop helpers ───────────────────────────────────────────────────────
type AnthropicMsg = { role: string; content: unknown }
type ContentBlock = { type: string; text?: string; id?: string }

async function anthropicTurn(messages: AnthropicMsg[], system: string): Promise<{
  stop_reason: string
  content: ContentBlock[]
}> {
  const opts = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      system,
      messages,
    }),
  }
  let res = await fetch('/api/news/generate', opts)
  if (!res.ok && (res.status === 429 || res.status >= 500)) {
    await new Promise(r => setTimeout(r, 2000))
    res = await fetch('/api/news/generate', opts)
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error ?? `API ${res.status}`)
  }
  return res.json()
}

async function agenticLoop(system: string, userMsg: string): Promise<string> {
  let messages: AnthropicMsg[] = [{ role: 'user', content: userMsg }]
  for (let turn = 0; turn < 8; turn++) {
    const data = await anthropicTurn(messages, system)
    const content = data.content ?? []
    const texts = content.filter(b => b.type === 'text').map(b => b.text ?? '')

    if (data.stop_reason === 'end_turn') return stripCiteTags(texts.join('').trim())

    if (data.stop_reason === 'tool_use') {
      messages = [...messages, { role: 'assistant', content }]
      const results = content
        .filter(b => b.type === 'tool_use')
        .map(b => ({
          type: 'tool_result',
          tool_use_id: b.id,
          content: texts.join('') || 'Search completed.',
        }))
      if (results.length) messages = [...messages, { role: 'user', content: results }]
      continue
    }
    if (texts.length) return stripCiteTags(texts.join('').trim())
    break
  }
  return ''
}


function nowSGT(): string {
  try {
    return new Date().toLocaleString('en-SG', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false,
      timeZone: 'Asia/Singapore',
    }) + ' SGT'
  } catch { return new Date().toISOString().slice(0, 16).replace('T', ' ') + ' SGT' }
}

function mapCard(
  it: Record<string, unknown>,
  key: string,
  i: number,
  ts: string,
  ticker?: string
): QsNewsCard {
  const sent = it.sentiment as string
  return {
    id: `${key}-${i}`,
    timestamp: ts,
    category: String(it.category ?? 'News'),
    sentiment: (['bullish', 'bearish', 'neutral'] as const).includes(sent as Sentiment)
      ? (sent as Sentiment) : 'neutral',
    headline: stripCiteTags(String(it.headline ?? 'No headline')),
    catalyst: stripCiteTags(String(it.catalyst ?? '')),
    summary: stripCiteTags(String(it.summary ?? '')),
    keyPoints: Array.isArray(it.keyPoints)
      ? (it.keyPoints as string[]).map(p => stripCiteTags(String(p)))
      : [],
    source: String(it.source ?? 'Unknown'),
    url: String(it.url ?? ''),
    ticker: ticker ?? (it.ticker ? String(it.ticker) : undefined),
    tickerColor: ticker ? (TICKER_COLOR[ticker] ?? '#8A96AA') : undefined,
  }
}

// ── sub-components ─────────────────────────────────────────────────────────────
function Skeleton() {
  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, marginBottom: 12, padding: '16px 14px' }}>
      <style>{`@keyframes qs-pulse{0%,100%{opacity:.9}50%{opacity:.2}}`}</style>
      {[70, 180, 110, 220, 150, 90].map((w, i) => (
        <div key={i} style={{
          height: i === 2 ? 18 : 10, width: w, maxWidth: '92%',
          background: 'var(--bg-dim)', borderRadius: 4, marginBottom: 10,
          animation: 'qs-pulse 1.4s ease-in-out infinite',
          animationDelay: `${i * 0.08}s`,
        }} />
      ))}
    </div>
  )
}

function SentimentBadge({ s }: { s: string }) {
  const color = SENT_COLOR[s] ?? SENT_COLOR.neutral
  return (
    <span style={{
      background: color + '22', color, border: `1px solid ${color}44`,
      padding: '1px 8px', borderRadius: 4, fontSize: '0.7rem', fontWeight: 700,
      flexShrink: 0, textTransform: 'capitalize', fontFamily: 'system-ui, sans-serif',
    }}>{s}</span>
  )
}

function NewsCard({ item, showTicker }: { item: QsNewsCard; showTicker?: boolean }) {
  const [open, setOpen] = useState(false)
  const color = SENT_COLOR[item.sentiment] ?? SENT_COLOR.neutral
  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, marginBottom: 10, overflow: 'hidden' }}>
      <div style={{ height: 3, background: `linear-gradient(90deg, ${color}99, transparent)` }} />
      <div style={{ padding: '12px 14px' }}>
        {/* Top row: category + sentiment */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: '0.68rem', color: MUTED, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'system-ui, sans-serif' }}>
            {item.category}
          </span>
          <SentimentBadge s={item.sentiment} />
        </div>

        {/* Ticker chip */}
        {showTicker && item.ticker && (
          <div style={{ marginBottom: 6 }}>
            <span style={{
              fontFamily: "'Courier New', monospace", fontSize: '0.78rem', fontWeight: 700,
              color: item.tickerColor ?? '#8A96AA',
              background: (item.tickerColor ?? '#8A96AA') + '18',
              border: `1px solid ${(item.tickerColor ?? '#8A96AA')}33`,
              padding: '1px 7px', borderRadius: 4,
            }}>{item.ticker}</span>
          </div>
        )}

        {/* Headline */}
        <div style={{ marginBottom: item.catalyst ? 5 : 8 }}>
          {item.url ? (
            <a href={item.url} target="_blank" rel="noopener noreferrer" style={{
              color: TEXT, textDecoration: 'none', fontFamily: "Georgia, 'Times New Roman', serif",
              fontSize: '0.92rem', fontWeight: 600, lineHeight: 1.4,
            }}>{item.headline}</a>
          ) : (
            <span style={{ color: TEXT, fontFamily: "Georgia, 'Times New Roman', serif", fontSize: '0.92rem', fontWeight: 600, lineHeight: 1.4 }}>
              {item.headline}
            </span>
          )}
        </div>

        {/* Catalyst */}
        {item.catalyst && (
          <div style={{ color: ACCENT, fontSize: '0.78rem', fontStyle: 'italic', marginBottom: 7 }}>
            ◆ {stripCiteTags(item.catalyst)}
          </div>
        )}

        {/* Summary + key points (collapsible on mobile) */}
        {item.summary && (
          <p style={{ margin: '0 0 6px', color: MUTED, fontSize: '0.82rem', lineHeight: 1.6, fontFamily: 'system-ui, sans-serif' }}>
            {stripCiteTags(item.summary)}
          </p>
        )}

        {item.keyPoints.length > 0 && (
          <>
            <button
              onClick={() => setOpen(v => !v)}
              style={{ background: 'none', border: 'none', color: BLUE, fontSize: '0.73rem', cursor: 'pointer', padding: '0 0 4px', fontFamily: 'system-ui, sans-serif' }}
            >
              {open ? '▲ hide key points' : `▼ ${item.keyPoints.length} key points`}
            </button>
            {open && (
              <ul style={{ margin: '0 0 6px', padding: 0, listStyle: 'none' }}>
                {item.keyPoints.map((pt, i) => (
                  <li key={i} style={{ color: MUTED, fontSize: '0.78rem', lineHeight: 1.55, marginBottom: 3, fontFamily: 'system-ui, sans-serif' }}>
                    <span style={{ color: ACCENT, marginRight: 5 }}>›</span>{stripCiteTags(pt)}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: `1px solid ${BORDER}`, paddingTop: 6, marginTop: 4 }}>
          <span style={{ fontSize: '0.7rem', color: MUTED, fontWeight: 600, fontFamily: 'system-ui, sans-serif' }}>{item.source}</span>
          <span style={{ fontSize: '0.68rem', color: '#484f58', fontFamily: "'Courier New', monospace" }}>{item.timestamp}</span>
        </div>
      </div>
    </div>
  )
}

function SecHdr({
  secId, title, color, count, open, onToggle,
}: {
  secId: string; title: string; color: string; count: number; open: boolean; onToggle: () => void
}) {
  return (
    <div
      id={secId}
      onClick={onToggle}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0.75rem 0', cursor: 'pointer', userSelect: 'none',
        borderBottom: open ? `1px solid ${BORDER}` : 'none',
        marginBottom: open ? '0.75rem' : 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 3, height: 20, background: color, borderRadius: 2, flexShrink: 0 }} />
        <h2 style={{
          margin: 0, fontFamily: "Georgia, 'Times New Roman', serif",
          fontSize: 'calc(13px + 9px)', color: TEXT, fontWeight: 700,
        }}>{title}</h2>
        {count > 0 && (
          <span style={{ fontSize: '0.7rem', color: MUTED, fontFamily: 'system-ui, sans-serif' }}>{count}</span>
        )}
      </div>
      <span style={{ color: MUTED, fontSize: '0.8rem' }}>{open ? '▲' : '▼'}</span>
    </div>
  )
}

function SectionBlock({
  secId, title, color, items, loading, showTicker = false, defaultOpen = true, onOpen,
}: {
  secId: string; title: string; color: string; items: QsNewsCard[]
  loading?: boolean; showTicker?: boolean; defaultOpen?: boolean
  onOpen?: () => void
}) {
  const [open, setOpen] = useState(defaultOpen)

  function toggle() {
    const next = !open
    setOpen(next)
    if (next && items.length === 0 && !loading) onOpen?.()
  }

  return (
    <div style={{ marginBottom: '1.25rem' }}>
      <SecHdr secId={secId} title={title} color={color} count={items.length} open={open} onToggle={toggle} />
      {open && (
        loading
          ? [1, 2, 3].map(i => <Skeleton key={i} />)
          : items.length > 0
            ? items.map(item => <NewsCard key={item.id} item={item} showTicker={showTicker} />)
            : <p style={{ color: MUTED, fontSize: '0.82rem', fontStyle: 'italic', fontFamily: 'system-ui, sans-serif' }}>
                No stories yet — hit Refresh to generate.
              </p>
      )}
    </div>
  )
}

// ── main component ─────────────────────────────────────────────────────────────
const EMPTY_SECTIONS: QsBriefSections = {
  world: [], sg: [], prop: [], jobsGlobal: [], jobsSg: [], port: [],
}

const NAV_ITEMS = [
  { id: 'world', label: 'World' },
  { id: 'sg', label: 'Singapore' },
  { id: 'prop', label: 'Property' },
  { id: 'jobs', label: 'Jobs' },
  { id: 'port', label: 'Portfolio' },
]

export function NewsClient({
  sharedTickers,
}: {
  sharedTickers?: string[]
} = {}) {
  const { showToast } = useToast()
  const [brief, setBrief] = useState<QsNewsBriefRow | null | undefined>(undefined)
  const [news, setNews] = useState<QsBriefSections>(EMPTY_SECTIONS)
  const [portfolioTickers, setPortfolioTickers] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshMsg, setRefreshMsg] = useState('')
  const [loadingSections, setLoadingSections] = useState<Record<string, boolean>>({})
  const [sentFilter, setSentFilter] = useState<'all' | Sentiment>('all')
  const fileRef = useRef<HTMLInputElement>(null)
  const propFetchedRef = useRef(false)
  const sharedTickersPrevRef = useRef<string>('')

  // ── load brief from DB on mount ─────────────────────────────────────────────
  const loadBrief = useCallback(async () => {
    try {
      const res = await fetch('/api/news')
      if (!res.ok) throw new Error('fetch failed')
      const data: QsNewsBriefRow | null = await res.json()
      setBrief(data)
      if (data?.brief_json) {
        try {
          const parsed = JSON.parse(data.brief_json) as QsBriefSections
          setNews({ ...EMPTY_SECTIONS, ...parsed })
          // DB already has a prop result (even empty) — no need to auto-fetch on expand
          if ('prop' in parsed) propFetchedRef.current = true
          if (data.tickers) {
            setPortfolioTickers(JSON.parse(data.tickers) as string[])
          }
        } catch { /* malformed JSON — keep empty */ }
      }
    } catch {
      setBrief(null)
    }
  }, [])

  useEffect(() => { loadBrief() }, [loadBrief])

  // BUG-056: populate tickers from the latest portfolio snapshot (OCR-uploaded holdings)
  // so the Portfolio News section is available without requiring an HTML file upload.
  useEffect(() => {
    async function loadTickers() {
      try {
        const res = await fetch('/api/portfolio/snapshots')
        if (!res.ok) return
        const data = await res.json()
        if (!data?.holdings?.length) return
        const tickers = [...new Set(
          (data.holdings as { ticker?: string | null }[])
            .map(h => h.ticker)
            .filter((t): t is string => typeof t === 'string' && t.length > 0)
        )]
        if (tickers.length > 0) setPortfolioTickers(tickers)
      } catch { /* silent */ }
    }
    void loadTickers()
  }, [])

  useEffect(() => {
    if (sharedTickers === undefined) return
    const key = sharedTickers.join(',')
    if (key === sharedTickersPrevRef.current) return
    sharedTickersPrevRef.current = key
    setPortfolioTickers(sharedTickers)
    if (sharedTickers.length > 0) {
      void refreshPortfolioNews(sharedTickers)
    }
    // refreshPortfolioNews closes over stable state setters; intentionally omitted from deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedTickers])

  useEffect(() => {
    function onOpenUpload() { fileRef.current?.click() }
    window.addEventListener('news:open-upload', onOpenUpload)
    return () => window.removeEventListener('news:open-upload', onOpenUpload)
  }, [])

  // ── portfolio news generation (called after upload and during full refresh) ──
  async function refreshPortfolioNews(tickers: string[]) {
    if (tickers.length === 0) return
    setLoadingSections(p => ({ ...p, port: true }))
    try {
      const today = new Date().toLocaleDateString('en-SG', {
        day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Singapore',
      })
      const q = `Search recent news for these portfolio tickers today ${today}: ${tickers.join(', ')}.`
      const raw = await agenticLoop(PORT_SYS, q)
      const items = parseArr(raw)
      const ts = nowSGT()
      const cards = items.slice(0, 20).map((it, i) => {
        const ticker = it.ticker ? String(it.ticker) : undefined
        return mapCard(it, 'port', i, ts, ticker)
      })
      setNews(p => ({ ...p, port: cards }))
    } catch (err) {
      console.error('Portfolio refresh error:', err)
    }
    setLoadingSections(p => ({ ...p, port: false }))
  }

  // ── property auto-fetch on first open (only if empty, only once per session) ─
  async function handlePropOpen() {
    if (propFetchedRef.current) return
    propFetchedRef.current = true
    setLoadingSections(p => ({ ...p, prop: true }))
    try {
      const today = new Date().toLocaleDateString('en-SG', {
        day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Singapore',
      })
      const q = `Search top 5 Singapore property market news today ${today}: HDB, condo, landed, commercial, launches, policy.`
      const raw = await agenticLoop(SEARCH_SYS, q)
      let items = parseArr(raw)
      if (items.length === 0 && raw.length > 0 && !raw.trimStart().startsWith('[')) {
        console.warn('[news:prop] empty parse on non-empty response, retrying. Preview:', raw.slice(0, 120))
        const raw2 = await agenticLoop(SEARCH_SYS, q)
        items = parseArr(raw2)
      }
      const ts = nowSGT()
      const cards = items.slice(0, 5).map((it, i) => mapCard(it, 'prop', i, ts))
      setNews(p => ({ ...p, prop: cards }))
      if (cards.length === 0) propFetchedRef.current = false
    } catch (err) {
      console.error('Property auto-fetch error:', err)
      propFetchedRef.current = false
    }
    setLoadingSections(p => ({ ...p, prop: false }))
  }

  // ── upload portfolio HTML ────────────────────────────────────────────────────
  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/news/upload', { method: 'POST', body: form })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error ?? `Upload failed (${res.status})`)
      }
      const { tickers } = await res.json() as { tickers: string[] }
      setPortfolioTickers(tickers)
      showToast(`Portfolio loaded — ${tickers.length} tickers found`, 'success')
      if (tickers.length > 0) void refreshPortfolioNews(tickers)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Upload failed', 'error')
    } finally {
      setUploading(false)
      // Reset input so the same file can be re-uploaded
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  // ── refresh: agentic loop via /api/news/generate proxy ──────────────────────
  async function handleRefresh() {
    if (refreshing) return
    setRefreshing(true)

    const today = new Date().toLocaleDateString('en-SG', {
      day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Singapore',
    })

    const sectionConfigs = [
      {
        key: 'world' as const, n: 7,
        q: `Search top 7 world headlines today ${today}: geopolitics, macro, oil, trade, conflicts, major global events.`,
      },
      {
        key: 'sg' as const, n: 5,
        q: `Search top 5 Singapore headlines today ${today}: MAS, economy, government, finance, policy, society.`,
      },
      {
        key: 'prop' as const, n: 5,
        q: `Search top 5 Singapore property market news today ${today}: HDB, condo, landed, commercial, launches, policy.`,
      },
      {
        key: 'jobsGlobal' as const, n: 2,
        q: `Search 2 global tech layoff and AI workforce news stories today ${today}.`,
      },
      {
        key: 'jobsSg' as const, n: 2,
        q: `Search 2 Singapore tech employment and AI workforce news today ${today}.`,
      },
    ]

    const fresh: QsBriefSections = { ...EMPTY_SECTIONS, port: news.port }

    for (const { key, n, q } of sectionConfigs) {
      const label = { world: 'World', sg: 'Singapore', prop: 'Property', jobsGlobal: 'Global Jobs', jobsSg: 'SG Jobs' }[key]
      setRefreshMsg(`↻ Refreshing ${label}...`)
      setLoadingSections(p => ({ ...p, [key]: true }))
      try {
        const raw = await agenticLoop(SEARCH_SYS, q)
        let items = parseArr(raw)
        if (items.length === 0 && raw.length > 0 && !raw.trimStart().startsWith('[')) {
          console.warn(`[news:${key}] empty parse on non-empty response, retrying. Preview:`, raw.slice(0, 120))
          const raw2 = await agenticLoop(SEARCH_SYS, q)
          items = parseArr(raw2)
        }
        const ts = nowSGT()
        const cards = items.slice(0, n).map((it, i) => mapCard(it, key, i, ts))
        fresh[key] = cards
        setNews(p => ({ ...p, [key]: cards }))
        if (key === 'prop' && cards.length > 0) propFetchedRef.current = true
      } catch (err) {
        console.error(`Refresh error [${key}]:`, err)
      }
      setLoadingSections(p => ({ ...p, [key]: false }))
    }

    // Portfolio section
    if (portfolioTickers.length > 0) {
      setRefreshMsg('↻ Refreshing Portfolio News...')
      setLoadingSections(p => ({ ...p, port: true }))
      try {
        const q = `Search recent news for these portfolio tickers today ${today}: ${portfolioTickers.join(', ')}.`
        const raw = await agenticLoop(PORT_SYS, q)
        const items = parseArr(raw)
        const ts = nowSGT()
        const cards = items.slice(0, 20).map((it, i) => {
          const ticker = it.ticker ? String(it.ticker) : undefined
          return mapCard(it, 'port', i, ts, ticker)
        })
        fresh.port = cards
        setNews(p => ({ ...p, port: cards }))
      } catch (err) {
        console.error('Portfolio refresh error:', err)
      }
      setLoadingSections(p => ({ ...p, port: false }))
    }

    // Persist to DB
    try {
      await fetch('/api/news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brief_json: fresh,
          tickers: portfolioTickers.length > 0 ? portfolioTickers : undefined,
        }),
      })
    } catch (err) {
      console.error('Save brief error:', err)
    }

    setRefreshMsg('✓ Brief generated')
    setRefreshing(false)
    setTimeout(() => setRefreshMsg(''), 3000)
    showToast('Brief refreshed', 'success')
  }

  // ── filter helper ─────────────────────────────────────────────────────────────
  function filt(items: QsNewsCard[]): QsNewsCard[] {
    if (sentFilter === 'all') return items
    return items.filter(it => it.sentiment === sentFilter)
  }

  // ── scroll nav ────────────────────────────────────────────────────────────────
  function go(id: string) {
    document.getElementById('sec-' + id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // ── card totals for masthead ───────────────────────────────────────────────────
  const allCards = [
    ...news.world, ...news.sg, ...news.prop,
    ...news.jobsGlobal, ...news.jobsSg, ...news.port,
  ]
  const totalCards = allCards.length

  if (brief === undefined) {
    return (
      <div style={{ background: BG, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: MUTED, fontFamily: 'system-ui, sans-serif' }}>Loading...</p>
      </div>
    )
  }

  return (
    <div style={{ background: BG, minHeight: '100vh' }}>

      {/* ── sticky sub-nav ───────────────────────────────────────────────────── */}
      <div style={{
        position: 'sticky', top: 52, zIndex: 30,
        background: BG, borderBottom: `1px solid ${BORDER}`,
        padding: '0 1rem',
      }}>
        <div style={{
          maxWidth: 680, margin: '0 auto',
          display: 'flex', alignItems: 'center', gap: 8,
          overflowX: 'auto', scrollbarWidth: 'none', height: 44,
        }}>
          {/* Section jump buttons — hidden in empty state so Upload/Refresh are immediately visible */}
          {totalCards > 0 && NAV_ITEMS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => go(id)}
              style={{
                background: 'none', border: `1px solid ${BORDER}`,
                color: MUTED, borderRadius: 6, padding: '3px 10px',
                fontSize: 'calc(13px - 2px)', cursor: 'pointer', whiteSpace: 'nowrap',
                fontFamily: 'system-ui, sans-serif', flexShrink: 0,
              }}
            >{label}</button>
          ))}

          <div style={{ flex: 1 }} />

          {/* Refresh button */}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            style={{
              background: refreshing ? 'var(--bg-dim)' : ACCENT,
              border: 'none', color: refreshing ? MUTED : '#fff',
              borderRadius: 6, padding: '3px 12px',
              fontSize: 'calc(13px - 2px)', cursor: refreshing ? 'not-allowed' : 'pointer',
              fontWeight: 600, whiteSpace: 'nowrap',
              fontFamily: 'system-ui, sans-serif', flexShrink: 0,
            }}
          >
            {refreshing ? '↻ Refreshing...' : '↻ Refresh'}
          </button>
        </div>
      </div>

      {/* Hidden file input for portfolio upload */}
      <input
        ref={fileRef}
        type="file"
        accept=".html,.htm"
        style={{ display: 'none' }}
        onChange={handleUpload}
      />

      <div style={{ maxWidth: 680, margin: '0 auto', padding: '1rem 1rem 3rem' }}>

        {/* ── masthead ───────────────────────────────────────────────────────── */}
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <h1 style={{
              margin: 0, fontFamily: "Georgia, 'Times New Roman', serif",
              fontSize: '1.6rem', color: TEXT, fontWeight: 700, lineHeight: 1.2,
            }}>QS Daily Brief</h1>
          </div>

          {/* Refresh status message */}
          {refreshMsg && (
            <div style={{
              marginTop: 6, fontSize: '0.78rem', color: BLUE,
              fontFamily: "'Courier New', monospace",
            }}>{refreshMsg}</div>
          )}

          {/* Sentiment filter pills */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: '0.75rem' }}>
            {(['all', 'bullish', 'bearish', 'neutral'] as const).map(s => {
              const active = sentFilter === s
              const color = s === 'all' ? TEXT : SENT_COLOR[s]
              return (
                <button
                  key={s}
                  onClick={() => setSentFilter(s)}
                  style={{
                    background: active ? (s === 'all' ? 'var(--bg-dim)' : color + '22') : 'none',
                    border: `1px solid ${active ? (s === 'all' ? BORDER : color) : BORDER}`,
                    color: active ? (s === 'all' ? TEXT : color) : MUTED,
                    borderRadius: 20, padding: '3px 12px',
                    fontSize: '0.72rem', cursor: 'pointer', textTransform: 'capitalize',
                    fontFamily: 'system-ui, sans-serif', fontWeight: active ? 600 : 400,
                  }}
                >{s === 'all' ? `All${totalCards > 0 ? ` (${totalCards})` : ''}` : s}</button>
              )
            })}
          </div>
        </div>

        {/* ── sections ──────────────────────────────────────────────────────── */}
        <SectionBlock
          secId="sec-world"
          title="World Headlines"
          color={SEC_COLOR.world}
          items={filt(news.world)}
          loading={loadingSections.world}
          defaultOpen
        />

        <SectionBlock
          secId="sec-sg"
          title="Singapore Headlines"
          color={SEC_COLOR.sg}
          items={filt(news.sg)}
          loading={loadingSections.sg}
          defaultOpen
        />

        <SectionBlock
          secId="sec-prop"
          title="Singapore Property"
          color={SEC_COLOR.prop}
          items={filt(news.prop)}
          loading={loadingSections.prop}
          defaultOpen={false}
          onOpen={handlePropOpen}
        />

        {/* Jobs: two subsections under one scroll anchor */}
        <div id="sec-jobs" style={{ marginBottom: '1.25rem' }}>
          <SectionBlock
            secId="sec-jobs-global"
            title="Global Tech Employment"
            color={SEC_COLOR.jobs}
            items={filt(news.jobsGlobal)}
            loading={loadingSections.jobsGlobal}
            defaultOpen={false}
          />
          <SectionBlock
            secId="sec-jobs-sg"
            title="Singapore Tech Jobs"
            color={SEC_COLOR.jobs}
            items={filt(news.jobsSg)}
            loading={loadingSections.jobsSg}
            defaultOpen={false}
          />
        </div>

        {/* Portfolio: only shown when tickers are loaded or port section has data */}
        {(portfolioTickers.length > 0 || news.port.length > 0) && (
          <SectionBlock
            secId="sec-port"
            title="Portfolio News"
            color={SEC_COLOR.port}
            items={filt(news.port)}
            loading={loadingSections.port}
            showTicker
            defaultOpen
          />
        )}
      </div>
    </div>
  )
}
