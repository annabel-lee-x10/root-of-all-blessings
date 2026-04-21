// @vitest-environment jsdom
// Regression tests for WheresMyMoney form bugs:
// BUG-026: payment type pills filter the account list; no separate payment method dropdown
// BUG-027: category dropdown must show no duplicate category names
// BUG-028: category picker must be two-step: parent → subcategory filtered by parent_id
// BUG-029: tag suggestions must not surface entries whose names match a category name
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'

vi.mock('@/app/(protected)/components/toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))
vi.mock('@/lib/parse-bless-this', () => ({
  parseBlessThis: vi.fn().mockReturnValue({}),
}))

const ACCOUNTS = [
  { id: 'acc1', name: 'DBS Savings', type: 'bank', currency: 'SGD', is_active: 1, created_at: '2024-01-01', updated_at: '2024-01-01' },
  { id: 'acc2', name: 'Citi 9773', type: 'credit_card', currency: 'SGD', is_active: 1, created_at: '2024-01-01', updated_at: '2024-01-01' },
]

// Categories: Food (parent) → Dining Out (child); Shopping (parent) → Toys (child); Technology (parent) → Toys (child)
// "Toys" exists under two parents — would duplicate in a flat list
const CATEGORIES = [
  { id: 'cat-food', name: 'Food', type: 'expense', sort_order: 1, parent_id: null, created_at: '2024-01-01', updated_at: '2024-01-01' },
  { id: 'cat-dining', name: 'Dining Out', type: 'expense', sort_order: 1, parent_id: 'cat-food', created_at: '2024-01-01', updated_at: '2024-01-01' },
  { id: 'cat-shopping', name: 'Shopping', type: 'expense', sort_order: 2, parent_id: null, created_at: '2024-01-01', updated_at: '2024-01-01' },
  { id: 'cat-toys-shop', name: 'Toys', type: 'expense', sort_order: 1, parent_id: 'cat-shopping', created_at: '2024-01-01', updated_at: '2024-01-01' },
  { id: 'cat-tech', name: 'Technology', type: 'expense', sort_order: 3, parent_id: null, created_at: '2024-01-01', updated_at: '2024-01-01' },
  { id: 'cat-toys-tech', name: 'Toys', type: 'expense', sort_order: 1, parent_id: 'cat-tech', created_at: '2024-01-01', updated_at: '2024-01-01' },
  { id: 'cat-transport', name: 'Transport', type: 'expense', sort_order: 4, parent_id: null, created_at: '2024-01-01', updated_at: '2024-01-01' },
]

// "Dining Out" tag shares a name with the "Dining Out" subcategory
const TAGS = [
  { id: 'tag-weekend', name: 'weekend', created_at: '2024-01-01' },
  { id: 'tag-dining', name: 'Dining Out', created_at: '2024-01-01' },
]

function mockFetch() {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.includes('/api/accounts')) return { ok: true, json: async () => ACCOUNTS }
    if (url.includes('/api/categories')) return { ok: true, json: async () => CATEGORIES }
    if (url.includes('/api/tags')) return { ok: true, json: async () => TAGS }
    if (url.includes('/api/transactions/payees')) return { ok: true, json: async () => [] }
    return { ok: true, json: async () => ({}) }
  }))
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

async function renderWMM() {
  const { WheresMyMoney } = await import('@/app/(protected)/components/wheres-my-money')
  render(<WheresMyMoney />)
  // Wait for data to load (default credit_card filter shows credit card accounts first)
  await waitFor(() => expect(screen.getByRole('option', { name: 'Citi 9773' })).toBeInTheDocument())
}

