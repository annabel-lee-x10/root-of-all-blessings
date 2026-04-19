// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ data: sevenTxs, total: 7 }),
  }))
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
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [], total: 0 }),
    }))
    const { RecentTransactions } = await import('@/app/(protected)/components/recent-transactions')
    render(<RecentTransactions />)
    await waitFor(() => {
      expect(screen.getByText(/no transactions yet/i)).toBeInTheDocument()
    })
  })

  it('shows payment_method when present', async () => {
    const txWithPayment = { ...makeTx('pm1'), payment_method: 'credit card' }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [txWithPayment], total: 1 }),
    }))
    const { RecentTransactions } = await import('@/app/(protected)/components/recent-transactions')
    render(<RecentTransactions />)
    await waitFor(() => {
      expect(screen.getByText('credit card')).toBeInTheDocument()
    })
  })

  it('does not show payment_method label when absent', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [makeTx('no-pm')], total: 1 }),
    }))
    const { RecentTransactions } = await import('@/app/(protected)/components/recent-transactions')
    render(<RecentTransactions />)
    await waitFor(() => {
      expect(screen.queryByText(/credit card|debit card|e-wallet|cash/i)).not.toBeInTheDocument()
    })
  })

  it('does not show Show more when no transactions', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [], total: 0 }),
    }))
    const { RecentTransactions } = await import('@/app/(protected)/components/recent-transactions')
    render(<RecentTransactions />)
    await waitFor(() => {
      expect(screen.queryByRole('link', { name: /show more/i })).not.toBeInTheDocument()
    })
  })
})
