// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'

// Mock NewsClient to keep tests fast and focused on PortfolioClient behaviour
vi.mock('@/app/(protected)/news/news-client', () => ({
  NewsClient: ({ sharedTickers }: { sharedTickers?: string[] }) => (
    <div data-testid="news-client">
      News view — tickers: {(sharedTickers ?? []).join(',')}
    </div>
  ),
}))

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => null, // no snapshot
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('PortfolioClient — Dashboard/News toggle', () => {
  it('renders Dashboard and News toggle buttons', async () => {
    const { PortfolioClient } = await import('@/app/(protected)/portfolio/portfolio-client')
    render(<PortfolioClient />)
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled())
    expect(screen.getByRole('button', { name: /^dashboard$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^news$/i })).toBeInTheDocument()
  })

  it('shows Dashboard view (upload panel) by default when no snapshot', async () => {
    const { PortfolioClient } = await import('@/app/(protected)/portfolio/portfolio-client')
    render(<PortfolioClient />)
    await waitFor(() => screen.getByRole('button', { name: /^dashboard$/i }))
    expect(screen.getByText(/no portfolio data yet/i)).toBeInTheDocument()
    expect(screen.queryByTestId('news-client')).not.toBeInTheDocument()
  })

  it('switches to News view when News tab is clicked', async () => {
    const { PortfolioClient } = await import('@/app/(protected)/portfolio/portfolio-client')
    render(<PortfolioClient />)
    await waitFor(() => screen.getByRole('button', { name: /^news$/i }))
    fireEvent.click(screen.getByRole('button', { name: /^news$/i }))
    await waitFor(() => expect(screen.getByTestId('news-client')).toBeInTheDocument())
    expect(screen.queryByText(/no portfolio data yet/i)).not.toBeInTheDocument()
  })

  it('portfolio:open-upload event opens the screenshot upload modal when snapshot exists (BUG-051)', async () => {
    // Provide a minimal snapshot so the has-snapshot branch renders (no inline UploadArea)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 's1', snapshot_date: '2026-04-24T00:00:00Z', snap_label: 'Test', snap_time: null,
        total_value: 1000, unrealised_pnl: null, realised_pnl: null, cash: null, pending: null,
        net_invested: null, net_deposited: null, dividends: null,
        prior_value: null, prior_unrealised: null, prior_realised: null, prior_cash: null, prior_holdings: null,
        holdings: [{ ticker: 'AAPL', name: 'Apple', market_value: 1000, pnl: 0, pnl_pct: 0,
          avg_cost: 200, current_price: 200, units: 5, geo: 'US', sector: 'Technology', currency: 'USD',
          target: null, sell_limit: null, buy_limit: null, is_new: false, approx: false, note: null,
          dividend_amount: null, dividend_date: null }],
        orders: [], realised: [], growth: [], milestones: [],
      }),
    }))
    const { PortfolioClient } = await import('@/app/(protected)/portfolio/portfolio-client')
    render(<PortfolioClient />)
    await waitFor(() => screen.getByRole('button', { name: /^dashboard$/i }))
    // UploadArea should NOT be visible inline in the has-snapshot branch
    expect(screen.queryByText('Upload Syfe Screenshots')).not.toBeInTheDocument()
    // Firing the FAB event should open the modal
    window.dispatchEvent(new CustomEvent('portfolio:open-upload'))
    await waitFor(() => expect(screen.getByText('Upload Syfe Screenshots')).toBeInTheDocument())
  })

  it('NewsClient receives empty sharedTickers (HTML upload flow removed in BUG-046)', async () => {
    const { PortfolioClient } = await import('@/app/(protected)/portfolio/portfolio-client')
    render(<PortfolioClient />)
    await waitFor(() => screen.getByRole('button', { name: /^news$/i }))
    fireEvent.click(screen.getByRole('button', { name: /^news$/i }))
    await waitFor(() => expect(screen.getByTestId('news-client')).toBeInTheDocument())
    // sharedTickers is always [] since HTML upload mechanism is removed
    expect(screen.getByTestId('news-client').textContent).not.toContain('NVDA')
    expect(screen.getByTestId('news-client').textContent).not.toContain('MU')
  })
})
