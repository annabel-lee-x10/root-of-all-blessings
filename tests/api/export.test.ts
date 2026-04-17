// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { initTestDb, clearTestDb, resetTestDb, req, seedAccount, seedCategory, seedTransaction } from '../helpers'
import { toCsvString } from '@/lib/export'
import type { TransactionRow } from '@/lib/types'

beforeAll(() => initTestDb())
afterAll(() => clearTestDb())
beforeEach(() => {
  resetTestDb()
  seedAccount('acc1', 'DBS', 'bank')
  seedCategory('cat1', 'Food', 'expense')
})

describe('GET /api/transactions/export', () => {
  it('returns CSV with correct content-type', async () => {
    seedTransaction('tx1', 'acc1', { amount: 15, payee: 'KFC' })
    const { GET } = await import('@/app/api/transactions/export/route')
    const res = await GET(req('/api/transactions/export?format=csv'))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/csv')
    expect(res.headers.get('content-disposition')).toContain('transactions-')
    expect(res.headers.get('content-disposition')).toContain('.csv')
    const text = await res.text()
    expect(text).toContain('datetime')
    expect(text).toContain('KFC')
  })

  it('returns XLSX with correct content-type', async () => {
    seedTransaction('tx1', 'acc1', { amount: 20 })
    const { GET } = await import('@/app/api/transactions/export/route')
    const res = await GET(req('/api/transactions/export?format=xlsx'))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('spreadsheetml')
    expect(res.headers.get('content-disposition')).toContain('.xlsx')
    const buf = await res.arrayBuffer()
    expect(buf.byteLength).toBeGreaterThan(0)
  })

  it('defaults to CSV when format is omitted', async () => {
    const { GET } = await import('@/app/api/transactions/export/route')
    const res = await GET(req('/api/transactions/export'))
    expect(res.headers.get('content-type')).toContain('text/csv')
  })

  it('filters by type in export', async () => {
    seedTransaction('tx1', 'acc1', { type: 'expense', payee: 'E-payee' })
    seedTransaction('tx2', 'acc1', { type: 'income', payee: 'I-payee' })
    const { GET } = await import('@/app/api/transactions/export/route')
    const res = await GET(req('/api/transactions/export?type=expense'))
    const text = await res.text()
    expect(text).toContain('E-payee')
    expect(text).not.toContain('I-payee')
  })
})

describe('toCsvString', () => {
  it('generates header row', () => {
    const csv = toCsvString([])
    expect(csv.startsWith('datetime,type,amount')).toBe(true)
  })

  it('escapes commas in field values', () => {
    const row: TransactionRow = {
      id: '1',
      type: 'expense',
      amount: 10,
      currency: 'SGD',
      fx_rate: null,
      fx_date: null,
      sgd_equivalent: null,
      account_id: 'a',
      to_account_id: null,
      category_id: null,
      payee: 'A, B, C',
      note: null,
      datetime: '2024-01-01T00:00:00Z',
      created_at: '',
      updated_at: '',
      account_name: 'DBS',
      to_account_name: null,
      category_name: null,
      tags: [],
    }
    const csv = toCsvString([row])
    expect(csv).toContain('"A, B, C"')
  })

  it('includes tags as semicolon-separated names', () => {
    const row: TransactionRow = {
      id: '1',
      type: 'expense',
      amount: 10,
      currency: 'SGD',
      fx_rate: null,
      fx_date: null,
      sgd_equivalent: null,
      account_id: 'a',
      to_account_id: null,
      category_id: null,
      payee: null,
      note: null,
      datetime: '2024-01-01T00:00:00Z',
      created_at: '',
      updated_at: '',
      account_name: 'DBS',
      to_account_name: null,
      category_name: null,
      tags: [
        { id: '1', name: 'travel', created_at: '' },
        { id: '2', name: 'work', created_at: '' },
      ],
    }
    const csv = toCsvString([row])
    expect(csv).toContain('travel; work')
  })
})
