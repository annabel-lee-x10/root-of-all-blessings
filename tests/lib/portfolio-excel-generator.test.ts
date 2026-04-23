// @vitest-environment node
import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { generateExcel } from '@/lib/portfolio/excel-generator'
import type { ExcelSnapData } from '@/lib/portfolio/excel-generator'

const SNAPS: ExcelSnapData[] = [
  {
    id: 's1',
    snapshot_date: '2026-04-23T00:00:00.000Z',
    snap_label: 'Snap 29',
    snap_time: '04:34 SGT',
    total_value: 15000,
    unrealised_pnl: 500,
    realised_pnl: 480,
    cash: 40,
    pending: 6,
    holdings: [
      { ticker: 'MU', name: 'Micron Technology', geo: 'US', sector: 'Technology',
        currency: 'USD', price: 487, change_1d: 8.48, value: 2437, pnl: 751, qty: 5 },
      { ticker: 'V', name: 'Visa Inc', geo: 'US', sector: 'Financials',
        currency: 'USD', price: 311, change_1d: 0.44, value: 2179, pnl: -4, qty: 7 },
    ],
  },
  {
    id: 's0',
    snapshot_date: '2026-04-22T00:00:00.000Z',
    snap_label: 'Snap 28',
    snap_time: '03:00 SGT',
    total_value: 14369,
    unrealised_pnl: 411,
    realised_pnl: 469,
    cash: 224,
    pending: 0,
    holdings: [
      { ticker: 'MU', name: 'Micron Technology', geo: 'US', sector: 'Technology',
        currency: 'USD', price: 449, change_1d: -0.5, value: 2248, pnl: 560, qty: 5 },
    ],
  },
]

describe('generateExcel', () => {
  it('returns a Buffer', () => {
    const buf = generateExcel(SNAPS)
    expect(Buffer.isBuffer(buf)).toBe(true)
    expect(buf.length).toBeGreaterThan(0)
  })

  it('is parseable as a valid xlsx workbook', () => {
    const buf = generateExcel(SNAPS)
    const wb = XLSX.read(buf, { type: 'buffer' })
    expect(wb.SheetNames.length).toBeGreaterThan(0)
  })

  it('contains Holdings History sheet', () => {
    const wb = XLSX.read(generateExcel(SNAPS), { type: 'buffer' })
    expect(wb.SheetNames).toContain('Holdings History')
  })

  it('contains Returns sheet', () => {
    const wb = XLSX.read(generateExcel(SNAPS), { type: 'buffer' })
    expect(wb.SheetNames).toContain('Returns')
  })

  it('contains a Snap N Summary sheet for each snapshot', () => {
    const wb = XLSX.read(generateExcel(SNAPS), { type: 'buffer' })
    expect(wb.SheetNames).toContain('Snap 29 Summary')
    expect(wb.SheetNames).toContain('Snap 28 Summary')
  })

  it('contains Notes sheet', () => {
    const wb = XLSX.read(generateExcel(SNAPS), { type: 'buffer' })
    expect(wb.SheetNames).toContain('Notes')
  })

  it('Holdings History has correct column headers', () => {
    const wb = XLSX.read(generateExcel(SNAPS), { type: 'buffer' })
    const ws = wb.Sheets['Holdings History']
    const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 })
    const headers = rows[0] as string[]
    expect(headers).toContain('ticker')
    expect(headers).toContain('name')
    expect(headers).toContain('snapshot_sgt')
    expect(headers).toContain('geo')
    expect(headers).toContain('sector')
    expect(headers).toContain('value')
    expect(headers).toContain('unrealised_pnl')
  })

  it('Holdings History has one row per ticker per snapshot', () => {
    const wb = XLSX.read(generateExcel(SNAPS), { type: 'buffer' })
    const ws = wb.Sheets['Holdings History']
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws)
    // SNAPS[0] has 2 holdings, SNAPS[1] has 1 → 3 total data rows
    expect(rows.length).toBe(3)
  })

  it('Returns sheet has one row per snapshot', () => {
    const wb = XLSX.read(generateExcel(SNAPS), { type: 'buffer' })
    const ws = wb.Sheets['Returns']
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws)
    expect(rows.length).toBe(2)
  })
})
