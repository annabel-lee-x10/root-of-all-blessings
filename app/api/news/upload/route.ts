import { NextRequest } from 'next/server'

const MAX_SIZE = 5 * 1024 * 1024 // 5 MB

// Known tickers from the QS Daily Brief reference table
const KNOWN_TICKERS = new Set([
  'MU', 'NVDA', 'INTC', 'GOOG', 'AAPL', 'AMD',
  'ABBV', 'NEE', 'RING', 'CMCL', 'COPX',
  'AGIX', 'FXI', 'ICLN', 'QQQ', 'VCX', 'BSTZ',
  'D05', 'WISE', 'NFLX', 'SLB', 'PG', 'KO', 'BUD', 'MNST', 'ULVR',
  'Z74', 'MOO', 'DD',
])

// Order labels appended to tickers in the portfolio HTML
const ORDER_LABELS = /\b(SELL|BUY|DIV|AMENDED|ADD)\b/g

export async function POST(request: NextRequest) {
  const contentType = request.headers.get('content-type') ?? ''
  if (!contentType.includes('multipart/form-data')) {
    return Response.json({ error: 'multipart/form-data required' }, { status: 400 })
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return Response.json({ error: 'invalid form data' }, { status: 400 })
  }

  const file = formData.get('file')
  if (!(file instanceof File)) {
    return Response.json({ error: 'file field is required' }, { status: 400 })
  }

  const name = file.name.toLowerCase()
  const isHtml = name.endsWith('.html') || name.endsWith('.htm') || file.type === 'text/html'
  if (!isHtml) {
    return Response.json({ error: 'file must be an HTML (.html or .htm) file' }, { status: 400 })
  }

  if (file.size > MAX_SIZE) {
    return Response.json({ error: 'file must be under 5 MB' }, { status: 413 })
  }

  const html = await file.text()
  const tickers = extractTickers(html)

  return Response.json({ tickers })
}

function extractTickers(html: string): string[] {
  const found = new Set<string>()

  // Match text content of <td> elements
  const tdPattern = /<td[^>]*>([\s\S]*?)<\/td>/gi
  let match: RegExpExecArray | null

  while ((match = tdPattern.exec(html)) !== null) {
    // Strip inner tags, decode basic entities
    const raw = match[1]
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ')
      .trim()

    // Remove order labels like SELL, DIV, AMENDED
    const cleaned = raw.replace(ORDER_LABELS, '').trim()

    // Accept 1-6 uppercase letters, optional digits, optional dot (e.g. D05, Z74)
    const ticker = cleaned.match(/^([A-Z][A-Z0-9.]{0,5})$/)?.[1]
    if (ticker) found.add(ticker)
  }

  // Known tickers first, then unknown
  const known = [...found].filter(t => KNOWN_TICKERS.has(t))
  const unknown = [...found].filter(t => !KNOWN_TICKERS.has(t))
  return [...known, ...unknown]
}
