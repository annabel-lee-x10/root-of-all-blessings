// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'

vi.mock('@/app/(protected)/components/toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))
vi.mock('@/app/(protected)/components/confirm-dialog', () => ({
  ConfirmDialog: () => null,
}))

const ACCOUNT = { id: 'acc1', name: 'DBS', type: 'bank', currency: 'SGD', is_active: 1, created_at: '2024-01-01', updated_at: '2024-01-01' }
const CATEGORIES = [
  { id: 'cat-food', name: 'Food', type: 'expense', sort_order: 1, parent_id: null, created_at: '2024-01-01', updated_at: '2024-01-01' },
  { id: 'cat-dining', name: 'Dining Out', type: 'expense', sort_order: 1, parent_id: 'cat-food', created_at: '2024-01-01', updated_at: '2024-01-01' },
]
const TX = {
  id: 'tx1', type: 'expense', amount: 10, currency: 'SGD', fx_rate: null, fx_date: null,
  sgd_equivalent: null, account_id: 'acc1', to_account_id: null, category_id: 'cat-dining',
  payee: 'TestPayee', note: '', payment_method: null, datetime: '2026-04-01T10:00:00+08:00',
  status: 'approved', created_at: '2026-04-01', updated_at: '2026-04-01',
  account_name: 'DBS', to_account_name: null, category_name: 'Dining Out', tags: [],
}

function mockFetch() {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (String(url).includes('/api/transactions') && !String(url).includes('/payees')) {
      return { ok: true, json: async () => ({ data: [TX], total: 1 }) }
    }
    if (String(url).includes('/api/accounts')) return { ok: true, json: async () => [ACCOUNT] }
    if (String(url).includes('/api/categories/frequent')) return { ok: true, json: async () => [] }
    if (String(url).includes('/api/categories')) return { ok: true, json: async () => CATEGORIES }
    if (String(url).includes('/api/tags')) return { ok: true, json: async () => [] }
    return { ok: true, json: async () => [] }
  }))
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('searchable category picker in TransactionsPage edit form', () => {
  it('shows category-search-input in edit form, not legacy two-step selects', async () => {
    mockFetch()
    const { default: TransactionsPage } = await import('@/app/(protected)/transactions/page')
    render(<TransactionsPage />)
    await waitFor(() => expect(screen.getByText('TestPayee')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    await waitFor(() => expect(screen.getByTestId('category-search-input')).toBeInTheDocument())
    expect(screen.queryByTestId('parent-category-select')).not.toBeInTheDocument()
    expect(screen.queryByTestId('subcategory-select')).not.toBeInTheDocument()
  })

  it('displays the current category label in the picker input', async () => {
    mockFetch()
    const { default: TransactionsPage } = await import('@/app/(protected)/transactions/page')
    render(<TransactionsPage />)
    await waitFor(() => expect(screen.getByText('TestPayee')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    await waitFor(() => {
      const input = screen.getByTestId('category-search-input') as HTMLInputElement
      expect(input.value).toBe('Food > Dining Out')
    })
  })
})
