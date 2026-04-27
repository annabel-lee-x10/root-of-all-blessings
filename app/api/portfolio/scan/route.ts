import { NextRequest } from 'next/server'
import { verifySession } from '@/lib/session'
import { db } from '@/lib/db'
import { buildOcrMessages, parseOcrResponse, type OcrResult } from '@/lib/portfolio/ocr'
import { resolveTickerMeta } from '@/lib/portfolio/ticker-meta'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'

export const maxDuration = 60

function todaySgtBounds(): { start: string; end: string } {
  const sgtDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore' }).format(new Date())
  const start = new Date(`${sgtDate}T00:00:00+08:00`).toISOString()
  const nextDay = new Date(`${sgtDate}T00:00:00+08:00`)
  nextDay.setDate(nextDay.getDate() + 1)
  return { start, end: nextDay.toISOString() }
}

function sgtLabel(): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Singapore',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).formatToParts(new Date())
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? ''
  return `${get('day')} ${get('month')} ${get('year')}`
}

function sgtTime(): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Singapore',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date()) + ' SGT'
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '~APPROX') return null
  const n = Number(v)
  return isNaN(n) ? null : n
}

type ScanOutcome = { results: OcrResult[] } | { error: string }

async function scanOneImage(
  img: { base64: string; mediaType: string },
  apiKey: string,
): Promise<ScanOutcome> {
  let res: Response
  try {
    res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        messages: buildOcrMessages([img]),
      }),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Network error'
    console.error('[portfolio-scan] fetch error:', msg)
    return { error: msg }
  }

  if (!res.ok) {
    let detail = String(res.status)
    try {
      const errBody = await res.json()
      detail = errBody?.error?.message ?? JSON.stringify(errBody)
    } catch { /* non-JSON error body — keep status code as detail */ }
    console.error('[portfolio-scan] Anthropic error:', detail)
    return { error: detail }
  }

  const data = await res.json()
  const text: string = data.content?.[0]?.text ?? ''
  return { results: parseOcrResponse(text) }
}

