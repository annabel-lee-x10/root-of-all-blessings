import { NextRequest } from 'next/server'
import { fetchExportData, toCsvString, toXlsxBuffer } from '@/lib/export'
import type { ExportFilters, TxType } from '@/lib/types'

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams
  const format = p.get('format') ?? 'csv'

  const filters: ExportFilters = {
    start: p.get('start') ?? undefined,
    end: p.get('end') ?? undefined,
    account_id: p.get('account_id') ?? undefined,
    category_id: p.get('category_id') ?? undefined,
    type: (p.get('type') as TxType) ?? undefined,
    tag_id: p.get('tag_id') ?? undefined,
  }

  const rows = await fetchExportData(filters)

  const dateTag = new Date().toISOString().slice(0, 10)
  const filename = `transactions-${dateTag}`

  if (format === 'xlsx') {
    const buffer = await toXlsxBuffer(rows)
    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}.xlsx"`,
      },
    })
  }

  const csv = toCsvString(rows)
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}.csv"`,
    },
  })
}
