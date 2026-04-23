// lib/portfolio/excel-generator.ts
import * as XLSX from 'xlsx'

export interface ExcelHoldingRow {
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
}

export interface ExcelSnapData {
  id: string
  snapshot_date: string
  snap_label: string | null
  snap_time: string | null
  total_value: number
  unrealised_pnl: number | null
  realised_pnl: number | null
  cash: number | null
  pending: number | null
  holdings: ExcelHoldingRow[]
}

const EXCHANGE_INFO: Record<string, { listing_exchange: string; tz: string; offset: number }> = {
  US: { listing_exchange: 'NYSE/NASDAQ', tz: 'EDT', offset: -4 },
  SG: { listing_exchange: 'SGX', tz: 'SGT', offset: 8 },
  UK: { listing_exchange: 'LSE', tz: 'BST', offset: 1 },
  HK: { listing_exchange: 'HKEX', tz: 'HKT', offset: 8 },
}

function sgtLabel(isoDate: string): string {
  const d = new Date(isoDate)
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Singapore',
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d) + ' SGT'
}

function exchangeLocalDt(isoDate: string, geo: string | null): string {
  const info = EXCHANGE_INFO[geo ?? 'US'] ?? EXCHANGE_INFO['US']
  const d = new Date(isoDate)
  const tz = geo === 'US' ? 'America/New_York'
    : geo === 'SG' ? 'Asia/Singapore'
    : geo === 'UK' ? 'Europe/London'
    : geo === 'HK' ? 'Asia/Hong_Kong'
    : 'America/New_York'
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d) + ' ' + info.tz
}

function snapSheetName(snap: ExcelSnapData): string {
  const base = snap.snap_label ?? snap.snapshot_date.slice(0, 10)
  return (base + ' Summary').slice(0, 31)
}

export function generateExcel(snapshots: ExcelSnapData[]): Buffer {
  const wb = XLSX.utils.book_new()

  // ── Holdings History sheet ────────────────────────────────────────────────
  const histHeaders = [
    'snapshot_sgt', 'exchange_local_dt', 'exchange_local_tz', 'market_status',
    'ticker', 'name', 'listing_exchange', 'geo', 'sector', 'currency',
    'price', 'change_1d_pct', 'value', 'unrealised_pnl', 'qty', 'notes',
  ]
  const histRows: unknown[][] = []
  for (const snap of snapshots) {
    const sgt = sgtLabel(snap.snapshot_date)
    for (const h of snap.holdings) {
      const info = EXCHANGE_INFO[h.geo ?? 'US'] ?? EXCHANGE_INFO['US']
      histRows.push([
        sgt,
        exchangeLocalDt(snap.snapshot_date, h.geo),
        info.tz,
        'CLOSED',
        h.ticker ?? '',
        h.name,
        info.listing_exchange,
        h.geo ?? '',
        h.sector ?? '',
        h.currency ?? 'USD',
        h.price,
        h.change_1d,
        h.value,
        h.pnl,
        h.qty,
        snap.snap_label ?? '',
      ])
    }
  }
  const histWs = XLSX.utils.aoa_to_sheet([histHeaders, ...histRows])
  XLSX.utils.book_append_sheet(wb, histWs, 'Holdings History')

  // ── Returns sheet ─────────────────────────────────────────────────────────
  const retHeaders = ['snap', 'date_sgt', 'total_value', 'value_change', 'unrealised_pnl', 'realised_pnl', 'cash', 'holdings_count']
  const retRows = snapshots.map((snap, i) => {
    const prev = snapshots[i + 1]
    const change = prev ? snap.total_value - prev.total_value : null
    return [
      snap.snap_label ?? snap.snapshot_date.slice(0, 10),
      sgtLabel(snap.snapshot_date),
      snap.total_value,
      change,
      snap.unrealised_pnl,
      snap.realised_pnl,
      snap.cash,
      snap.holdings.length,
    ]
  })
  const retWs = XLSX.utils.aoa_to_sheet([retHeaders, ...retRows])
  XLSX.utils.book_append_sheet(wb, retWs, 'Returns')

  // ── Snap N Summary sheets (one per snapshot) ───────────────────────────────
  for (const snap of snapshots) {
    const rows = [
      ['Field', 'Value'],
      ['Snap Label', snap.snap_label ?? ''],
      ['Snapshot Date (SGT)', sgtLabel(snap.snapshot_date)],
      ['Snap Time', snap.snap_time ?? ''],
      ['Total Value', snap.total_value],
      ['Unrealised P&L', snap.unrealised_pnl],
      ['Realised P&L', snap.realised_pnl],
      ['Cash', snap.cash],
      ['Pending', snap.pending],
      ['Holdings Count', snap.holdings.length],
    ]
    const ws = XLSX.utils.aoa_to_sheet(rows)
    XLSX.utils.book_append_sheet(wb, ws, snapSheetName(snap))
  }

  // ── Notes sheet ───────────────────────────────────────────────────────────
  const notesWs = XLSX.utils.aoa_to_sheet([
    ['Note', 'Detail'],
    ['FX rates', 'SGD/USD ~0.74, GBP/USD ~1.29 (approximate)'],
    ['Market status', 'All market_status values are conservative defaults (CLOSED). Actual status depends on snap time vs exchange hours.'],
    ['Methodology', 'Holdings values are as-reported by Syfe app at snapshot time. USD equivalents use approximate FX.'],
    ['Generated', new Date().toISOString()],
  ])
  XLSX.utils.book_append_sheet(wb, notesWs, 'Notes')

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}