export async function POST(request: NextRequest) {
  try {
    const valid = await verifySession()
    if (!valid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return Response.json({ error: 'OCR not configured' }, { status: 503 })

    let formData: FormData
    try {
      formData = await request.formData()
    } catch {
      return Response.json({ error: 'Invalid form data' }, { status: 400 })
    }

    const imageFiles = formData.getAll('images') as File[]
    if (!imageFiles.length) return Response.json({ error: 'No images provided' }, { status: 400 })

    // Convert files to base64
    const images = await Promise.all(
      imageFiles.map(async (file) => ({
        base64: Buffer.from(await file.arrayBuffer()).toString('base64'),
        mediaType: file.type || 'image/jpeg',
      }))
    )

    // One Claude call per image in parallel. Sending all images in a single call can take
    // 15–30s for 5 screenshots, exceeding Vercel's 10s (Hobby) or 15s (Pro) default timeout.
    // Parallel per-image calls each complete in 2–5s, keeping total time within limits.
    const outcomes = await Promise.all(images.map(img => scanOneImage(img, apiKey)))

    const errors = outcomes.filter((o): o is { error: string } => 'error' in o)
    const successes = outcomes.filter((o): o is { results: OcrResult[] } => 'results' in o)

    if (successes.length === 0) {
      const firstError = errors[0]?.error ?? 'No results from any screenshot'
      return Response.json({ error: `OCR failed: ${firstError}` }, { status: 500 })
    }

    const ocrResults = successes.flatMap(o => o.results)

    // Merge OCR results into one snapshot object
    let totalValue: number | null = null
    let unrealisedPnl: number | null = null
    let realisedPnl: number | null = null
    let cash: number | null = null
    let pending: number | null = null

    const holdings: Array<Record<string, unknown>> = []
    const orders: Array<Record<string, unknown>> = []
    const transactions: Array<Record<string, unknown>> = []
    const stockDetails = new Map<string, Record<string, unknown>>()

    for (const result of ocrResults) {
      if (result.type === 'summary') {
        totalValue = numOrNull(result.data.total_value) ?? totalValue
        unrealisedPnl = numOrNull(result.data.unrealised_pnl) ?? unrealisedPnl
        realisedPnl = numOrNull(result.data.realised_pnl) ?? realisedPnl
        cash = numOrNull(result.data.cash) ?? cash
        pending = numOrNull(result.data.pending) ?? pending
      } else if (result.type === 'holdings' && Array.isArray(result.data.holdings)) {
        holdings.push(...result.data.holdings)
      } else if (result.type === 'orders' && Array.isArray(result.data.orders)) {
        orders.push(...result.data.orders)
      } else if (result.type === 'transactions' && Array.isArray(result.data.transactions)) {
        transactions.push(...result.data.transactions)
      } else if (result.type === 'stock_detail' && result.data.ticker) {
        stockDetails.set(result.data.ticker as string, result.data)
      }
    }

    if (holdings.length === 0 && totalValue === null) {
      return Response.json(
        { error: 'OCR could not extract any holdings from the screenshots. Please upload clear Holdings tab screenshots from the Syfe app.' },
        { status: 422 }
      )
    }

    // Derive total_value from holdings sum if not in summary
    if (totalValue === null && holdings.length > 0) {
      totalValue = holdings.reduce((sum, h) => sum + (numOrNull(h.value) ?? 0), 0)
    }
    totalValue = totalValue ?? 0

    const now = new Date().toISOString()

    // Same-day SGT update logic
    const { start, end } = todaySgtBounds()
    const existing = await db.execute({
      sql: 'SELECT id FROM portfolio_snapshots WHERE snapshot_date >= ? AND snapshot_date < ? ORDER BY created_at DESC LIMIT 1',
      args: [start, end],
    })

    let snapshotId: string
    let updated = false

    if (existing.rows.length > 0) {
      snapshotId = existing.rows[0].id as string
      updated = true

      await db.execute({
        sql: `UPDATE portfolio_snapshots SET
          total_value = ?, unrealised_pnl = ?, realised_pnl = ?,
          cash = ?, pending = ?, source = ?, snap_label = ?, snap_time = ?
          WHERE id = ?`,
        args: [totalValue, unrealisedPnl, realisedPnl, cash, pending,
               'screenshot', sgtLabel(), sgtTime(), snapshotId],
      })

      // Delete old holdings for this snapshot and re-insert
      await db.execute({
        sql: 'DELETE FROM portfolio_holdings WHERE snapshot_id = ?',
        args: [snapshotId],
      })
    } else {
      snapshotId = crypto.randomUUID()
      await db.execute({
        sql: `INSERT INTO portfolio_snapshots
          (id, snapshot_date, total_value, total_pnl, holdings_json, raw_html, created_at,
           snap_label, snap_time, unrealised_pnl, realised_pnl, cash, pending, source)
          VALUES (?,?,?,NULL,'[]','',?,?,?,?,?,?,?,'screenshot')`,
        args: [snapshotId, now, totalValue, now, sgtLabel(), sgtTime(),
               unrealisedPnl, realisedPnl, cash, pending],
      })
    }

    // Insert holdings
    for (const h of holdings) {
      const detail = stockDetails.get(h.ticker as string) ?? {}
      const id = crypto.randomUUID()
      // BUG-065: the OCR prompt does not request a `sector` field, so OCR
      // holdings arrive with sector = undefined. Fall back to the static
      // ticker → sector taxonomy so the Sector tab can bucket holdings
      // instead of dumping them all under "Other".
      const meta = resolveTickerMeta(h.ticker as string | undefined)
      const sector = (h.sector as string | undefined) ?? meta?.sector ?? null
      await db.execute({
        sql: `INSERT INTO portfolio_holdings
          (id, snapshot_id, ticker, name, geo, sector, currency, price, change_1d,
           value, pnl, qty, avg_cost, day_high, day_low, prev_close, created_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        args: [
          id, snapshotId,
          (h.ticker as string) ?? null,
          (h.name as string) ?? 'Unknown',
          (h.geo as string) ?? null,
          sector,
          (h.currency as string) ?? 'USD',
          numOrNull(h.price),
          numOrNull(h.change_1d),
          numOrNull(h.value) ?? 0,
          numOrNull(h.pnl),
          numOrNull(h.qty),
          numOrNull(detail.avg_cost ?? h.avg_cost),
          numOrNull(detail.day_high),
          numOrNull(detail.day_low),
          numOrNull(detail.prev_close),
          now,
        ],
      })
    }

    // Insert transactions
    for (const t of transactions) {
      await db.execute({
        sql: `INSERT INTO portfolio_transactions
          (id, snapshot_id, ticker, type, amount, currency, date, notes, created_at)
          VALUES (?,?,?,?,?,?,?,?,?)`,
        args: [
          crypto.randomUUID(), snapshotId,
          (t.ticker as string) ?? null,
          (t.type as string) ?? 'unknown',
          numOrNull(t.amount),
          (t.currency as string) ?? 'SGD',
          (t.date as string) ?? null,
          (t.notes as string) ?? null,
          now,
        ],
      })
    }

    return Response.json({
      snapshot_id: snapshotId,
      holdings_count: holdings.length,
      transactions_count: transactions.length,
      updated,
    })
  } catch (err) {
    console.error('[portfolio-scan] Unhandled error:', err)
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return Response.json({ error: `Scan error: ${msg}` }, { status: 500 })
  }
}
