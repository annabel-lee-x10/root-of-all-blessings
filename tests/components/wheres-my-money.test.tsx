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
    if (url.includes('/api/categories/frequent')) return { ok: true, json: async () => [] }
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
// BUG-027 · No duplicate category names (searchable picker, scoped by parent)
// ---------------------------------------------------------------------------
describe('BUG-027: no duplicate category names in searchable picker', () => {
  it('searching "toys" shows "Shopping > Toys" and "Technology > Toys" separately — no merging', async () => {
    mockFetch()
    await renderWMM()

    const input = screen.getByTestId('category-search-input')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'toys' } })

    await waitFor(() => {
      // Both Toys entries appear but labeled with their parents, so they are distinct
      expect(screen.getByTestId('category-option-cat-toys-shop')).toBeInTheDocument()
      expect(screen.getByTestId('category-option-cat-toys-tech')).toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// BUG-028 · Category picker respects parent hierarchy (searchable unified picker)
// ---------------------------------------------------------------------------
describe('BUG-028: searchable picker respects parent/child hierarchy', () => {
  it('parents with children are NOT shown as standalone selectable options', async () => {
    mockFetch()
    await renderWMM()

    const input = screen.getByTestId('category-search-input')
    fireEvent.focus(input)
    await waitFor(() => expect(screen.getByTestId('category-dropdown')).toBeInTheDocument())

    // Parents that have children should not be directly selectable
    expect(screen.queryByTestId('category-option-cat-food')).not.toBeInTheDocument()
    expect(screen.queryByTestId('category-option-cat-shopping')).not.toBeInTheDocument()
    expect(screen.queryByTestId('category-option-cat-tech')).not.toBeInTheDocument()
  })

  it('typing parent name "food" shows all Food subcategories labeled "Food > ..."', async () => {
    mockFetch()
    await renderWMM()

    const input = screen.getByTestId('category-search-input')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'food' } })

    await waitFor(() => {
      expect(screen.getByTestId('category-option-cat-dining')).toBeInTheDocument()
      // Transport > ... should not appear
      expect(screen.queryByTestId('category-option-cat-transport')).not.toBeInTheDocument()
    })
  })

  it('searching "shopping" does not show Food > Dining Out', async () => {
    mockFetch()
    await renderWMM()

    const input = screen.getByTestId('category-search-input')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'shopping' } })

    await waitFor(() => {
      expect(screen.getByTestId('category-option-cat-toys-shop')).toBeInTheDocument()
      expect(screen.queryByTestId('category-option-cat-dining')).not.toBeInTheDocument()
    })
  })

  it('parent with no children (Transport) appears directly as a selectable option', async () => {
    mockFetch()
    await renderWMM()

    const input = screen.getByTestId('category-search-input')
    fireEvent.focus(input)
    await waitFor(() => expect(screen.getByTestId('category-dropdown')).toBeInTheDocument())
    expect(screen.getByTestId('category-option-cat-transport')).toBeInTheDocument()
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

// ---------------------------------------------------------------------------
// Searchable category picker regression (replaces two-step parent→child selects)
// ---------------------------------------------------------------------------
describe('searchable category picker in WheresMyMoney', () => {
  it('shows category-search-input, not legacy parent/subcategory selects', async () => {
    mockFetch()
    await renderWMM()
    expect(screen.getByTestId('category-search-input')).toBeInTheDocument()
    expect(screen.queryByTestId('parent-category-select')).not.toBeInTheDocument()
    expect(screen.queryByTestId('subcategory-select')).not.toBeInTheDocument()
  })

  it('typing "din" filters dropdown to Food > Dining Out only', async () => {
    mockFetch()
    await renderWMM()
    const input = screen.getByTestId('category-search-input')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'din' } })
    await waitFor(() => {
      expect(screen.getByTestId('category-option-cat-dining')).toBeInTheDocument()
      expect(screen.queryByTestId('category-option-cat-toys-shop')).not.toBeInTheDocument()
    })
  })
})
