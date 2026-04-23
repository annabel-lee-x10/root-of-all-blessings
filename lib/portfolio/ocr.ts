const OCR_PROMPT = `You are a portfolio data extractor. For each image, identify what type of Syfe app screenshot it is and extract all visible data as structured JSON.

Return an array of objects, one per image:
{
  "type": "holdings" | "stock_detail" | "summary" | "orders" | "transactions",
  "data": { ... type-specific fields ... }
}

For holdings: extract an array under "holdings" key, each with fields: ticker, name, geo, price, change_1d, value, pnl, qty.
For stock_detail: extract ticker, day_high, day_low, prev_close, avg_cost, qty.
For summary: extract total_value, unrealised_pnl, realised_pnl, cash, pending.
For orders: extract an array under "orders" key, each with: ticker, type, price, qty, placed_date.
For transactions: extract an array under "transactions" key, each with: type, ticker, amount, currency, date.

Flag any obscured or unclear values with "~APPROX".
Return only valid JSON — no markdown, no explanation.`

export interface OcrImage {
  base64: string
  mediaType: string
}

export type OcrScreenshotType = 'holdings' | 'stock_detail' | 'summary' | 'orders' | 'transactions'

export interface OcrResult {
  type: OcrScreenshotType
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>
}

type ContentBlock =
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
  | { type: 'text'; text: string }

export function buildOcrMessages(images: OcrImage[]): Array<{ role: string; content: ContentBlock[] }> {
  const content: ContentBlock[] = [
    ...images.map(
      (img): ContentBlock => ({
        type: 'image',
        source: { type: 'base64', media_type: img.mediaType, data: img.base64 },
      })
    ),
    { type: 'text', text: OCR_PROMPT },
  ]
  return [{ role: 'user', content }]
}

export function parseOcrResponse(raw: string): OcrResult[] {
  if (!raw) return []

  let text = raw.trim()
  // Strip markdown code fences (```json ... ``` or ``` ... ```)
  const fenceMatch = text.match(/^```(?:json)?\n?([\s\S]*?)\n?```$/)
  if (fenceMatch) text = fenceMatch[1].trim()

  try {
    const parsed = JSON.parse(text)
    if (!Array.isArray(parsed)) return []
    return parsed as OcrResult[]
  } catch {
    return []
  }
}
