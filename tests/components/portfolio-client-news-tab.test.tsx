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

  it('portfolio:open-upload event triggers file input click', async () => {
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {})
    const { PortfolioClient } = await import('@/app/(protected)/portfolio/portfolio-client')
    render(<PortfolioClient />)
    await waitFor(() => screen.getByRole('button', { name: /^dashboard$/i }))
    window.dispatchEvent(new CustomEvent('portfolio:open-upload'))
    expect(clickSpy).toHaveBeenCalledTimes(1)
    clickSpy.mockRestore()
  })

  it('passes portfolioTickers to NewsClient after successful upload', async () => {
    const mockFetch = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
      if (url === '/api/portfolio/snapshots') return Promise.resolve({ ok: true, json: async () => null })
      if (url === '/api/portfolio' && opts?.method === 'POST') {
        return Promise.resolve({ ok: true, json: async () => ({ holdings_count: 5 }) })
      }
      if (url === '/api/news/upload') {
        return Promise.resolve({ ok: true, json: async () => ({ tickers: ['NVDA', 'MU'] }) })
      }
      return Promise.resolve({ ok: true, json: async () => null })
    })
    vi.stubGlobal('fetch', mockFetch)

    const { PortfolioClient } = await import('@/app/(protected)/portfolio/portfolio-client')
    render(<PortfolioClient />)
    await waitFor(() => screen.getByRole('button', { name: /^news$/i }))

    // Simulate file upload via the hidden input
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['<html><body>portfolio</body></html>'], 'portfolio.html', { type: 'text/html' })
    Object.defineProperty(input, 'files', { value: [file], writable: false, configurable: true })
    fireEvent.change(input)

    // Wait for both API calls
    await waitFor(() =>
      expect(mockFetch.mock.calls.some((c: unknown[]) => c[0] === '/api/news/upload')).toBe(true)
    )

    // Switch to News view and check tickers are passed
    fireEvent.click(screen.getByRole('button', { name: /^news$/i }))
    await waitFor(() =>
      expect(screen.getByTestId('news-client').textContent).toContain('NVDA')
    )
  })
})
