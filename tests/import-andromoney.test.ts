import { describe, it, expect } from 'vitest'
import {
  parseCsvLine,
  parseRow,
  determineRowType,
  parseDateTime,
  mapCategory,
  normaliseAccountName,
  guessAccountType,
  COL,
} from '../scripts/import-andromoney'

// ── parseCsvLine ──────────────────────────────────────────────────────────────

describe('parseCsvLine', () => {
  it('splits a simple comma-separated line', () => {
    const result = parseCsvLine('a,b,c,d')
    expect(result).toEqual(['a', 'b', 'c', 'd'])
  })

  it('handles quoted fields containing commas', () => {
    const result = parseCsvLine('1,"hello, world",3')
    expect(result).toEqual(['1', 'hello, world', '3'])
  })

  it('handles doubled-quote escaping inside quoted field', () => {
    const result = parseCsvLine('"say ""hi""",next')
    expect(result).toEqual(['say "hi"', 'next'])
  })

  it('handles empty fields', () => {
    const result = parseCsvLine('a,,c,,e')
    expect(result).toEqual(['a', '', 'c', '', 'e'])
  })

  it('trims whitespace from unquoted fields', () => {
    const result = parseCsvLine(' foo , bar ')
    expect(result).toEqual(['foo', 'bar'])
  })
})

// ── parseRow ──────────────────────────────────────────────────────────────────

function makeFields(overrides: Partial<Record<keyof typeof COL, string>> = {}): string[] {
  const defaults: Record<number, string> = {
    [COL.ID]:          '1',
    [COL.CURRENCY]:    'SGD',
    [COL.AMOUNT]:      '10.00',
    [COL.CATEGORY]:    'Food',
    [COL.SUB_CATEGORY]:'',
    [COL.DATE]:        '20230115',
    [COL.EXPENSE]:     'POSB',
    [COL.INCOME]:      '',
    [COL.NOTE]:        '',
    [COL.PERIODIC]:    '',
    [COL.PROJECT]:     '',
    [COL.PAYEE]:       '',
    [COL.UID]:         'uid-001',
    [COL.TIME]:        '1430',
  }
  for (const [k, v] of Object.entries(overrides)) {
    defaults[COL[k as keyof typeof COL]] = v
  }
  const arr: string[] = []
  for (let i = 0; i <= 13; i++) arr.push(defaults[i] ?? '')
  return arr
}

describe('parseRow', () => {
  it('parses a standard expense row', () => {
    const row = parseRow(makeFields())
    expect(row).not.toBeNull()
    expect(row!.amount).toBe(10)
    expect(row!.currency).toBe('SGD')
    expect(row!.category).toBe('Food')
    expect(row!.date).toBe('20230115')
    expect(row!.uid).toBe('uid-001')
  })

  it('takes absolute value of negative amounts', () => {
    const row = parseRow(makeFields({ AMOUNT: '-25.50' }))
    expect(row!.amount).toBe(25.5)
  })

  it('defaults currency to SGD when empty', () => {
    const row = parseRow(makeFields({ CURRENCY: '' }))
    expect(row!.currency).toBe('SGD')
  })

  it('uppercases currency', () => {
    const row = parseRow(makeFields({ CURRENCY: 'usd' }))
    expect(row!.currency).toBe('USD')
  })

  it('returns null when fewer than 13 fields', () => {
    expect(parseRow(['a', 'b'])).toBeNull()
  })

  it('returns null when amount is not a number', () => {
    expect(parseRow(makeFields({ AMOUNT: 'n/a' }))).toBeNull()
  })
})

// ── determineRowType ──────────────────────────────────────────────────────────

describe('determineRowType', () => {
  it('identifies SYSTEM/INIT_AMOUNT as init_balance', () => {
    const row = parseRow(makeFields({ CATEGORY: 'SYSTEM', SUB_CATEGORY: 'INIT_AMOUNT', EXPENSE: 'POSB', INCOME: '' }))!
    expect(determineRowType(row)).toBe('init_balance')
  })

  it('identifies expense when only Expense column filled', () => {
    const row = parseRow(makeFields({ EXPENSE: 'POSB', INCOME: '' }))!
    expect(determineRowType(row)).toBe('expense')
  })

  it('identifies income when only Income column filled', () => {
    const row = parseRow(makeFields({ EXPENSE: '', INCOME: 'UOB One' }))!
    expect(determineRowType(row)).toBe('income')
  })

  it('identifies transfer when both columns filled', () => {
    const row = parseRow(makeFields({ EXPENSE: 'POSB', INCOME: 'UOB One' }))!
    expect(determineRowType(row)).toBe('transfer')
  })

  it('defaults to expense when neither column filled', () => {
    const row = parseRow(makeFields({ EXPENSE: '', INCOME: '' }))!
    expect(determineRowType(row)).toBe('expense')
  })
})

