const OCR_PROMPT = `You are extracting portfolio data from the Syfe brokerage app (Singapore).

Before extracting, identify the screen type:
- Holdings tab (ACCEPTABLE): shows ticker, price, 1-day change %, market value, unrealised P&L, and quantity per holding. This is the default "Portfolio - Holdings" tab in the Syfe app. Each row has a geo badge (US/SG/UK/HK) next to the ticker.
- P&L only view (NOT ACCEPTABLE for full extraction): shows only unrealised P&L and 1D% per holding — no price, no value, no quantity. Return type "holdings" with an empty holdings array.
- Open Orders screen: extract as type "orders".
- Summary / Overview screen: extract as type "summary".
- Individual stock detail page: extract as type "stock_detail".

For each image, return a JSON object:
{
  "type": "holdings" | "stock_detail" | "summary" | "orders",
  "data": { ... }
}

For "holdings": { "holdings": [{ "ticker": "MU", "name": "Micron Technology", "geo": "US", "currency": "USD", "price": 487.48, "change_1d": 8.48, "value": 2437.40, "pnl": 751.40, "qty": 5 }] }
- geo: the badge next to the ticker (US / SG / UK / HK)
- currency: USD for US and HK stocks, SGD for SG stocks, GBP for UK stocks
- pnl: unrealised P&L in the holding's original currency
- If an UPCOMING DIVIDENDS banner is visible for a holding, add: "dividend": { "amount": 0.14, "ex_date": "17 Apr 2026" }

For "summary": { "total_value": 15197.08, "unrealised_pnl": 640.56, "realised_pnl": 469.50, "cash": 224.63, "pending": 0 }

For "orders": { "orders": [{ "ticker": "NFLX", "type": "BUY LIMIT", "price": 94.65, "qty": 2, "currency": "USD", "geo": "US" }] }

For "stock_detail": { "ticker": "MU", "day_high": 490.00, "day_low": 480.00, "prev_close": 479.00, "avg_cost": 337.20 }

Rules:
- Extract numbers exactly as displayed. Never round or convert currencies.
- USD for US and HK stocks, SGD for SG stocks, GBP for UK stocks.
- If any value is obscured or unclear, use "~APPROX". Never silently guess.
- Return a JSON array (one object per image). No markdown fences, no explanation — pure JSON only.`

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

  console.log('[portfolio-ocr] raw length:', raw.length, 'first 200:', raw.slice(0, 200))

  let text = raw.trim()
  // Strip markdown code fences (```json ... ``` or ``` ... ```)
  const fenceMatch = text.match(/^```(?:json)?\n?([\s\S]*?)\n?```$/)
  if (fenceMatch) text = fenceMatch[1].trim()

  try {
    const parsed = JSON.parse(text)
    if (!Array.isArray(parsed)) return []
    return parsed as OcrResult[]
  } catch (err) {
    console.error('[portfolio-ocr] JSON parse failed. Raw text:', text.slice(0, 500))
    return []
  }
}
