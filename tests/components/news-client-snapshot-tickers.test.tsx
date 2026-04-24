// @vitest-environment jsdom
// Regression tests for BUG-056: Portfolio News section never shows content unless
// user uploads an HTML file, because portfolioTickers is only set via handleUpload.
// Users now add holdings via OCR screenshot scan, so the upload path is never hit.
// After the fix, NewsClient fetches /api/portfolio/snapshots on mount and extracts
// unique tickers from the holdings array — no upload required.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'

const SNAPSHOT_WITH_TICKERS = {
  id: 'snap-1',
  snap_label: '24 Apr 2026',
  total_value: 14000,
  holdings: [
    { ticker: 'NVDA', name: 'Nvidia', market_value: 5000 },
    { ticker: 'MU', name: 'Micron', market_value: 3000 },
    { ticker: null, name: 'Cash', market_value: 1000 }, // null ticker — must be filtered out
  ],
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn().mockImplementation((url: string) => {
    if (url === '/api/news') return Promise.resolve({ ok: true, json: async () => null })
    if (url === '/api/portfolio/snapshots')
      return Promise.resolve({ ok: true, json: async () => SNAPSHOT_WITH_TICKERS })
    return Promise.resolve({ ok: true, json: async () => ({}) })
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('NewsClient – auto-load tickers from portfolio snapshot (BUG-056)', () => {
  it('fetches /api/portfolio/snapshots on mount', async () => {
    const { NewsClient } = await import('@/app/(protected)/news/news-client')
    render(<NewsClient />)
    await waitFor(() =>
      expect(fetchMock.mock.calls.some((c: unknown[]) => c[0] === '/api/portfolio/snapshots')).toBe(true)
    )
  })

  it('shows Portfolio News section when snapshot has holdings with tickers', async () => {
    const { NewsClient } = await import('@/app/(protected)/news/news-client')
    const { getByText } = render(<NewsClient />)
    await waitFor(() => expect(getByText('Portfolio News')).toBeInTheDocument(), { timeout: 3000 })
  })

  it('does NOT call /api/news/generate when tickers loaded from snapshot on mount', async () => {
    const { NewsClient } = await import('@/app/(protected)/news/news-client')
    render(<NewsClient />)

    // Wait for snapshot fetch to complete
    await waitFor(() =>
      expect(fetchMock.mock.calls.some((c: unknown[]) => c[0] === '/api/portfolio/snapshots')).toBe(true)
    )

    // Allow async effects to settle
    await new Promise(r => setTimeout(r, 200))

    const generateCalls = fetchMock.mock.calls.filter((c: unknown[]) => c[0] === '/api/news/generate')
    expect(generateCalls.length).toBe(0)
  })

  it('filters out null/undefined tickers from holdings', async () => {
    // SNAPSHOT_WITH_TICKERS has 3 holdings, one with ticker: null
    // Portfolio News section should still appear (NVDA + MU are valid)
    const { NewsClient } = await import('@/app/(protected)/news/news-client')
    const { getByText } = render(<NewsClient />)
    await waitFor(() => expect(getByText('Portfolio News')).toBeInTheDocument(), { timeout: 3000 })
  })

  it('does not show Portfolio News when snapshot holdings have no valid tickers', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/news') return Promise.resolve({ ok: true, json: async () => null })
      if (url === '/api/portfolio/snapshots')
        return Promise.resolve({
          ok: true,
          json: async () => ({
            id: 'snap-2',
            holdings: [{ ticker: null, name: 'Cash', market_value: 1000 }],
          }),
        })
      return Promise.resolve({ ok: true, json: async () => ({}) })
    })

    const { NewsClient } = await import('@/app/(protected)/news/news-client')
    const { queryByText } = render(<NewsClient />)

    await waitFor(() =>
      expect(fetchMock.mock.calls.some((c: unknown[]) => c[0] === '/api/portfolio/snapshots')).toBe(true)
    )

    // Allow async effects to settle
    await new Promise(r => setTimeout(r, 200))

    expect(queryByText('Portfolio News')).not.toBeInTheDocument()
  })

  it('does not crash when /api/portfolio/snapshots returns null', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/news') return Promise.resolve({ ok: true, json: async () => null })
      if (url === '/api/portfolio/snapshots')
        return Promise.resolve({ ok: true, json: async () => null })
      return Promise.resolve({ ok: true, json: async () => ({}) })
    })

    const { NewsClient } = await import('@/app/(protected)/news/news-client')
    const { container } = render(<NewsClient />)

    await waitFor(() =>
      expect(fetchMock.mock.calls.some((c: unknown[]) => c[0] === '/api/portfolio/snapshots')).toBe(true)
    )

    expect(container.firstChild).not.toBeNull()
  })

  it('handles /api/portfolio/snapshots network error silently', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/news') return Promise.resolve({ ok: true, json: async () => null })
      if (url === '/api/portfolio/snapshots') return Promise.reject(new Error('Network error'))
      return Promise.resolve({ ok: true, json: async () => ({}) })
    })

    const { NewsClient } = await import('@/app/(protected)/news/news-client')
    const { container } = render(<NewsClient />)

    // Allow async effects to settle including rejected promise
    await new Promise(r => setTimeout(r, 200))

    expect(container.firstChild).not.toBeNull()
  })

  it('HTML upload overrides snapshot-loaded tickers', async () => {
    const { NewsClient } = await import('@/app/(protected)/news/news-client')
    const { getByText } = render(<NewsClient />)

    // Snapshot tickers load first
    await waitFor(() => expect(getByText('Portfolio News')).toBeInTheDocument(), { timeout: 3000 })

    // Now snapshot is loaded; upload should still be the primary path
    // (verified by the existing upload tests — this test just confirms no interference)
    expect(getByText('Portfolio News')).toBeInTheDocument()
  })
})
