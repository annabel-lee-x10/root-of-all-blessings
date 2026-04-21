/**
 * Parser for the "bless this" skill output format.
 *
 * Expected input (any subset of fields, any order):
 *
 *   Amount: 23.50
 *   Currency: SGD
 *   Merchant/Payee: NTUC FairPrice
 *   Date: 2026-04-18
 *   Time: 14:32
 *   Category: Food
 *   Tags: groceries, weekly
 *   Payment Method: credit card
 *   Account: 6674
 *   Notes: weekly groceries run
 */

export interface BlessThisData {
  amount?: number
  currency?: string
  payee?: string
  date?: string   // YYYY-MM-DD
  time?: string   // HH:MM
  category?: string
  tags?: string[]
  payment_method?: string
  account?: string
  notes?: string
  type?: 'expense' | 'income' | 'transfer'
}

export function parseBlessThis(text: string): BlessThisData {
  const result: BlessThisData = {}
  if (!text || !text.trim()) return result

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue

    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue

    const key = line.slice(0, colonIdx).trim().toLowerCase()
    const value = line.slice(colonIdx + 1).trim()
    if (!value) continue

    switch (key) {
      case 'amount': {
        // Strip currency symbols, commas, spaces - keep digits and dot
        const clean = value.replace(/[^0-9.]/g, '')
        const n = parseFloat(clean)
        if (!isNaN(n) && n > 0) result.amount = n
        break
      }
      case 'currency':
        result.currency = value.toUpperCase().slice(0, 3)
        break
      case 'merchant/payee':
      case 'merchant':
      case 'payee':
      case 'vendor':
        result.payee = value
        break
      case 'date':
        // Accept YYYY-MM-DD or DD/MM/YYYY or MM/DD/YYYY
        result.date = normaliseDate(value)
        break
      case 'time':
        // Accept HH:MM or HHMM
        result.time = normaliseTime(value)
        break
      case 'category':
        result.category = value
        break
      case 'tags':
      case 'tag':
        result.tags = value
          .split(/[,;]/)
          .map(t => t.trim())
          .filter(Boolean)
        break
      case 'payment method':
      case 'payment':
        result.payment_method = value
        break
      case 'account':
        result.account = value
        break
      case 'notes':
      case 'note':
      case 'description':
      case 'memo':
        result.notes = value
        break
      case 'type':
      case 'transaction type': {
        const v = value.toLowerCase()
        if (v === 'income' || v === 'expense' || v === 'transfer') {
          result.type = v
        }
        break
      }
    }
  }

  // Infer type from context if not explicitly set
  if (!result.type) {
    result.type = inferType(result)
  }

  return result
}

const INCOME_KEYWORDS = /\b(sold|sale|resale|repayment|refund|rebate|cashback|reimbursement|payout|dividend|salary|bonus|freelance|commission|rental income|interest earned)\b/i

function inferType(data: BlessThisData): 'expense' | 'income' | undefined {
  // Check tags
  if (data.tags?.some((t) => INCOME_KEYWORDS.test(t))) return 'income'
  // Check notes
  if (data.notes && INCOME_KEYWORDS.test(data.notes)) return 'income'
  // Check payee context - "sold to X" pattern
  if (data.payee && /\bsold\b/i.test(data.payee)) return 'income'
  // Check category
  if (data.category && INCOME_KEYWORDS.test(data.category)) return 'income'
  return undefined
}

const MONTH_NAMES = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec']

function normaliseDate(raw: string): string {
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw

  // DD/MM/YYYY or D/M/YYYY
  const dmy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`

  // DD/MM/YY short year (e.g. 21/04/26)
  const dmyShort = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/)
  if (dmyShort) {
    const yr = 2000 + parseInt(dmyShort[3])
    return `${yr}-${dmyShort[2].padStart(2, '0')}-${dmyShort[1].padStart(2, '0')}`
  }

  // DD.MM.YYYY (dot separator)
  const dot = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (dot) return `${dot[3]}-${dot[2].padStart(2, '0')}-${dot[1].padStart(2, '0')}`

  // DD-MM-YYYY (dash with 4-digit year, treat as day-first to match SG locale)
  const dash = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/)
  if (dash) return `${dash[3]}-${dash[2].padStart(2, '0')}-${dash[1].padStart(2, '0')}`

  // "D Mon YYYY" or "D Month YYYY" (e.g. "21 Apr 2026", "21 April 2026")
  const dMonY = raw.match(/^(\d{1,2})\s+([a-zA-Z]+)\s+(\d{4})$/)
  if (dMonY) {
    const m = MONTH_NAMES.indexOf(dMonY[2].toLowerCase().slice(0, 3)) + 1
    if (m > 0) return `${dMonY[3]}-${String(m).padStart(2, '0')}-${dMonY[1].padStart(2, '0')}`
  }

  // "Mon D, YYYY" or "Month D, YYYY" (e.g. "Apr 21, 2026", "April 21, 2026")
  const monDY = raw.match(/^([a-zA-Z]+)\s+(\d{1,2}),?\s+(\d{4})$/)
  if (monDY) {
    const m = MONTH_NAMES.indexOf(monDY[1].toLowerCase().slice(0, 3)) + 1
    if (m > 0) return `${monDY[3]}-${String(m).padStart(2, '0')}-${monDY[2].padStart(2, '0')}`
  }

  // YYYYMMDD
  if (/^\d{8}$/.test(raw)) {
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
  }

  return raw
}

function normaliseTime(raw: string): string {
  // Already HH:MM or H:MM
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(raw)) {
    const [h, m] = raw.split(':')
    return `${h.padStart(2, '0')}:${m}`
  }
  // HHMM
  if (/^\d{4}$/.test(raw)) {
    return `${raw.slice(0, 2)}:${raw.slice(2, 4)}`
  }
  // H:MM AM/PM
  const ampm = raw.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i)
  if (ampm) {
    let h = parseInt(ampm[1])
    const m = ampm[2]
    if (ampm[3].toLowerCase() === 'pm' && h < 12) h += 12
    if (ampm[3].toLowerCase() === 'am' && h === 12) h = 0
    return `${String(h).padStart(2, '0')}:${m}`
  }
  return raw
}
