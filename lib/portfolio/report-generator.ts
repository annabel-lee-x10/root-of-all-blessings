// lib/portfolio/report-generator.ts

export interface HoldingRow {
  ticker: string | null
  name: string
  geo: string | null
  sector: string | null
  currency: string | null
  price: number | null
  change_1d: number | null
  value: number
  pnl: number | null
  qty: number | null
  sell_limit: number | null
  buy_limit: number | null
}

export interface OrderRow {
  ticker: string
  type: string
  price: number
  qty: number
  currency: string
  placed: string | null
  note: string | null
  new_flag: number
  snapshot_id: string
}

export interface RealisedRow {
  key: string
  value: number
}

export interface GrowthRow {
  dimension: string
  score: number
  label: string | null
  level: string | null
  items_json: string
  next_text: string | null
}

export interface SnapData {
  id: string
  snapshot_date: string
  snap_label: string | null
  snap_time: string | null
  total_value: number
  unrealised_pnl: number | null
  realised_pnl: number | null
  cash: number | null
  pending: number | null
  net_deposited: number | null
  holdings: HoldingRow[]
  orders: OrderRow[]
  realised: RealisedRow[]
  growth: GrowthRow[]
}

export interface SnapSummary {
  id: string
  snap_label: string | null
  snapshot_date: string
}

const SECTOR_COLOR: Record<string, string> = {
  'ETF': '#4A6FA5', 'Technology': '#9B6DFF', 'Metals': '#F5C842',
  'Financials': '#3DD68C', 'Media': '#E8520A', 'Healthcare': '#FF6B9D',
  'Utilities': '#06D6A0', 'Energy': '#F0A500', 'Telecommunications': '#38BDF8',
  'Consumer Staples': '#A3E635', 'Agriculture ETF': '#84CC16',
  'Materials': '#FB923C', 'Software': '#818CF8',
  'Consumer Discretionary': '#FF9AA2',
}
const GEO_COLOR: Record<string, string> = {
  US: '#4A6FA5', SG: '#E8520A', UK: '#3DD68C', HK: '#F5C842',
}
const FX: Record<string, number> = { USD: 1, SGD: 0.74, GBP: 1.29 }

function sectorColor(s: string | null) { return SECTOR_COLOR[s ?? ''] ?? '#6B7A92' }
function geoColor(g: string | null) { return GEO_COLOR[g ?? ''] ?? '#6B7A92' }
function symFor(cur: string | null) {
  if (cur === 'SGD') return 'S$'
  if (cur === 'GBP') return '£'
  return '$'
}
function valueUSD(h: HoldingRow) { return h.value * (FX[h.currency ?? 'USD'] ?? 1) }
function fmt(n: number, d = 2) {
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
}
function fmtPct(n: number) { return (n >= 0 ? '+' : '') + fmt(n, 2) + '%' }
function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function pnlColor(n: number | null) {
  if (n === null) return ''
  return `color:${n >= 0 ? '#3DD68C' : '#FF5A5A'}`
}