// ---------------------------------------------------------------------------
// BUG-026 · Payment type filter pills narrow the account list
// ---------------------------------------------------------------------------
describe('BUG-026: payment type filter pills narrow account list', () => {
  it('defaults to credit_card filter showing only credit card accounts', async () => {
    mockFetch()
    await renderWMM()

    expect(screen.getByRole('option', { name: 'Citi 9773' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'DBS Savings' })).not.toBeInTheDocument()
  })

  it('shows only bank accounts when Bank filter is selected', async () => {
    mockFetch()
    await renderWMM()

    fireEvent.click(screen.getByTestId('payment-type-bank'))

    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'DBS Savings' })).toBeInTheDocument()
      expect(screen.queryByRole('option', { name: 'Citi 9773' })).not.toBeInTheDocument()
    })
  })

  it('shows only credit card accounts when Credit Card filter is selected', async () => {
    mockFetch()
    await renderWMM()

    // credit_card is the default — deselect then re-select to exercise the toggle path
    fireEvent.click(screen.getByTestId('payment-type-credit_card')) // deselect
    await waitFor(() => expect(screen.getByRole('option', { name: 'DBS Savings' })).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('payment-type-credit_card')) // re-select

    await waitFor(() => {
      expect(screen.queryByRole('option', { name: 'DBS Savings' })).not.toBeInTheDocument()
      expect(screen.getByRole('option', { name: 'Citi 9773' })).toBeInTheDocument()
    })
  })

  it('deselects filter when same pill is clicked again (shows all accounts)', async () => {
    mockFetch()
    await renderWMM()

    // credit_card is the default — deselecting it should show all accounts
    fireEvent.click(screen.getByTestId('payment-type-credit_card'))
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'DBS Savings' })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: 'Citi 9773' })).toBeInTheDocument()
    })
  })

  it('does not render a separate payment method dropdown', async () => {
    mockFetch()
    await renderWMM()
    expect(screen.queryByTestId('payment-method-select')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// BUG-027 · No duplicate category names in the dropdown
// ---------------------------------------------------------------------------
describe('BUG-027: no duplicate category names', () => {
  it('shows "Toys" only once even though it exists under two parent categories', async () => {
    mockFetch()
    await renderWMM()

    // Select "Shopping" as parent to see its Toys
    const parentSelect = screen.getByTestId('parent-category-select')
    fireEvent.change(parentSelect, { target: { value: 'cat-shopping' } })

    await waitFor(() => {
      const toysOpts = screen.getAllByRole('option', { name: 'Toys' })
      expect(toysOpts).toHaveLength(1)
    })
  })
})

// ---------------------------------------------------------------------------
// BUG-028 · Two-step category picker
// ---------------------------------------------------------------------------
describe('BUG-028: two-step category picker', () => {
  it('shows only parent categories in the first picker', async () => {
    mockFetch()
    await renderWMM()

    const parentSelect = screen.getByTestId('parent-category-select')
    const options = Array.from(parentSelect.querySelectorAll('option')).map(o => o.textContent)

    expect(options).toContain('Food')
    expect(options).toContain('Shopping')
    expect(options).toContain('Technology')
    expect(options).toContain('Transport')
    // Children must NOT appear in the parent picker
    expect(options).not.toContain('Dining Out')
    expect(options).not.toContain('Toys')
  })

  it('shows subcategories after selecting a parent', async () => {
    mockFetch()
    await renderWMM()

    const parentSelect = screen.getByTestId('parent-category-select')
    fireEvent.change(parentSelect, { target: { value: 'cat-food' } })

    await waitFor(() => {
      const subSelect = screen.getByTestId('subcategory-select')
      const opts = Array.from(subSelect.querySelectorAll('option')).map(o => o.textContent)
      expect(opts).toContain('Dining Out')
    })
  })

  it('subcategory picker is scoped to the selected parent (no cross-parent leakage)', async () => {
    mockFetch()
    await renderWMM()

    const parentSelect = screen.getByTestId('parent-category-select')
    fireEvent.change(parentSelect, { target: { value: 'cat-shopping' } })

    await waitFor(() => {
      const subSelect = screen.getByTestId('subcategory-select')
      const opts = Array.from(subSelect.querySelectorAll('option')).map(o => o.textContent)
      expect(opts).toContain('Toys')
      expect(opts).not.toContain('Dining Out') // belongs to Food, not Shopping
    })
  })

  it('does not show subcategory picker for a parent with no children', async () => {
    mockFetch()
    await renderWMM()

    const parentSelect = screen.getByTestId('parent-category-select')
    fireEvent.change(parentSelect, { target: { value: 'cat-transport' } })

    await waitFor(() => {
      expect(screen.queryByTestId('subcategory-select')).not.toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// BUG-029 · Tag suggestions exclude entries whose names match a category name
// ---------------------------------------------------------------------------
describe('BUG-029: tag suggestions exclude category-named entries', () => {
  it('does not suggest a tag whose name matches a category name', async () => {
    mockFetch()
    await renderWMM()

    const tagInput = screen.getByPlaceholderText('Add tags...')
    fireEvent.change(tagInput, { target: { value: 'Dining' } })

    await waitFor(() => {
      // "Dining Out" is both a tag and a category name — should be hidden
      expect(screen.queryByText('Dining Out')).not.toBeInTheDocument()
    })
  })

  it('still suggests tags whose names do not match any category', async () => {
    mockFetch()
    await renderWMM()

    const tagInput = screen.getByPlaceholderText('Add tags...')
    fireEvent.change(tagInput, { target: { value: 'week' } })

    await waitFor(() => {
      expect(screen.getByText('weekend')).toBeInTheDocument()
    })
  })
})
