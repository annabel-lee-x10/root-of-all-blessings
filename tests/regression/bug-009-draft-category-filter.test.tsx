// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'

const mockAccounts = [{ id: 'acc1', name: 'DBS', type: 'bank', currency: 'SGD', is_active: 1 }]
const mockCategories = [
  { id: 'cat1', name: 'Food', type: 'expense' },
  { id: 'cat2', name: 'Salary', type: 'income' },
]
const mockTags: unknown[] = []
const mockIncomeDraft = {
  id: 'tx1',
  type: 'income',
  amount: 760,
  currency: 'SGD',
  account_id: 'acc1',
  to_account_id: null,
  category_id: 'cat2',
  category_name: 'Salary',
  payee: 'Mission Control',
  note: null,
  payment_method: null,
  datetime: '2026-04-19T10:00:00.000Z',
  status: 'draft',
  tags: [],
  account_name: 'DBS',
  to_account_name: null,
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
    if (url.includes('/api/accounts')) return Promise.resolve({ ok: true, json: () => Promise.resolve(mockAccounts) })
    if (url.includes('/api/categories')) return Promise.resolve({ ok: true, json: () => Promise.resolve(mockCategories) })
    if (url.includes('/api/tags')) return Promise.resolve({ ok: true, json: () => Promise.resolve(mockTags) })
    if (url.includes('/api/transactions?status=draft')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [mockIncomeDraft] }) })
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('DraftsCard edit form (BUG-009)', () => {
  it('shows income category options when editing an income draft', async () => {
    const { DraftsCard } = await import('@/app/(protected)/components/drafts-card')
    render(<DraftsCard />)
    const header = screen.getByRole('button', { name: /drafts/i })
    fireEvent.click(header)
    await waitFor(() => expect(screen.getByText('Mission Control')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }))
    await waitFor(() => expect(screen.getByLabelText(/type/i)).toBeInTheDocument())
    expect(screen.getByRole('option', { name: 'Salary' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Food' })).not.toBeInTheDocument()
  })

  it('income draft row displays amount as positive (no minus sign)', async () => {
    const { DraftsCard } = await import('@/app/(protected)/components/drafts-card')
    render(<DraftsCard />)
    const header = screen.getByRole('button', { name: /drafts/i })
    fireEvent.click(header)
    await waitFor(() => expect(screen.getByText('Mission Control')).toBeInTheDocument())
    expect(screen.queryByText(/-760/)).not.toBeInTheDocument()
    expect(screen.getByText(/\+SGD 760\.00/)).toBeInTheDocument()
  })

  it('type selector is visible in edit form and shows correct value', async () => {
    const { DraftsCard } = await import('@/app/(protected)/components/drafts-card')
    render(<DraftsCard />)
    const header = screen.getByRole('button', { name: /drafts/i })
    fireEvent.click(header)
    await waitFor(() => expect(screen.getByText('Mission Control')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }))
    await waitFor(() => expect(screen.getByLabelText(/type/i)).toBeInTheDocument())
    const typeSelect = screen.getByLabelText(/type/i)
    expect(typeSelect).toHaveValue('income')
  })
})