// ── CSS ────────────────────────────────────────────────────────────────────────
const CSS = `
:root { --bg:#0E1117; --card:#161C27; --border:#242C3A; --pale:#C8D0DC; --mid:#6B7A92; --inset:#0A0D14; --orange:#E8520A; --green:#3DD68C; --red:#FF5A5A; --yellow:#F5C842; --slate:#4A6FA5; --purple:#9B6DFF; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: var(--bg); color: var(--pale); font-family: 'Sora', sans-serif; line-height: 1.5; padding: 16px; max-width: 1200px; margin: 0 auto; }
.mono { font-family: 'DM Mono', monospace; } .muted { color: var(--mid); }
.masthead { border-left: 4px solid var(--orange); padding: 12px 20px; margin-bottom: 24px; background: linear-gradient(90deg, rgba(232,82,10,0.05), transparent); }
.masthead .label { font-size: 11px; letter-spacing: 2px; color: var(--orange); text-transform: uppercase; font-weight: 600; }
.masthead h1 { font-size: 26px; margin: 4px 0; }
.masthead .stamps { font-size: 12px; color: var(--mid); font-family: 'DM Mono', monospace; }
.pills { display: flex; gap: 6px; margin-bottom: 24px; flex-wrap: wrap; }
.pill { padding: 6px 10px; border: 1px solid var(--border); border-radius: 16px; font-size: 11px; font-family: 'DM Mono', monospace; color: var(--mid); }
.pill.active { background: var(--orange); color: white; border-color: var(--orange); }
.summary { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin-bottom: 24px; }
@media (max-width: 720px) { .summary { grid-template-columns: repeat(2, 1fr); } }
.stat { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 14px; }
.stat .k { font-size: 10px; letter-spacing: 1px; color: var(--mid); text-transform: uppercase; margin-bottom: 6px; }
.stat .v { font-size: 20px; font-weight: 600; font-family: 'DM Mono', monospace; }
.stat .sub { font-size: 11px; color: var(--mid); font-family: 'DM Mono', monospace; margin-top: 4px; }
.alloc { display: flex; height: 36px; border-radius: 6px; overflow: hidden; margin-bottom: 8px; border: 1px solid var(--border); }
.alloc-seg { transition: opacity 0.2s; cursor: help; }
.alloc-seg:hover { opacity: 0.7; }
.alloc-legend { font-size: 11px; color: var(--mid); font-family: 'DM Mono', monospace; margin-bottom: 24px; }
section { margin-bottom: 32px; }
section h2 { font-size: 14px; letter-spacing: 2px; color: var(--orange); text-transform: uppercase; margin-bottom: 12px; padding-bottom: 6px; border-bottom: 1px solid var(--border); }
.obs-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
@media (max-width: 720px) { .obs-grid { grid-template-columns: 1fr; } }
.obs { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 14px; border-left: 3px solid var(--mid); }
.obs-alert { border-left-color: var(--red); } .obs-watch { border-left-color: var(--yellow); }
.obs-note { border-left-color: var(--slate); } .obs-pos { border-left-color: var(--green); }
.obs-head { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.obs-icon { font-size: 18px; } .obs-title { font-weight: 600; font-size: 14px; }
.obs-body { font-size: 13px; color: var(--pale); }
table.holdings { width: 100%; border-collapse: collapse; font-size: 13px; }
table.holdings th, table.holdings td { padding: 10px 8px; text-align: left; border-bottom: 1px solid var(--border); }
table.holdings th { font-size: 10px; color: var(--mid); letter-spacing: 1px; text-transform: uppercase; font-weight: 500; }
table.holdings td { color: var(--pale); }
.sec-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; vertical-align: middle; }
.geo-badge { padding: 2px 6px; border-radius: 4px; font-size: 9px; letter-spacing: 1px; margin-left: 4px; }
.weight-bar { display: inline-block; width: 80px; height: 6px; background: var(--inset); border-radius: 3px; overflow: hidden; vertical-align: middle; }
.weight-fill { height: 100%; border-radius: 3px; }
.weight-pct { font-size: 11px; color: var(--mid); margin-left: 8px; }
table.orders { width: 100%; border-collapse: collapse; font-size: 12px; }
table.orders th, table.orders td { padding: 8px; text-align: left; border-bottom: 1px solid var(--border); }
table.orders th { font-size: 10px; color: var(--mid); letter-spacing: 1px; text-transform: uppercase; }
.order-type { padding: 2px 6px; border-radius: 4px; font-size: 10px; letter-spacing: 1px; background: rgba(155, 109, 255, 0.15); color: var(--purple); }
.new-badge { padding: 2px 6px; border-radius: 3px; font-size: 9px; background: rgba(6, 214, 160, 0.15); color: #06D6A0; letter-spacing: 1px; margin-left: 6px; }
.realised { display: flex; flex-wrap: wrap; gap: 8px; }
.r-chip { padding: 6px 12px; background: var(--inset); border: 1px solid var(--border); border-radius: 20px; font-family: 'DM Mono', monospace; font-size: 11px; }
.r-chip.gain { color: var(--green); } .r-chip.loss { color: var(--red); }
.risk-flag { display: flex; gap: 12px; padding: 12px; background: var(--card); border-left: 3px solid var(--mid); border-radius: 4px; margin-bottom: 8px; }
.risk-flag.red { border-left-color: var(--red); } .risk-flag.yellow { border-left-color: var(--yellow); }
.risk-flag.slate { border-left-color: var(--slate); }
.risk-level { padding: 4px 8px; border-radius: 4px; font-size: 10px; letter-spacing: 1px; font-weight: 700; align-self: start; min-width: 48px; text-align: center; }
.risk-level.red { background: rgba(255,90,90,0.15); color: var(--red); }
.risk-level.yellow { background: rgba(245,200,66,0.15); color: var(--yellow); }
.risk-level.slate { background: rgba(74,111,165,0.15); color: var(--slate); }
.risk-body { flex: 1; }
.risk-title { font-size: 13px; font-weight: 600; margin-bottom: 4px; }
.risk-desc { font-size: 12px; color: var(--mid); }
.delta-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
@media (max-width: 720px) { .delta-grid { grid-template-columns: repeat(2, 1fr); } }
.delta { background: var(--card); border: 1px solid var(--border); border-radius: 6px; padding: 12px; }
.delta .k { font-size: 10px; color: var(--mid); letter-spacing: 1px; text-transform: uppercase; }
.delta .v { font-family: 'DM Mono', monospace; font-size: 14px; margin-top: 4px; }
.delta .sub { font-size: 11px; color: var(--mid); font-family: 'DM Mono', monospace; }
footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid var(--border); color: var(--mid); font-size: 11px; font-family: 'DM Mono', monospace; }
`

