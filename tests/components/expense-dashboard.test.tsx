// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'

const mockDashboardData = {
  total_spend: 1234.56,
  total_income: 5000,
  daily_average: 88.18,
  category_breakdown: [
    { category_name: 'Food', total: 800, pct: 64.8 },
    { category_name: 'Transport', total: 434.56, pct: 35.2 },
  ],
  days_in_range: 14,
  budget_remaining: null,
  range: 'monthly',
  start_date: '2026-04-01T00:00:00+08:00',
  end_date: '2026-04-19T23:59:59+08:00',
}

function mockFetchSuccess() {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(mockDashboardData),
  }))
}

function mockFetchError() {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))
}

beforeEach(() => {
  mockFetchSuccess()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ExpenseDashboard', () => {
  it('renders time range selector with 4 options', async () => {
    const { ExpenseDashboard } = await import('@/app/(protected)/components/expense-dashboard')
    render(<ExpenseDashboard />)
    expect(screen.getByRole('button', { name: 'Daily' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '7-day' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Monthly' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Custom' })).toBeInTheDocument()
  })

  it('shows Monthly as default selected range', async () => {
    const { ExpenseDashboard } = await import('@/app/(protected)/components/expense-dashboard')
    render(<ExpenseDashboard />)
    const monthly = screen.getByRole('button', { name: 'Monthly' })
    expect(monthly).toHaveAttribute('aria-pressed', 'true')
  })

  it('fetches /api/dashboard on mount with range=monthly', async () => {
    const { ExpenseDashboard } = await import('@/app/(protected)/components/expense-dashboard')
    render(<ExpenseDashboard />)
    await waitFor(() => {
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(expect.stringContaining('/api/dashboard?range=monthly'))
    })
  })

  it('displays total spend widget after load', async () => {
    const { ExpenseDashboard } = await import('@/app/(protected)/components/expense-dashboard')
    render(<ExpenseDashboard />)
    await waitFor(() => {
      expect(screen.getByText('1,234.56')).toBeInTheDocument()
    })
  })

  it('displays total income widget after load', async () => {
    const { ExpenseDashboard } = await import('@/app/(protected)/components/expense-dashboard')
    render(<ExpenseDashboard />)
    await waitFor(() => {
      expect(screen.getByText('5,000.00')).toBeInTheDocument()
    })
  })

  it('displays daily average widget after load', async () => {
    const { ExpenseDashboard } = await import('@/app/(protected)/components/expense-dashboard')
    render(<ExpenseDashboard />)
    await waitFor(() => {
      expect(screen.getByText('88.18')).toBeInTheDocument()
    })
  })

  it('displays category breakdown entries', async () => {
    const { ExpenseDashboard } = await import('@/app/(protected)/components/expense-dashboard')
    render(<ExpenseDashboard />)
    await waitFor(() => {
      expect(screen.getByText('Food')).toBeInTheDocument()
      expect(screen.getByText('Transport')).toBeInTheDocument()
    })
  })

  it('displays budget remaining as — when null', async () => {
    const { ExpenseDashboard } = await import('@/app/(protected)/components/expense-dashboard')
    render(<ExpenseDashboard />)
    await waitFor(() => {
      expect(screen.getByText('—')).toBeInTheDocument()
    })
  })

  it('refetches when Daily range button is clicked', async () => {
    const { ExpenseDashboard } = await import('@/app/(protected)/components/expense-dashboard')
    render(<ExpenseDashboard />)
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled())
    vi.mocked(fetch).mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Daily' }))
    await waitFor(() => {
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(expect.stringContaining('range=daily'))
    })
  })

  it('shows Custom date inputs when Custom is selected', async () => {
    const { ExpenseDashboard } = await import('@/app/(protected)/components/expense-dashboard')
    render(<ExpenseDashboard />)
    fireEvent.click(screen.getByRole('button', { name: 'Custom' }))
    await waitFor(() => {
      expect(screen.getByLabelText('Start date')).toBeInTheDocument()
      expect(screen.getByLabelText('End date')).toBeInTheDocument()
    })
  })

  it('shows error state on fetch failure', async () => {
    mockFetchError()
    const { ExpenseDashboard } = await import('@/app/(protected)/components/expense-dashboard')
    render(<ExpenseDashboard />)
    await waitFor(() => {
      expect(screen.getByText(/failed to load/i)).toBeInTheDocument()
    })
  })
})

const mockDrilldownData = {
  category_name: 'Food',
  total: 800,
  tag_breakdown: [
    { tag_name: 'Dining Out', total: 500, pct: 62.5 },
    { tag_name: '(untagged)', total: 300, pct: 37.5 },
  ],
}

function mockDrilldownFetch() {
  vi.mocked(fetch).mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve(mockDrilldownData),
  } as Response)
}

describe('ExpenseDashboard drilldown', () => {
  it('category rows have role="button"', async () => {
    const { ExpenseDashboard } = await import('@/app/(protected)/components/expense-dashboard')
    render(<ExpenseDashboard />)
    await waitFor(() => expect(screen.getByText('Food')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Food' })).toBeInTheDocument()
  })

  it('clicking a category fetches drilldown with drilldown param', async () => {
    const { ExpenseDashboard } = await import('@/app/(protected)/components/expense-dashboard')
    render(<ExpenseDashboard />)
    await waitFor(() => expect(screen.getByText('Food')).toBeInTheDocument())
    mockDrilldownFetch()
    fireEvent.click(screen.getByRole('button', { name: 'Food' }))
    await waitFor(() => {
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(expect.stringContaining('drilldown=Food'))
    })
  })

  it('drilldown fetch includes current range param', async () => {
    const { ExpenseDashboard } = await import('@/app/(protected)/components/expense-dashboard')
    render(<ExpenseDashboard />)
    await waitFor(() => expect(screen.getByText('Food')).toBeInTheDocument())
    mockDrilldownFetch()
    fireEvent.click(screen.getByRole('button', { name: 'Food' }))
    await waitFor(() => {
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(expect.stringContaining('range=monthly'))
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(expect.stringContaining('drilldown=Food'))
    })
  })

  it('shows tag names in drilldown panel after fetch', async () => {
    const { ExpenseDashboard } = await import('@/app/(protected)/components/expense-dashboard')
    render(<ExpenseDashboard />)
    await waitFor(() => expect(screen.getByText('Food')).toBeInTheDocument())
    mockDrilldownFetch()
    fireEvent.click(screen.getByRole('button', { name: 'Food' }))
    await waitFor(() => {
      expect(screen.getByText('Dining Out')).toBeInTheDocument()
      expect(screen.getByText('(untagged)')).toBeInTheDocument()
    })
  })

  it('shows loading skeleton while drilldown fetch is in progress', async () => {
    const { ExpenseDashboard } = await import('@/app/(protected)/components/expense-dashboard')
    render(<ExpenseDashboard />)
    await waitFor(() => expect(screen.getByText('Food')).toBeInTheDocument())
    vi.mocked(fetch).mockReturnValueOnce(new Promise(() => {}) as Promise<Response>)
    fireEvent.click(screen.getByRole('button', { name: 'Food' }))
    expect(screen.getByTestId('drilldown-loading')).toBeInTheDocument()
  })

  it('back button restores category overview', async () => {
    const { ExpenseDashboard } = await import('@/app/(protected)/components/expense-dashboard')
    render(<ExpenseDashboard />)
    await waitFor(() => expect(screen.getByText('Food')).toBeInTheDocument())
    mockDrilldownFetch()
    fireEvent.click(screen.getByRole('button', { name: 'Food' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Food' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument()
    })
  })
})
