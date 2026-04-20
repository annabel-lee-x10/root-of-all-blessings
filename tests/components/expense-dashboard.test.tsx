// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'

const mockDrillData = {
  category_breakdown: [
    { category_id: null, category_name: 'Lunch', total: 500, pct: 62.5, tag_breakdown: [] },
    { category_id: null, category_name: 'Dinner', total: 300, pct: 37.5, tag_breakdown: [] },
  ],
}

const mockDashboardData = {
  total_spend: 1234.56,
  total_income: 5000,
  daily_average: 88.18,
  category_breakdown: [
    {
      category_id: 'cat-food',
      category_name: 'Food',
      total: 800,
      pct: 64.8,
      tag_breakdown: [
        { tag_name: 'Lunch', total: 500 },
        { tag_name: 'Dinner', total: 300 },
      ],
    },
    {
      category_id: 'cat-transport',
      category_name: 'Transport',
      total: 434.56,
      pct: 35.2,
      tag_breakdown: [
        { tag_name: 'Untagged', total: 434.56 },
      ],
    },
  ],
  days_in_range: 14,
  budget_remaining: null,
  range: 'monthly',
  start_date: '2026-04-01T00:00:00+08:00',
  end_date: '2026-04-19T23:59:59+08:00',
}

function mockFetchSuccess() {
  vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
    const data = url.includes('parent_category_id') ? mockDrillData : mockDashboardData
    return Promise.resolve({ ok: true, json: () => Promise.resolve(data) })
  }))
}

function mockFetchError() {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))
}

const emptyDashboardData = {
  total_spend: 0,
  total_income: 0,
  daily_average: 0,
  category_breakdown: [],
  days_in_range: 19,
  budget_remaining: null,
  range: 'monthly',
  start_date: '2026-04-01T00:00:00+08:00',
  end_date: '2026-04-19T23:59:59+08:00',
}

function mockFetchEmpty() {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(emptyDashboardData),
  }))
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
      expect(screen.getByText('--')).toBeInTheDocument()
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

  it('category bar has aria-expanded=false by default', async () => {
    const { ExpenseDashboard } = await import('@/app/(protected)/components/expense-dashboard')
    render(<ExpenseDashboard />)
    await waitFor(() => expect(screen.getByText('Food')).toBeInTheDocument())
    const foodBtn = screen.getByRole('button', { name: /food/i })
    expect(foodBtn).toHaveAttribute('aria-expanded', 'false')
  })

  it('clicking a category bar expands its subcategory drilldown', async () => {
    const { ExpenseDashboard } = await import('@/app/(protected)/components/expense-dashboard')
    render(<ExpenseDashboard />)
    await waitFor(() => expect(screen.getByText('Food')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /food/i }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /food/i })).toHaveAttribute('aria-expanded', 'true')
    })
    await waitFor(() => {
      expect(screen.getByText('Lunch')).toBeInTheDocument()
      expect(screen.getByText('Dinner')).toBeInTheDocument()
    })
  })

  it('clicking expanded category bar collapses it', async () => {
    const { ExpenseDashboard } = await import('@/app/(protected)/components/expense-dashboard')
    render(<ExpenseDashboard />)
    await waitFor(() => expect(screen.getByText('Food')).toBeInTheDocument())
    const foodBtn = screen.getByRole('button', { name: /food/i })
    fireEvent.click(foodBtn)
    await waitFor(() => {
      expect(foodBtn).toHaveAttribute('aria-expanded', 'true')
    })
    fireEvent.click(foodBtn)
    await waitFor(() => {
      expect(foodBtn).toHaveAttribute('aria-expanded', 'false')
    })
  })

  it('clicking a different category collapses the previous one', async () => {
    const { ExpenseDashboard } = await import('@/app/(protected)/components/expense-dashboard')
    render(<ExpenseDashboard />)
    await waitFor(() => expect(screen.getByText('Food')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /food/i }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /food/i })).toHaveAttribute('aria-expanded', 'true')
    })
    fireEvent.click(screen.getByRole('button', { name: /transport/i }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /food/i })).toHaveAttribute('aria-expanded', 'false')
      expect(screen.getByRole('button', { name: /transport/i })).toHaveAttribute('aria-expanded', 'true')
    })
  })
})


describe('ExpenseDashboard - empty state (BUG-005)', () => {
  beforeEach(() => {
    mockFetchEmpty()
  })

  it('shows a no-data message when all values are zero (regression: was showing error)', async () => {
    const { ExpenseDashboard } = await import('@/app/(protected)/components/expense-dashboard')
    render(<ExpenseDashboard />)
    await waitFor(() => {
      expect(screen.getByText(/no transactions/i)).toBeInTheDocument()
    })
  })

  it('does not show the error banner when data loads but is all zero', async () => {
    const { ExpenseDashboard } = await import('@/app/(protected)/components/expense-dashboard')
    render(<ExpenseDashboard />)
    await waitFor(() => {
      expect(screen.queryByText(/failed to load/i)).not.toBeInTheDocument()
    })
  })
})