// ── parseDateTime ─────────────────────────────────────────────────────────────

describe('parseDateTime', () => {
  it('converts YYYYMMDD + HHMM to ISO datetime', () => {
    expect(parseDateTime('20230115', '1430')).toBe('2023-01-15T14:30:00')
  })

  it('handles HH:MM time format', () => {
    expect(parseDateTime('20230115', '09:05')).toBe('2023-01-15T09:05:00')
  })

  it('handles empty time (defaults to midnight)', () => {
    expect(parseDateTime('20230115', '')).toBe('2023-01-15T00:00:00')
  })

  it('handles time 0000', () => {
    expect(parseDateTime('20221231', '0000')).toBe('2022-12-31T00:00:00')
  })

  it('handles single-digit hour padding', () => {
    expect(parseDateTime('20230601', '0900')).toBe('2023-06-01T09:00:00')
  })

  it('handles 3-digit HMM time (e.g. 915 → 09:15)', () => {
    expect(parseDateTime('20231003', '915')).toBe('2023-10-03T09:15:00')
  })

  it('handles 3-digit HMM time (e.g. 728 → 07:28)', () => {
    expect(parseDateTime('20230115', '728')).toBe('2023-01-15T07:28:00')
  })

  it('handles 3-digit HMM time (e.g. 553 → 05:53)', () => {
    expect(parseDateTime('20230601', '553')).toBe('2023-06-01T05:53:00')
  })

  it('handles 3-digit HMM time (e.g. 228 → 02:28)', () => {
    expect(parseDateTime('20221231', '228')).toBe('2022-12-31T02:28:00')
  })

  it('handles 3-digit HMM time (e.g. 900 → 09:00)', () => {
    expect(parseDateTime('20230101', '900')).toBe('2023-01-01T09:00:00')
  })
})

// ── mapCategory ───────────────────────────────────────────────────────────────

