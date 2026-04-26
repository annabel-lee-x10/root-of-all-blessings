import { describe, it, expect } from 'vitest'
import { parseBlessThis } from '../lib/parse-bless-this'

const FULL_EXAMPLE = `
Amount: 23.50
Currency: SGD
Merchant/Payee: NTUC FairPrice
Date: 2026-04-18
Time: 14:32
Category: Food
Tags: groceries, weekly
Payment Method: credit card
Account: 6674
Notes: weekly groceries run
`.trim()

// ── Full example ──────────────────────────────────────────────────────────────

describe('parseBlessThis - full example', () => {
  it('parses all fields from the canonical bless-this output', () => {
    const result = parseBlessThis(FULL_EXAMPLE)
    expect(result.amount).toBe(23.5)
    expect(result.currency).toBe('SGD')
    expect(result.payee).toBe('NTUC FairPrice')
    expect(result.date).toBe('2026-04-18')
    expect(result.time).toBe('14:32')
    expect(result.category).toBe('Food')
    expect(result.tags).toEqual(['groceries', 'weekly'])
    expect(result.payment_method).toBe('credit card')
    expect(result.account).toBe('6674')
    expect(result.notes).toBe('weekly groceries run')
  })
})

// ── Amount parsing ────────────────────────────────────────────────────────────

describe('amount parsing', () => {
  it('parses plain decimal', () => {
    expect(parseBlessThis('Amount: 23.50').amount).toBe(23.5)
  })

  it('strips currency symbol prefix', () => {
    expect(parseBlessThis('Amount: $12.00').amount).toBe(12)
    expect(parseBlessThis('Amount: S$5.90').amount).toBe(5.9)
  })

  it('strips commas from thousands', () => {
    expect(parseBlessThis('Amount: 1,234.56').amount).toBe(1234.56)
  })

  it('ignores zero amounts', () => {
    expect(parseBlessThis('Amount: 0').amount).toBeUndefined()
  })

  it('ignores non-numeric amounts', () => {
    expect(parseBlessThis('Amount: n/a').amount).toBeUndefined()
  })
})

// ── Currency ──────────────────────────────────────────────────────────────────

describe('currency parsing', () => {
  it('uppercases currency', () => {
    expect(parseBlessThis('Currency: usd').currency).toBe('USD')
  })

  it('truncates to 3 chars', () => {
    expect(parseBlessThis('Currency: USDC').currency).toBe('USD')
  })

  it('accepts SGD', () => {
    expect(parseBlessThis('Currency: SGD').currency).toBe('SGD')
  })
})

// ── Payee field variations ────────────────────────────────────────────────────

describe('payee field aliases', () => {
  it('parses Merchant/Payee', () => {
    expect(parseBlessThis('Merchant/Payee: Starbucks').payee).toBe('Starbucks')
  })

  it('parses Merchant', () => {
    expect(parseBlessThis('Merchant: 7-Eleven').payee).toBe('7-Eleven')
  })

  it('parses Payee', () => {
    expect(parseBlessThis('Payee: Shell').payee).toBe('Shell')
  })

  it('parses Vendor', () => {
    expect(parseBlessThis('Vendor: Lazada').payee).toBe('Lazada')
  })
})

// ── Date normalisation ────────────────────────────────────────────────────────

