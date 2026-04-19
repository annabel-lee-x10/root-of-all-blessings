// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'

describe('parseBlessThis — type field (BUG-010)', () => {
  it('parses Type: income', async () => {
    const { parseBlessThis } = await import('@/lib/parse-bless-this')
    const result = parseBlessThis('Amount: 760\nType: income\nMerchant/Payee: Mission Control')
    expect(result.type).toBe('income')
  })

  it('parses Type: expense', async () => {
    const { parseBlessThis } = await import('@/lib/parse-bless-this')
    const result = parseBlessThis('Amount: 23.50\nType: expense')
    expect(result.type).toBe('expense')
  })

  it('returns undefined type when Type line is absent', async () => {
    const { parseBlessThis } = await import('@/lib/parse-bless-this')
    const result = parseBlessThis('Amount: 50\nMerchant/Payee: NTUC')
    expect(result.type).toBeUndefined()
  })

  it('ignores unknown type values', async () => {
    const { parseBlessThis } = await import('@/lib/parse-bless-this')
    const result = parseBlessThis('Type: bogus\nAmount: 10')
    expect(result.type).toBeUndefined()
  })
})

const mockAccounts = [{ id: 'acc1', name: 'DBS', type: 'bank', currency: 'SGD', is_active: 1 }]
const mockCategories = [
  { id: 'cat1', name: 'Food', type: 'expense' },
  { id: 'cat2', name: 'Salary', type: 'income' },
]

function setupFetchMock() {
  vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
    if (url.includes('/api/accounts')) return Promise.resolve({ ok: true, json: () => Promise.resolve(mockAccounts) })
    if (url.includes('/api/categories')) return Promise.resolve({ ok: true, json: () => Promise.resolve(mockCategories) })
    if (url.includes('/api/tags')) return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
    if (url.includes('/api/transactions/payees')) return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
  }))
}

describe('WheresMyMoney — paste applies type (BUG-010)', () => {
  beforeEach(setupFetchMock)
  afterEach(() => vi.unstubAllGlobals())

  it('sets type to income when paste text contains Type: income', async () => {
    const { WheresMyMoney } = await import('@/app/(protected)/components/wheres-my-money')
    render(<WheresMyMoney />)
    await waitFor(() => expect(screen.getByRole('button', { name: /paste receipt/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /paste receipt/i }))
    // textarea is the only textbox in the paste panel
    const textarea = screen.getAllByRole('textbox').find((el) => el.tagName === 'TEXTAREA')!
    fireEvent.change(textarea, { target: { value: 'Amount: 760\nType: income\nMerchant/Payee: Mission Control' } })
    fireEvent.click(screen.getByRole('button', { name: /fill form/i }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Income' })).toHaveAttribute('aria-pressed', 'true')
    })
  })

  it('leaves type as expense when paste text has no Type line', async () => {
    const { WheresMyMoney } = await import('@/app/(protected)/components/wheres-my-money')
    render(<WheresMyMoney />)
    await waitFor(() => expect(screen.getByRole('button', { name: /paste receipt/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /paste receipt/i }))
    const textarea = screen.getAllByRole('textbox').find((el) => el.tagName === 'TEXTAREA')!
    fireEvent.change(textarea, { target: { value: 'Amount: 23.50\nMerchant/Payee: NTUC' } })
    fireEvent.click(screen.getByRole('button', { name: /fill form/i }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Expense' })).toHaveAttribute('aria-pressed', 'true')
    })
  })
})
