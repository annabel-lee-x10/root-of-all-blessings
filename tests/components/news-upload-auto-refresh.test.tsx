// @vitest-environment jsdom
// Regression tests for BUG-011: uploading a portfolio HTML does not auto-trigger
// portfolio news generation, leaving the Portfolio tab empty until the user manually
// clicks Refresh. After the fix, a successful upload with tickers immediately kicks
// off portfolio news generation.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, waitFor, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'

function endTurnResponse(text = '[]') {
  return {
    ok: true,
    json: async () => ({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text }],
    }),
  }
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn().mockImplementation((url: string) => {
    if (url === '/api/news') return Promise.resolve({ ok: true, json: async () => null })
    if (url === '/api/news/upload')
      return Promise.resolve({ ok: true, json: async () => ({ tickers: ['NVDA', 'MU'] }) })
    if (url === '/api/news/generate') return Promise.resolve(endTurnResponse())
    return Promise.resolve({ ok: true, json: async () => ({}) })
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

function simulateUpload(html: string, filename = 'portfolio.html') {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement
  if (!input) throw new Error('file input not found')
  const file = new File([html], filename, { type: 'text/html' })
  Object.defineProperty(input, 'files', { value: [file], writable: false, configurable: true })
  fireEvent.change(input)
}

describe('NewsClient – upload auto-triggers portfolio refresh (BUG-011)', () => {
  it('calls /api/news/generate for portfolio news after a successful upload with tickers', async () => {
    const { NewsClient } = await import('@/app/(protected)/news/news-client')
    render(<NewsClient />)

    await waitFor(() => expect(screen.getByText('Upload Portfolio')).toBeInTheDocument())

    const generateCallsBefore = fetchMock.mock.calls.filter(c => c[0] === '/api/news/generate').length
    expect(generateCallsBefore).toBe(0)

    simulateUpload('<html><table><tr><td>NVDA</td><td>MU</td></tr></table></html>')

    // Upload route call must happen first
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(c => c[0] === '/api/news/upload')).toBe(true)
    )

    // Then a portfolio generate call should follow
    await waitFor(() => {
      const generateCalls = fetchMock.mock.calls.filter(c => c[0] === '/api/news/generate')
      expect(generateCalls.length).toBeGreaterThan(generateCallsBefore)
    })
  })

  it('does not call /api/news/generate when upload returns zero tickers', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/news') return Promise.resolve({ ok: true, json: async () => null })
      if (url === '/api/news/upload')
        return Promise.resolve({ ok: true, json: async () => ({ tickers: [] }) })
      if (url === '/api/news/generate') return Promise.resolve(endTurnResponse())
      return Promise.resolve({ ok: true, json: async () => ({}) })
    })

    const { NewsClient } = await import('@/app/(protected)/news/news-client')
    render(<NewsClient />)

    await waitFor(() => expect(screen.getByText('Upload Portfolio')).toBeInTheDocument())

    simulateUpload('<html><body>No tickers here</body></html>', 'empty.html')

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(c => c[0] === '/api/news/upload')).toBe(true)
    )

    // Give time for any async side effects
    await new Promise(r => setTimeout(r, 150))

    const generateCalls = fetchMock.mock.calls.filter(c => c[0] === '/api/news/generate')
    expect(generateCalls.length).toBe(0)
  })
})