describe('date normalisation', () => {
  it('accepts YYYY-MM-DD unchanged', () => {
    expect(parseBlessThis('Date: 2026-04-18').date).toBe('2026-04-18')
  })

  it('converts DD/MM/YYYY', () => {
    expect(parseBlessThis('Date: 18/04/2026').date).toBe('2026-04-18')
  })

  it('converts YYYYMMDD', () => {
    expect(parseBlessThis('Date: 20260418').date).toBe('2026-04-18')
  })

  it('pads single-digit day and month', () => {
    expect(parseBlessThis('Date: 5/4/2026').date).toBe('2026-04-05')
  })

  // BUG-030: formats seen on real receipts that previously fell through as raw strings
  it('converts DD.MM.YYYY (dot separator)', () => {
    expect(parseBlessThis('Date: 18.04.2026').date).toBe('2026-04-18')
  })

  it('converts "D Mon YYYY" text-month format (e.g. 21 Apr 2026)', () => {
    expect(parseBlessThis('Date: 21 Apr 2026').date).toBe('2026-04-21')
  })

  it('converts "D Month YYYY" full-month format (e.g. 21 April 2026)', () => {
    expect(parseBlessThis('Date: 21 April 2026').date).toBe('2026-04-21')
  })

  it('converts "Mon D, YYYY" US text format (e.g. Apr 21, 2026)', () => {
    expect(parseBlessThis('Date: Apr 21, 2026').date).toBe('2026-04-21')
  })

  it('converts "Month D, YYYY" full US text format (e.g. April 21, 2026)', () => {
    expect(parseBlessThis('Date: April 21, 2026').date).toBe('2026-04-21')
  })

  it('converts DD/MM/YY short-year (e.g. 21/04/26)', () => {
    expect(parseBlessThis('Date: 21/04/26').date).toBe('2026-04-21')
  })

  // BUG-030: strip trailing time component so date parses correctly
  it('strips trailing ", HH:MM" from date value (e.g. "21/04/2026, 15:32")', () => {
    expect(parseBlessThis('Date: 21/04/2026, 15:32').date).toBe('2026-04-21')
  })

  it('strips trailing "THH:MM" from date value (e.g. "2026-04-21T14:30")', () => {
    expect(parseBlessThis('Date: 2026-04-21T14:30').date).toBe('2026-04-21')
  })

  it('strips parenthetical annotation from date (e.g. "21 Apr 2026 (Order Date)")', () => {
    expect(parseBlessThis('Date: 21 Apr 2026 (Order Date)').date).toBe('2026-04-21')
  })

  it('parses "Order Date" key alias', () => {
    expect(parseBlessThis('Order Date: 2026-04-21').date).toBe('2026-04-21')
  })

  it('parses "Transaction Date" key alias', () => {
    expect(parseBlessThis('Transaction Date: 21/04/2026').date).toBe('2026-04-21')
  })

  it('parses "Date/Time" key alias', () => {
    expect(parseBlessThis('Date/Time: 2026-04-21').date).toBe('2026-04-21')
  })
})

// ── Time normalisation ────────────────────────────────────────────────────────

describe('time normalisation', () => {
  it('accepts HH:MM unchanged', () => {
    expect(parseBlessThis('Time: 14:32').time).toBe('14:32')
  })

  it('pads single-digit hour', () => {
    expect(parseBlessThis('Time: 9:05').time).toBe('09:05')
  })

  it('converts HHMM', () => {
    expect(parseBlessThis('Time: 1430').time).toBe('14:30')
  })

  it('converts 12-hour PM', () => {
    expect(parseBlessThis('Time: 2:30 PM').time).toBe('14:30')
  })

  it('converts 12-hour AM', () => {
    expect(parseBlessThis('Time: 9:15 am').time).toBe('09:15')
  })

  it('converts 12:00 PM to 12:00', () => {
    expect(parseBlessThis('Time: 12:00 PM').time).toBe('12:00')
  })

  it('converts 12:00 AM to 00:00', () => {
    expect(parseBlessThis('Time: 12:00 AM').time).toBe('00:00')
  })

  it('strips seconds from HH:MM:SS', () => {
    expect(parseBlessThis('Time: 14:32:00').time).toBe('14:32')
  })
})

// ── Tags ──────────────────────────────────────────────────────────────────────

describe('tags parsing', () => {
  it('splits comma-separated tags', () => {
    expect(parseBlessThis('Tags: groceries, weekly').tags).toEqual(['groceries', 'weekly'])
  })

  it('splits semicolon-separated tags', () => {
    expect(parseBlessThis('Tags: lunch; work; client').tags).toEqual(['lunch', 'work', 'client'])
  })

  it('trims whitespace from each tag', () => {
    expect(parseBlessThis('Tags:  coffee ,  grab ').tags).toEqual(['coffee', 'grab'])
  })

  it('handles single tag', () => {
    expect(parseBlessThis('Tags: gaming').tags).toEqual(['gaming'])
  })

  it('accepts Tag (singular) alias', () => {
    expect(parseBlessThis('Tag: work').tags).toEqual(['work'])
  })

  it('filters empty tags', () => {
    expect(parseBlessThis('Tags: coffee,,').tags).toEqual(['coffee'])
  })
})