function buildMasthead(snap: SnapData): string {
  const label = esc(snap.snap_label ?? 'Portfolio')
  const date = snap.snapshot_date.slice(0, 10)
  return `
<div class="masthead">
  <div class="label">Syfe Portfolio Report</div>
  <h1>${label} · ${date}</h1>
  <div class="stamps">${esc(snap.snap_time ?? '')} · ${snap.holdings.length} holdings</div>
</div>`
}

function buildPills(snap: SnapData, allSnaps: SnapSummary[]): string {
  const pills = allSnaps.map(s => {
    const lbl = esc(s.snap_label ?? s.snapshot_date.slice(0, 10))
    const cls = s.id === snap.id ? ' active' : ''
    return `<span class="pill${cls}">${lbl}</span>`
  }).join('\n  ')
  return `<div class="pills">\n  ${pills}\n</div>`
}

function buildSummary(snap: SnapData, prevSnap: SnapData | null): string {
  const pv = prevSnap?.total_value ?? null
  const valueDelta = pv !== null ? snap.total_value - pv : null
  const gainers = snap.holdings.filter(h => (h.change_1d ?? 0) > 0).length
  const losers = snap.holdings.filter(h => (h.change_1d ?? 0) < 0).length
  const totalUSD = snap.holdings.reduce((s, h) => s + valueUSD(h), 0)
  const top2pct = totalUSD > 0
    ? snap.holdings
        .sort((a, b) => valueUSD(b) - valueUSD(a))
        .slice(0, 2)
        .reduce((s, h) => s + (valueUSD(h) / totalUSD) * 100, 0)
    : 0

  const stats = [
    {
      k: 'Total Value',
      v: `$${fmt(snap.total_value)}`,
      sub: valueDelta !== null ? `was $${fmt(pv!)} · ${valueDelta >= 0 ? '+' : ''}$${fmt(Math.abs(valueDelta))}` : '',
      style: '',
    },
    {
      k: 'Unrealised P&amp;L',
      v: snap.unrealised_pnl !== null ? `${snap.unrealised_pnl >= 0 ? '+' : ''}$${fmt(Math.abs(snap.unrealised_pnl))}` : '—',
      style: pnlColor(snap.unrealised_pnl),
      sub: '',
    },
    ...(snap.realised.length > 0 ? [{
      k: 'Realised P&amp;L',
      v: snap.realised_pnl !== null ? `${snap.realised_pnl >= 0 ? '+' : ''}$${fmt(Math.abs(snap.realised_pnl))}` : '—',
      style: pnlColor(snap.realised_pnl),
      sub: '',
    }] : []),
    {
      k: 'Cash · Pending',
      v: snap.cash !== null ? `$${fmt(snap.cash)}` : '—',
      sub: snap.pending !== null ? `pending $${fmt(snap.pending)}` : '',
      style: '',
    },
    {
      k: 'Gainers / Losers',
      v: `${gainers} / ${losers}`,
      sub: top2pct > 0 ? `top 2 = ${top2pct.toFixed(1)}% concentration` : '',
      style: '',
    },
  ]

  return `<div class="summary">${stats.map(s =>
    `<div class="stat"><div class="k">${s.k}</div><div class="v"${s.style ? ` style="${s.style}"` : ''}>${s.v}</div>${s.sub ? `<div class="sub">${esc(s.sub)}</div>` : ''}</div>`
  ).join('')}</div>`
}

