// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'

const mockPush = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

const mockDrillData = {
  category_breakdown: [
    { category_id: null, category_name: 'Lunch', total: 500, pct: 62.5, tag_breakdown: [] },
    { category_id: null, category_name: 'Dinner', total: 300, pct: 37.5, tag_breakdown: [] },
  ],
}

// Drill data with real sub-category IDs (for navigation tests)
const mockDrillDataWithIds = {
  category_breakdown: [
    { category_id: 'cat-lunch', category_name: 'Lunch', total: 500, pct: 62.5, tag_breakdown: [] },
    { category_id: 'cat-dinner', category_name: 'Dinner', total: 300, pct: 37.5, tag_breakdown: [] },
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

function mockFetchWithSubIds() {
  vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
    const data = url.includes('parent_category_id') ? mockDrillDataWithIds : mockDashboardData
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
  mockPush.mockClear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ExpenseDashboard', () => {
  it('renders time range selector with 5 options', async () => {
    const { ExpenseDashboard } = await import('@/app/(protected)/components/expense-dashboard')
    render(<ExpenseDashboard />)
    expect(screen.getByRole('button', { name: '1D' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '7D' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '1M' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '3M' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Custom' })).toBeInTheDocument()
  })

  it('shows 1M as default selected range', async () => {
    const { ExpenseDashboard } = await import('@/app/(protected)/components/expense-dashboard')
    render(<ExpenseDashboard />)
    const monthly = screen.getByRole('button', { name: '1M' })
    expect(monthly).toHaveAttribute('aria-pressed', 'true')
  })

  it('fetches /api/dashboard on mount with range=1m', async () => {
    const { ExpenseDashboard } = await import('@/app/(protected)/components/expense-dashboard')
    render(<ExpenseDashboard />)
    await waitFor(() => {
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(expect.stringContaining('/api/dashboard?range=1m'))
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

  it('refetches when 1D range button is clicked', async () => {
    const { ExpenseDashboard } = await import('@/app/(protected)/components/expense-dashboard')
    render(<ExpenseDashboard />)
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled())
    vi.mocked(fetch).mockClear()
    fireEvent.click(screen.getByRole('button', { name: '1D' }))
    await waitFor(() => {
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(expect.stringContaining('range=1d'))
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

  // Drill-down expand/collapse now uses the toggle button (data-testid="category-toggle-{id}")
  it('category toggle button has aria-expanded=false by default', async () => {
    const { ExpenseDashboard } = await import('@/app/(protected)/components/expense-dashboard')
    render(<ExpenseDashboard />)
    await waitFor(() => expect(screen.getByText('Food')).toBeInTheDocument())
    expect(screen.getByTestId('category-toggle-cat-food')).toHaveAttribute('aria-expanded', 'false')
  })

  it('clicking the category toggle button expands its subcategory drilldown', async () => {
    const { ExpenseDashboard } = await import('@/app/(protected)/components/expense-dashboard')
    render(<ExpenseDashboard />)
    await waitFor(() => expect(screen.getByText('Food')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('category-toggle-cat-food'))
    await waitFor(() => {
      expect(screen.getByTestId('category-toggle-cat-food')).toHaveAttribute('aria-expanded', 'true')
    })
    await waitFor(() => {
      expect(screen.getByText('Lunch')).toBeInTheDocument()
      expect(screen.getByText('Dinner')).toBeInTheDocument()
    })
  })

  it('clicking expanded toggle button collapses drilldown', async () => {
    const { ExpenseDashboard } = await import('@/app/(protected)/components/expense-dashboard')
    render(<ExpenseDashboard />)
    await waitFor(() => expect(screen.getByText('Food')).toBeInTheDocument())
    const toggle = screen.getByTestId('category-toggle-cat-food')
    fireEvent.click(toggle)
    await waitFor(() => expect(toggle).toHaveAttribute('aria-expanded', 'true'))
    fireEvent.click(toggle)
    await waitFor(() => expect(toggle).toHaveAttribute('aria-expanded', 'false'))
  })

  it('clicking a different category toggle collapses the previous one', async () => {
    const { ExpenseDashboard } = await import('@/app/(protected)/components/expense-dashboard')
    render(<ExpenseDashboard />)
    await waitFor(() => expect(screen.getByText('Food')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('category-toggle-cat-food'))
    await waitFor(() => expect(screen.getByTestId('category-toggle-cat-food')).toHaveAttribute('aria-expanded', 'true'))
    fireEvent.click(screen.getByTestId('category-toggle-cat-transport'))
    await waitFor(() => {
      expect(screen.getByTestId('category-toggle-cat-food')).toHaveAttribute('aria-expanded', 'false')
      expect(screen.getByTestId('category-toggle-cat-transport')).toHaveAttribute('aria-expanded', 'true')
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


// ---------------------------------------------------------------------------
// Dashboard drill-down navigation
// Clicking Spend/Income boxes and category/subcategory rows navigates to
// /transactions with the current date range and appropriate type/category filters
// ---------------------------------------------------------------------------
describe('ExpenseDashboard - drill-down navigation', () => {
  it('Spend box renders with data-testid="spend-box"', async () => {
    const { ExpenseDashboard } = await import('@/app/(protected)/components/expense-dashboard')
    render(<ExpenseDashboard />)
    await waitFor(() => expect(screen.getByTestId('spend-box')).toBeInTheDocument())
  })

  it('clicking Spend box navigates to /transactions?type=expense with date range', async () => {
    const { ExpenseDashboard } = await import('@/app/(protected)/components/expense-dashboard')
    render(<ExpenseDashboard />)
    await waitFor(() => expect(screen.getByText('1,234.56')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('spend-box'))
    expect(mockPush).toHaveBeenCalledWith(
      '/transactions?type=expense&start=2026-04-01&end=2026-04-19'
    )
  })

  it('Income box renders with data-testid="income-box"', async () => {
    const { ExpenseDashboard } = await import('@/app/(protected)/components/expense-dashboard')
    render(<ExpenseDashboard />)
    await waitFor(() => expect(screen.getByTestId('income-box')).toBeInTheDocument())
  })

  it('clicking Income box navigates to /transactions?type=income with date range', async () => {
    const { ExpenseDashboard } = await import('@/app/(protected)/components/expense-dashboard')
    render(<ExpenseDashboard />)
    await waitFor(() => expect(screen.getByText('5,000.00')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('income-box'))
    expect(mockPush).toHaveBeenCalledWith(
      '/transactions?type=income&start=2026-04-01&end=2026-04-19'
    )
  })

  it('category nav area renders with data-testid="category-nav-{id}"', async () => {
    const { ExpenseDashboard } = await import('@/app/(protected)/components/expense-dashboard')
    render(<ExpenseDashboard />)
    await waitFor(() => expect(screen.getByTestId('category-nav-cat-food')).toBeInTheDocument())
  })

  it('clicking a category nav area navigates to /transactions with category_id and date range', async () => {
    const { ExpenseDashboard } = await import('@/app/(protected)/components/expense-dashboard')
    render(<ExpenseDashboard />)
    await waitFor(() => expect(screen.getByText('Food')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('category-nav-cat-food'))
    expect(mockPush).toHaveBeenCalledWith(
      '/transactions?type=expense&category_id=cat-food&start=2026-04-01&end=2026-04-19'
    )
  })

  it('clicking a subcategory row with a category_id navigates to /transactions', async () => {
    mockFetchWithSubIds()
    const { ExpenseDashboard } = await import('@/app/(protected)/components/expense-dashboard')
    render(<ExpenseDashboard />)
    await waitFor(() => expect(screen.getByText('Food')).toBeInTheDocument())
    // Expand Food drill-down
    fireEvent.click(screen.getByTestId('category-toggle-cat-food'))
    await waitFor(() => expect(screen.getByText('Lunch')).toBeInTheDocument())
    // Click subcategory
    fireEvent.click(screen.getByTestId('subcategory-nav-cat-lunch'))
    expect(mockPush).toHaveBeenCalledWith(
      '/transactions?type=expense&category_id=cat-lunch&start=2026-04-01&end=2026-04-19'
    )
  })

  it('Avg/day box does NOT navigate on click', async () => {
    const { ExpenseDashboard } = await import('@/app/(protected)/components/expense-dashboard')
    render(<ExpenseDashboard />)
    await waitFor(() => expect(screen.getByText('88.18')).toBeInTheDocument())
    // avg/day box is not present as testid="spend-box" or "income-box"
    expect(screen.queryByTestId('avgday-box')).not.toBeInTheDocument()
  })

  it('Budget box does NOT navigate on click', async () => {
    const { ExpenseDashboard } = await import('@/app/(protected)/components/expense-dashboard')
    render(<ExpenseDashboard />)
    await waitFor(() => expect(screen.getByText('—')).toBeInTheDocument())
    expect(screen.queryByTestId('budget-box')).not.toBeInTheDocument()
  })
})
