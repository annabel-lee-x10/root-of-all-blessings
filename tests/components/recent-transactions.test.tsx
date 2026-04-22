// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'

function makeTx(id: string, overrides: Partial<{ payee: string; type: string; amount: number }> = {}) {
  return {
    id,
    type: overrides.type ?? 'expense',
    amount: overrides.amount ?? 10,
    currency: 'SGD',
    sgd_equivalent: null,
    account_id: 'acc1',
    to_account_id: null,
    category_id: null,
    payee: overrides.payee ?? `Payee ${id}`,
    note: null,
    datetime: '2026-04-19T10:00:00+08:00',
    created_at: '2026-04-19T10:00:00.000Z',
    updated_at: '2026-04-19T10:00:00.000Z',
    account_name: 'DBS',
    to_account_name: null,
    category_name: null,
    tags: [],
  }
}

const mockShowToast = vi.fn()
vi.mock('@/app/(protected)/components/toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}))

const sevenTxs = [1, 2, 3, 4, 5, 6, 7].map((n) => makeTx(String(n)))

const CATEGORIES = [
  { id: 'cat-food', name: 'Food', type: 'expense', sort_order: 1, parent_id: null, created_at: '2024-01-01', updated_at: '2024-01-01' },
  { id: 'cat-dining', name: 'Dining Out', type: 'expense', sort_order: 1, parent_id: 'cat-food', created_at: '2024-01-01', updated_at: '2024-01-01' },
]

function makeFetch(txs: ReturnType<typeof makeTx>[], total?: number) {
  return vi.fn().mockImplementation((url: string) => {
    if (typeof url === 'string' && url.includes('/api/accounts')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
    }
    if (typeof url === 'string' && url.includes('/api/categories/frequent')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
    }
    if (typeof url === 'string' && url.includes('/api/categories')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(CATEGORIES) })
    }
    if (typeof url === 'string' && url.includes('/api/tags')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ data: txs, total: total ?? txs.length }),
    })
  })
}

beforeEach(() => {
  vi.stubGlobal('fetch', makeFetch(sevenTxs, 7))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('RecentTransactions', () => {
  it('renders section heading', async () => {
    const { RecentTransactions } = await import('@/app/(protected)/components/recent-transactions')
    render(<RecentTransactions />)
    expect(screen.getByText('Recent Transactions')).toBeInTheDocument()
  })

  it('fetches with limit=5', async () => {
    const { RecentTransactions } = await import('@/app/(protected)/components/recent-transactions')
    render(<RecentTransactions />)
    await waitFor(() => {
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(expect.stringContaining('limit=5'))
    })
  })

  it('renders at most 5 transactions even if API returns more', async () => {
    const { RecentTransactions } = await import('@/app/(protected)/components/recent-transactions')
    render(<RecentTransactions />)
    await waitFor(() => {
      const rows = document.querySelectorAll('[data-tx-row]')
      expect(rows.length).toBeLessThanOrEqual(5)
    })
  })

  it('shows Show more link pointing to /transactions', async () => {
    const { RecentTransactions } = await import('@/app/(protected)/components/recent-transactions')
    render(<RecentTransactions />)
    await waitFor(() => {
      const link = screen.getByRole('link', { name: /show more/i })
      expect(link).toHaveAttribute('href', '/transactions')
    })
  })

  it('shows empty state when no transactions', async () => {
    vi.stubGlobal('fetch', makeFetch([], 0))
    const { RecentTransactions } = await import('@/app/(protected)/components/recent-transactions')
    render(<RecentTransactions />)
    await waitFor(() => {
      expect(screen.getByText(/no transactions yet/i)).toBeInTheDocument()
    })
  })

  it('shows payment_method when present', async () => {
    const txWithPayment = { ...makeTx('pm1'), payment_method: 'credit card' }
    vi.stubGlobal('fetch', makeFetch([txWithPayment], 1))
    const { RecentTransactions } = await import('@/app/(protected)/components/recent-transactions')
    render(<RecentTransactions />)
    await waitFor(() => {
      expect(screen.getByText('credit card')).toBeInTheDocument()
    })
  })

  it('does not show payment_method label when absent', async () => {
    vi.stubGlobal('fetch', makeFetch([makeTx('no-pm')], 1))
    const { RecentTransactions } = await import('@/app/(protected)/components/recent-transactions')
    render(<RecentTransactions />)
    await waitFor(() => {
      expect(screen.queryByText(/credit card|debit card|e-wallet|cash/i)).not.toBeInTheDocument()
    })
  })

  it('does not show Show more when no transactions', async () => {
    vi.stubGlobal('fetch', makeFetch([], 0))
    const { RecentTransactions } = await import('@/app/(protected)/components/recent-transactions')
    render(<RecentTransactions />)
    await waitFor(() => {
      expect(screen.queryByRole('link', { name: /show more/i })).not.toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// Searchable category picker regression in RecentTransactions inline edit
// ---------------------------------------------------------------------------
describe('RecentTransactions — searchable category picker in inline edit', () => {
  it('renders category-search-input (not legacy two-step selects) in edit form', async () => {
    const txWithCat = { ...makeTx('rt1', { payee: 'CatPayee' }), category_id: 'cat-dining' }
    vi.stubGlobal('fetch', makeFetch([txWithCat], 1))

    const { RecentTransactions } = await import('@/app/(protected)/components/recent-transactions')
    render(<RecentTransactions />)

    await waitFor(() => expect(screen.getByText('CatPayee')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }))
    await waitFor(() => expect(screen.getByTestId('category-search-input')).toBeInTheDocument())
    expect(screen.queryByTestId('parent-category-select')).not.toBeInTheDocument()
    expect(screen.queryByTestId('subcategory-select')).not.toBeInTheDocument()
  })
})
