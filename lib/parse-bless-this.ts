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
  account?: string
  notes?: string
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
        // Ignored for now - account field is more useful
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
    }
  }

  return result
}

function normaliseDate(raw: string): string {
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw

  // DD/MM/YYYY
  const dmy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`

  // MM/DD/YYYY - ambiguous but common in US locale; we accept it the same way
  const mdy = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/)
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2, '0')}-${mdy[2].padStart(2, '0')}`

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