// ── Notes field aliases ───────────────────────────────────────────────────────

describe('notes field aliases', () => {
  it('parses Notes', () => {
    expect(parseBlessThis('Notes: weekly shop').notes).toBe('weekly shop')
  })

  it('parses Note (singular)', () => {
    expect(parseBlessThis('Note: lunch with team').notes).toBe('lunch with team')
  })

  it('parses Description', () => {
    expect(parseBlessThis('Description: top-up').notes).toBe('top-up')
  })

  it('parses Memo', () => {
    expect(parseBlessThis('Memo: reimbursable').notes).toBe('reimbursable')
  })
})

// ── Partial input ─────────────────────────────────────────────────────────────

describe('partial / missing fields', () => {
  it('returns empty object for empty string', () => {
    expect(parseBlessThis('')).toEqual({})
  })

  it('returns only fields present in input', () => {
    const result = parseBlessThis('Amount: 5.00\nPayee: Coffee Bean')
    expect(result).toEqual({ amount: 5, payee: 'Coffee Bean' })
  })

  it('ignores lines without a colon', () => {
    const result = parseBlessThis('just a random line\nAmount: 3.50')
    expect(result.amount).toBe(3.5)
  })

  it('parses Payment Method field', () => {
    const result = parseBlessThis('Payment Method: credit card\nAmount: 10.00')
    expect(result.amount).toBe(10)
    expect(result.payment_method).toBe('credit card')
  })

  it('handles value containing colons (e.g. note with time)', () => {
    // Only the first colon splits key from value
    const result = parseBlessThis('Notes: reminder: check receipt')
    expect(result.notes).toBe('reminder: check receipt')
  })
})

// ── Payment Method ────────────────────────────────────────────────────────────

describe('payment_method parsing', () => {
  it('parses "Payment Method" key', () => {
    expect(parseBlessThis('Payment Method: credit card').payment_method).toBe('credit card')
  })

  it('parses "Payment" short alias', () => {
    expect(parseBlessThis('Payment: debit card').payment_method).toBe('debit card')
  })

  it('preserves case of value', () => {
    expect(parseBlessThis('Payment Method: GrabPay').payment_method).toBe('GrabPay')
  })

  it('is absent when not in input', () => {
    expect(parseBlessThis('Amount: 5.00').payment_method).toBeUndefined()
  })
})

// ── Case insensitivity ────────────────────────────────────────────────────────

describe('key case insensitivity', () => {
  it('handles uppercase keys', () => {
    expect(parseBlessThis('AMOUNT: 8.00').amount).toBe(8)
  })

  it('handles mixed case keys', () => {
    expect(parseBlessThis('Merchant/Payee: Watsons').payee).toBe('Watsons')
    expect(parseBlessThis('merchant/payee: Watsons').payee).toBe('Watsons')
  })
})

// ── Hierarchical category (Parent > Subcategory) ──────────────────────────────

describe('hierarchical category parsing (BUG-064)', () => {
  it('splits "Parent > Subcategory" into category and subcategory', () => {
    const result = parseBlessThis('Category: Food > Meals')
    expect(result.category).toBe('Food')
    expect(result.subcategory).toBe('Meals')
  })

  it('keeps plain "Parent" as category with no subcategory', () => {
    const result = parseBlessThis('Category: Food')
    expect(result.category).toBe('Food')
    expect(result.subcategory).toBeUndefined()
  })

  it('trims whitespace around the separator', () => {
    const result = parseBlessThis('Category:   Travel  >  Taxi  ')
    expect(result.category).toBe('Travel')
    expect(result.subcategory).toBe('Taxi')
  })

  it('handles multi-word parent and child names', () => {
    const result = parseBlessThis('Category: Wellness and Health > Medical')
    expect(result.category).toBe('Wellness and Health')
    expect(result.subcategory).toBe('Medical')
  })

  it('ignores trailing empty subcategory ("Food >")', () => {
    const result = parseBlessThis('Category: Food >')
    expect(result.category).toBe('Food')
    expect(result.subcategory).toBeUndefined()
  })
})