function buildAlloc(snap: SnapData): string {
  const sorted = [...snap.holdings].sort((a, b) => valueUSD(b) - valueUSD(a))
  const totalUSD = sorted.reduce((s, h) => s + valueUSD(h), 0)
  if (totalUSD === 0) return ''

  const segs = sorted.map(h => {
    const col = sectorColor(h.sector)
    const pct = ((valueUSD(h) / totalUSD) * 100).toFixed(2)
    const lbl = esc(`${h.ticker ?? h.name} · ${h.sector ?? ''} · ${pct}%`)
    return `<div class="alloc-seg" style="flex:${valueUSD(h).toFixed(2)};background:${col}" title="${lbl}"></div>`
  }).join('')

  const top1 = sorted[0]
  const top2 = sorted[1]
  const top2pct = sorted.slice(0, 2).reduce((s, h) => s + (valueUSD(h) / totalUSD) * 100, 0)
  const legend = `Width ∝ USD equivalent · ${top1?.ticker ?? ''} ${((valueUSD(top1 ?? sorted[0]) / totalUSD) * 100).toFixed(2)}% (#1)${top2 ? ` · ${top2.ticker ?? ''} ${((valueUSD(top2) / totalUSD) * 100).toFixed(2)}% (#2)` : ''} · top 2 = ${top2pct.toFixed(1)}%`

  return `<section><h2>Allocation</h2><div class="alloc">${segs}</div><div class="alloc-legend">${esc(legend)}</div></section>`
}

function buildDelta(snap: SnapData, prevSnap: SnapData): string {
  const valueDelta = snap.total_value - prevSnap.total_value
  const valuePct = prevSnap.total_value > 0 ? (valueDelta / prevSnap.total_value) * 100 : 0
  const prevLabel = prevSnap.snap_label ?? 'Previous'

  const cells = [
    { k: 'Holdings', v: `${prevSnap.holdings.length} → ${snap.holdings.length}`, sub: '', style: '' },
    { k: 'Open Orders', v: `${prevSnap.orders.length} → ${snap.orders.length}`, sub: '', style: '' },
    {
      k: 'Cash',
      v: snap.cash !== null && prevSnap.cash !== null
        ? `${snap.cash - prevSnap.cash >= 0 ? '+' : ''}$${fmt(Math.abs(snap.cash - prevSnap.cash))}`
        : '—',
      style: snap.cash !== null && prevSnap.cash !== null ? pnlColor(snap.cash - prevSnap.cash) : '',
      sub: '',
    },
    {
      k: 'Net Deposited',
      v: snap.net_deposited !== null ? `${snap.net_deposited >= 0 ? '+' : ''}$${fmt(Math.abs(snap.net_deposited))}` : '—',
      style: pnlColor(snap.net_deposited),
      sub: '',
    },
    {
      k: 'Portfolio Value',
      v: `${valueDelta >= 0 ? '+' : ''}$${fmt(Math.abs(valueDelta))}`,
      style: pnlColor(valueDelta),
      sub: `${fmtPct(valuePct)}`,
    },
  ]

  return `<section><h2>Delta vs ${esc(prevLabel)}</h2>
<div class="delta-grid">${cells.map(c =>
    `<div class="delta"><div class="k">${c.k}</div><div class="v"${c.style ? ` style="${c.style}"` : ''}>${c.v}</div>${c.sub ? `<div class="sub">${c.sub}</div>` : ''}</div>`
  ).join('')}</div></section>`
}

function buildObservations(snap: SnapData): string {
  const obs: Array<{ cls: string; icon: string; title: string; body: string }> = []

  // Top movers by |change_1d|
  const movers = snap.holdings
    .filter(h => h.change_1d !== null)
    .sort((a, b) => Math.abs(b.change_1d!) - Math.abs(a.change_1d!))
    .slice(0, 3)

  for (const h of movers) {
    const dir = (h.change_1d ?? 0) >= 0 ? 'pos' : 'watch'
    const icon = (h.change_1d ?? 0) >= 0 ? '🚀' : '📉'
    obs.push({
      cls: `obs-${dir}`,
      icon,
      title: `${h.ticker ?? h.name} ${fmtPct(h.change_1d!)} · ${symFor(h.currency)}${fmt(h.value)} position`,
      body: h.pnl !== null
        ? `Unrealised P&amp;L: ${h.pnl >= 0 ? '+' : ''}${symFor(h.currency)}${fmt(Math.abs(h.pnl))}. Qty: ${h.qty ?? '—'}.`
        : `Market value: ${symFor(h.currency)}${fmt(h.value)}.`,
    })
  }

  // Concentration
  const totalUSD = snap.holdings.reduce((s, h) => s + valueUSD(h), 0)
  if (totalUSD > 0 && snap.holdings.length >= 2) {
    const sorted = [...snap.holdings].sort((a, b) => valueUSD(b) - valueUSD(a))
    const top2pct = sorted.slice(0, 2).reduce((s, h) => s + (valueUSD(h) / totalUSD) * 100, 0)
    if (top2pct > 30) {
      obs.push({
        cls: 'obs-watch',
        icon: '⚠️',
        title: `Top 2 positions = ${top2pct.toFixed(1)}% of portfolio`,
        body: `${sorted[0].ticker ?? sorted[0].name} and ${sorted[1].ticker ?? sorted[1].name} are concentrated. Consider reviewing position sizing.`,
      })
    }
  }

  // Cash warning
  if (snap.cash !== null && snap.cash < 100) {
    obs.push({
      cls: 'obs-note',
      icon: '💵',
      title: `Cash low — ${symFor('USD')}${fmt(snap.cash)}`,
      body: `Less than $100 cash available. ${snap.pending !== null ? `Pending: $${fmt(snap.pending)}.` : ''}`,
    })
  }

  if (obs.length === 0) return ''
  return `<section><h2>Key Observations</h2><div class="obs-grid">${obs.map(o =>
    `<div class="obs ${o.cls}"><div class="obs-head"><span class="obs-icon">${o.icon}</span><span class="obs-title">${esc(o.title)}</span></div><div class="obs-body">${o.body}</div></div>`
  ).join('')}</div></section>`
}

function buildHoldings(snap: SnapData): string {
  const sorted = [...snap.holdings].sort((a, b) => valueUSD(b) - valueUSD(a))
  const totalUSD = sorted.reduce((s, h) => s + valueUSD(h), 0)

  const rows = sorted.map(h => {
    const sc = sectorColor(h.sector)
    const gc = geoColor(h.geo)
    const geoStyle = `background:${gc}20;color:${gc}`
    const sym = symFor(h.currency)
    const weightPct = totalUSD > 0 ? (valueUSD(h) / totalUSD) * 100 : 0
    const barW = Math.min(weightPct / 0.285, 100).toFixed(2) // scale: ~28.5% → 100%

    return `<tr>
<td><span class="sec-dot" style="background:${sc}"></span><strong>${esc(h.ticker ?? h.name)}</strong> <span class="geo-badge" style="${geoStyle}">${esc(h.geo ?? '')}</span></td>
<td class="mono">${sym}${h.price !== null ? fmt(h.price) : '—'}</td>
<td class="mono"${h.change_1d !== null ? ` style="${pnlColor(h.change_1d)}"` : ''}>${h.change_1d !== null ? fmtPct(h.change_1d) : '—'}</td>
<td class="mono">${sym}${fmt(h.value)}</td>
<td class="mono"${h.pnl !== null ? ` style="${pnlColor(h.pnl)}"` : ''}>${h.pnl !== null ? `${h.pnl >= 0 ? '+' : ''}${sym}${fmt(Math.abs(h.pnl))}` : '—'}</td>
<td class="mono">${h.qty !== null ? h.qty : '—'}</td>
<td><div class="weight-bar"><div class="weight-fill" style="width:${barW}%;background:${sc}"></div></div><span class="mono weight-pct">${weightPct.toFixed(2)}%</span></td>
</tr>`
  }).join('')

  return `<section><h2>Holdings · ${snap.holdings.length} positions</h2>
<table class="holdings"><thead><tr><th>Ticker</th><th>Price</th><th>1D %</th><th>Value</th><th>URZ P&amp;L</th><th>Qty</th><th>Weight</th></tr></thead><tbody>
${rows}
</tbody></table></section>`
}

function buildOrders(snap: SnapData): string {
  if (snap.orders.length === 0) return ''

  const postSnap = snap.orders.filter(o => o.new_flag === 1)
  const atSnap = snap.orders.filter(o => o.new_flag === 0)

  function orderRow(o: OrderRow, isPostSnap: boolean): string {
    const sym = symFor(o.currency)
    const bg = isPostSnap ? ' style="background:rgba(61,214,140,0.05)"' : ''
    const badge = isPostSnap
      ? '<span class="new-badge">POST-SNAP</span>'
      : (o.note?.includes('NEW') ? '<span class="new-badge">NEW</span>' : '')
    return `<tr${bg}><td><strong>${esc(o.ticker)}</strong>${badge}</td><td><span class="order-type">${esc(o.type)}</span></td><td class="mono">${sym}${fmt(o.price)}</td><td class="mono">${o.qty}</td><td class="mono muted">${esc(o.placed ?? '')}</td><td class="muted" style="font-size:11px">${esc(o.note ?? '')}</td></tr>`
  }

  const postSnapRows = postSnap.map(o => orderRow(o, true)).join('')
  const separator = atSnap.length > 0
    ? `<tr><td colspan="6" style="padding:4px 8px;font-size:10px;color:var(--mid);letter-spacing:1px;text-transform:uppercase">— AT SNAP · ${atSnap.length} orders —</td></tr>`
    : ''
  const atSnapRows = atSnap.map(o => orderRow(o, false)).join('')

  const totalCount = snap.orders.length
  const postSnapNote = postSnap.length > 0 ? ` (${postSnap.length} placed post-snap)` : ''

  return `<section><h2>Open Orders · ${totalCount} pending${postSnapNote}</h2>
<table class="orders"><thead><tr><th>Ticker</th><th>Type</th><th>Price</th><th>Qty</th><th>Placed</th><th>Note</th></tr></thead><tbody>
${postSnapRows}${separator}${atSnapRows}
</tbody></table></section>`
}

function buildRealised(snap: SnapData): string {
  if (snap.realised.length === 0) return ''
  const total = snap.realised.reduce((s, r) => s + r.value, 0)
  const chips = snap.realised.map(r => {
    const cls = r.value >= 0 ? 'gain' : 'loss'
    return `<div class="r-chip ${cls}">${esc(r.key)}: ${r.value >= 0 ? '+' : ''}$${fmt(Math.abs(r.value))}</div>`
  }).join('')
  return `<section><h2>Realised P&amp;L · ${total >= 0 ? '+' : ''}$${fmt(Math.abs(total))} cumulative</h2>
<div class="realised">${chips}</div></section>`
}

function buildRiskFlags(snap: SnapData): string {
  const flags: Array<{ cls: string; level: string; levelCls: string; title: string; desc: string }> = []

  // Holdings without any sell order
  const sellOrderTickers = new Set(snap.orders.filter(o => o.type.includes('SELL')).map(o => o.ticker))
  const noExit = snap.holdings.filter(h => {
    const hasSellLimit = h.sell_limit !== null
    const hasSellOrder = h.ticker ? sellOrderTickers.has(h.ticker) : false
    return !hasSellLimit && !hasSellOrder
  })
  if (noExit.length > 0) {
    flags.push({
      cls: 'yellow', level: 'WATCH', levelCls: 'yellow',
      title: `${noExit.length} holding${noExit.length > 1 ? 's' : ''} without exit orders`,
      desc: `No sell limit or sell order: ${noExit.map(h => h.ticker ?? h.name).join(', ')}.`,
    })
  }

  // Top-2 concentration > 30%
  const totalUSD = snap.holdings.reduce((s, h) => s + valueUSD(h), 0)
  if (totalUSD > 0 && snap.holdings.length >= 2) {
    const sorted = [...snap.holdings].sort((a, b) => valueUSD(b) - valueUSD(a))
    const top2pct = sorted.slice(0, 2).reduce((s, h) => s + (valueUSD(h) / totalUSD) * 100, 0)
    if (top2pct > 30) {
      flags.push({
        cls: 'yellow', level: 'WATCH', levelCls: 'yellow',
        title: `Top-2 concentration ${top2pct.toFixed(1)}%`,
        desc: `${sorted[0].ticker ?? sorted[0].name} (${((valueUSD(sorted[0]) / totalUSD) * 100).toFixed(1)}%) and ${sorted[1].ticker ?? sorted[1].name} (${((valueUSD(sorted[1]) / totalUSD) * 100).toFixed(1)}%) are heavily weighted.`,
      })
    }
  }

  // Cash < $100
  if (snap.cash !== null && snap.cash < 100) {
    flags.push({
      cls: 'slate', level: 'INFO', levelCls: 'slate',
      title: 'Cash nearly zero · dry powder thin',
      desc: `Cash $${fmt(snap.cash)}${snap.pending !== null ? `, pending $${fmt(snap.pending)}` : ''}. Limited buffer for new positions.`,
    })
  }

  if (flags.length === 0) return ''
  return `<section><h2>Risk Flags</h2>${flags.map(f =>
    `<div class="risk-flag ${f.cls}"><span class="risk-level ${f.levelCls}">${f.level}</span><div class="risk-body"><div class="risk-title">${esc(f.title)}</div><div class="risk-desc">${esc(f.desc)}</div></div></div>`
  ).join('')}</section>`
}

function buildJsonBlock(snap: SnapData): string {
  const data = {
    snapshot_id: snap.id,
    snap_label: snap.snap_label,
    snapshot_date: snap.snapshot_date,
    total_value: snap.total_value,
    unrealised_pnl: snap.unrealised_pnl,
    realised_pnl: snap.realised_pnl,
    cash: snap.cash,
    holdings_count: snap.holdings.length,
    generated_at: new Date().toISOString(),
  }
  return `<script type="application/json" id="portfolio-data">\n${JSON.stringify(data, null, 2)}\n</script>`
}

export function generateHtmlReport(
  snap: SnapData,
  prevSnap: SnapData | null,
  allSnaps: SnapSummary[],
): string {
  const label = snap.snap_label ?? snap.snapshot_date.slice(0, 10)
  const date = snap.snapshot_date.slice(0, 10)

  const sections = [
    buildMasthead(snap),
    buildPills(snap, allSnaps),
    buildSummary(snap, prevSnap),
    buildAlloc(snap),
    prevSnap ? buildDelta(snap, prevSnap) : '',
    buildObservations(snap),
    snap.holdings.length > 0 ? buildHoldings(snap) : '',
    buildOrders(snap),
    buildRealised(snap),
    buildRiskFlags(snap),
  ].filter(Boolean).join('\n')

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Portfolio Report · ${esc(label)} · ${date}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Sora:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${CSS}</style></head><body>
${sections}
${buildJsonBlock(snap)}
<footer>Indicative only · prices as of market data at snapshot time · USD equivalents use approximate FX (SGD/USD ~0.74, GBP/USD ~1.29) · not financial advice.</footer>
</body></html>`
}
