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

  it('NewsClient receives empty sharedTickers (HTML upload flow removed in BUG-046)', async () => {
    const { PortfolioClient } = await import('@/app/(protected)/portfolio/portfolio-client')
    render(<PortfolioClient />)
    await waitFor(() => screen.getByRole('button', { name: /^news$/i }))
    fireEvent.click(screen.getByRole('button', { name: /^news$/i }))
    await waitFor(() => expect(screen.getByTestId('news-client')).toBeInTheDocument())
    expect(screen.getByTestId('news-client').textContent).not.toContain('NVDA')
    expect(screen.getByTestId('news-client').textContent).not.toContain('MU')
  })
})