describe('mapCategory', () => {
  it('maps food categories', () => {
    expect(mapCategory('Food', 'Breakfast', 'expense')).toEqual({ category: 'Food', subcategory: 'Meals', type: 'expense' })
    expect(mapCategory('Food', 'Grocery', 'expense')).toEqual({ category: 'Food', subcategory: 'Groceries', type: 'expense' })
    expect(mapCategory('Food', 'Coffee Matcha', 'expense')).toEqual({ category: 'Food', subcategory: 'Coffee', type: 'expense' })
  })

  it('maps transport categories', () => {
    expect(mapCategory('Transportation', 'Taxi', 'expense')).toEqual({ category: 'Transportation', subcategory: 'Taxi', type: 'expense' })
    expect(mapCategory('Transportation', 'Bus / Train / Subway', 'expense')).toEqual({ category: 'Transportation', subcategory: 'Bus and Train', type: 'expense' })
    expect(mapCategory('buffer', 'Cab', 'expense')).toEqual({ category: 'Transportation', subcategory: 'Taxi', type: 'expense' })
  })

  it('maps bills categories', () => {
    expect(mapCategory('Bills', 'Electricity', 'expense')).toEqual({ category: 'Bills', subcategory: 'Electricity', type: 'expense' })
    expect(mapCategory('Bills', 'Broadband', 'expense')).toEqual({ category: 'Bills', subcategory: 'Broadband', type: 'expense' })
    expect(mapCategory('Bills', 'Mobile phones', 'expense')).toEqual({ category: 'Bills', subcategory: 'Mobile', type: 'expense' })
  })

  it('maps health categories', () => {
    expect(mapCategory('Health and Wellness', 'Dental', 'expense')).toEqual({ category: 'Health and Wellness', subcategory: 'Dental', type: 'expense' })
    expect(mapCategory('Health and Wellness', 'Medicine', 'expense')).toEqual({ category: 'Health and Wellness', subcategory: 'Medical', type: 'expense' })
  })

  it('maps entertainment categories', () => {
    expect(mapCategory('Entertainment', 'Gaming', 'expense')).toEqual({ category: 'Entertainment', subcategory: 'Gaming', type: 'expense' })
    expect(mapCategory('Entertainment', 'Movie', 'expense')).toEqual({ category: 'Entertainment', subcategory: 'Shows and Movies', type: 'expense' })
  })

  it('maps subscription categories', () => {
    expect(mapCategory('Subscriptions', 'Entertainment', 'expense')).toEqual({ category: 'Subscriptions', subcategory: 'Entertainment', type: 'expense' })
    expect(mapCategory('Subscriptions', 'Internet', 'expense')).toEqual({ category: 'Subscriptions', subcategory: 'Internet', type: 'expense' })
  })

  it('maps pet categories', () => {
    expect(mapCategory('Pet', 'Food', 'expense')).toEqual({ category: 'Pet', subcategory: 'Pet Food', type: 'expense' })
    expect(mapCategory('Pet', 'Grooming', 'expense')).toEqual({ category: 'Pet', subcategory: 'Grooming', type: 'expense' })
  })

  it('maps income categories', () => {
    expect(mapCategory('Income', 'Salary', 'income')).toEqual({ category: 'Income', subcategory: 'Salary', type: 'income' })
    expect(mapCategory('Income', 'Refund', 'income')).toEqual({ category: 'Income', subcategory: 'Refund', type: 'income' })
    expect(mapCategory('Income', 'Repayment', 'income')).toEqual({ category: 'Income', subcategory: 'Repayment', type: 'income' })
    expect(mapCategory('Income', 'Angpow', 'income')).toEqual({ category: 'Income', subcategory: 'Angpow', type: 'income' })
  })

  it('maps redistributed "buffer" categories', () => {
    expect(mapCategory('buffer', 'Coffee', 'expense')).toEqual({ category: 'Food', subcategory: 'Coffee', type: 'expense' })
    expect(mapCategory('buffer', 'Cab', 'expense')).toEqual({ category: 'Transportation', subcategory: 'Taxi', type: 'expense' })
  })

  it('returns category info for mapped transfer rows', () => {
    expect(mapCategory('Transfer', 'General Transfer', 'transfer')).toEqual({ category: 'Transfer', subcategory: 'General Transfer', type: 'expense' })
  })

  it('returns null for unmapped transfer rows', () => {
    expect(mapCategory('Transfer', 'Unknown', 'transfer')).toBeNull()
  })

  it('returns null for init_balance rows', () => {
    expect(mapCategory('SYSTEM', 'INIT_AMOUNT', 'init_balance')).toBeNull()
  })

  it('returns null for unknown category combinations', () => {
    expect(mapCategory('XYZ Unknown', 'foo', 'expense')).toBeNull()
    expect(mapCategory('XYZ Unknown', 'bar', 'income')).toBeNull()
  })
})

// ── normaliseAccountName ──────────────────────────────────────────────────────

describe('normaliseAccountName', () => {
  it('normalises common account names', () => {
    expect(normaliseAccountName('Posb')).toBe('POSB')
    expect(normaliseAccountName('POSB')).toBe('POSB')
    expect(normaliseAccountName('posb')).toBe('POSB')
    expect(normaliseAccountName('Ocbc')).toBe('OCBC')
    expect(normaliseAccountName('UOB savings')).toBe('UOB Savings')
    expect(normaliseAccountName('GrabPay')).toBe('GrabPay')
    expect(normaliseAccountName('Shopee Pay')).toBe('Shopee Pay')
    expect(normaliseAccountName('ShopBack')).toBe('ShopBack')
    expect(normaliseAccountName('PayPal')).toBe('PayPal')
    expect(normaliseAccountName('Syfe')).toBe('Syfe')
    expect(normaliseAccountName('6674')).toBe('6674')
  })

  it('passes through unknown account names unchanged', () => {
    expect(normaliseAccountName('My Custom Account')).toBe('My Custom Account')
  })

  it('maps special accounts', () => {
    expect(normaliseAccountName('Lalamove Easyvan')).toBe('Lalamove Easyvan')
    expect(normaliseAccountName('2024 Japan')).toBe('2024 Japan')
  })
})

// ── guessAccountType ──────────────────────────────────────────────────────────

describe('guessAccountType', () => {
  it('returns wallet for Lalamove Easyvan', () => {
    expect(guessAccountType('Lalamove Easyvan')).toBe('wallet')
  })

  it('returns cash for 2024 Japan', () => {
    expect(guessAccountType('2024 Japan')).toBe('cash')
  })

  it('defaults to bank for unknown accounts', () => {
    expect(guessAccountType('Some New Account')).toBe('bank')
  })
})
