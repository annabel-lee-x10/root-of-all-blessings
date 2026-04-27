// @vitest-environment jsdom
// Regression tests for BUG-068: News refresh — Portfolio section is special-cased
// outside the main refresh loop. Two consequences:
//   (a) `fresh` is initialized as { ...EMPTY_SECTIONS, port: news.port }, so when
//       portfolioTickers === 0 (no fetch happens) the stale port cards from the
//       previous brief get re-persisted to the DB on every refresh. They never age out.
//   (b) When the portfolio refresh API call fails (caught and swallowed),
//       `fresh.port` is never overwritten, so the stale `news.port` again gets
//       persisted to the DB.
// After the fix, port participates in the unified refresh loop and `fresh.port`
// defaults to [] from EMPTY_SECTIONS, so DB persistence reflects the actual outcome.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, waitFor, fireEvent, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import type { QsNewsCard } from '@/lib/types'

function endTurnResponse(text = '[]') {
  return {
    ok: true,
    json: async () => ({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text }],
    }),
  }
}

function isPortGenerateCall(callArgs: unknown[]): boolean {
  if (callArgs[0] !== '/api/news/generate') return false
  const init = callArgs[1] as RequestInit | undefined
  try {
    const body = JSON.parse(String(init?.body ?? '{}')) as { system?: string }
    return typeof body.system === 'string' && body.system.includes('financial news analyst')
  } catch { return false }
}

function lastNewsPostBody(
  fetchMock: ReturnType<typeof vi.fn>
): { brief_json?: { port?: QsNewsCard[] }; tickers?: string[] } | null {
  const posts = fetchMock.mock.calls.filter(
    c => c[0] === '/api/news' && (c[1] as RequestInit | undefined)?.method === 'POST'
  )
  if (posts.length === 0) return null
  const last = posts[posts.length - 1]
  try {
    return JSON.parse(String((last[1] as RequestInit).body))
  } catch { return null }
}

const STALE_PORT_CARD: QsNewsCard = {
  id: 'port-0',
  category: 'Portfolio',
  sentiment: 'neutral',
  headline: 'NVDA stale headline from 25 Apr',
  catalyst: '',
  summary: 'Old summary.',
  keyPoints: [],
  source: 'Old',
  url: '',
  timestamp: '25 Apr 2026, 09:00 SGT',
  ticker: 'NVDA',
  tickerColor: '#9B6DFF',
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn().mockImplementation((url: string) => {
    if (url === '/api/news') return Promise.resolve({ ok: true, json: async () => null })
    if (url === '/api/portfolio/snapshots')
      return Promise.resolve({ ok: true, json: async () => ({ holdings: [] }) })
    if (url === '/api/news/generate') return Promise.resolve(endTurnResponse())
    return Promise.resolve({ ok: true, json: async () => ({}) })
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('NewsClient – Portfolio in unified refresh loop (BUG-068)', () => {
  it('persists port: [] (not stale cards) when portfolioTickers === 0', async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/api/news' && init?.method !== 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            id: 'brief-1',
            generated_at: new Date().toISOString(),
            brief_json: JSON.stringify({
              world: [], sg: [], prop: [],
              jobsGlobal: [], jobsSg: [],
              port: [STALE_PORT_CARD],
            }),
            tickers: null,
          }),
        })
      }
      if (url === '/api/portfolio/snapshots')
        return Promise.resolve({ ok: true, json: async () => ({ holdings: [] }) })
      if (url === '/api/news/generate') return Promise.resolve(endTurnResponse())
      return Promise.resolve({ ok: true, json: async () => ({}) })
    })

    const { NewsClient } = await import('@/app/(protected)/news/news-client')
    render(<NewsClient />)

    // Wait for initial brief load — the stale port card should render
    await waitFor(() => expect(screen.getByText('Portfolio News')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /Refresh/i }))

    // Wait for the persist POST to /api/news to happen
    await waitFor(
      () => {
        const post = fetchMock.mock.calls.find(
          c => c[0] === '/api/news' && (c[1] as RequestInit | undefined)?.method === 'POST'
        )
        expect(post).toBeDefined()
      },
      { timeout: 5000 }
    )

    const body = lastNewsPostBody(fetchMock)
    expect(body?.brief_json?.port).toEqual([])
  })

  it('persists port: [] (not stale cards) when port refresh API call fails', async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/api/news' && init?.method !== 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            id: 'brief-1',
            generated_at: new Date().toISOString(),
            brief_json: JSON.stringify({
              world: [], sg: [], prop: [],
              jobsGlobal: [], jobsSg: [],
              port: [STALE_PORT_CARD],
            }),
            tickers: JSON.stringify(['NVDA']),
          }),
        })
      }
      if (url === '/api/portfolio/snapshots')
        return Promise.resolve({ ok: true, json: async () => ({ holdings: [{ ticker: 'NVDA' }] }) })
      if (url === '/api/news/generate') {
        const body = JSON.parse(String(init?.body ?? '{}')) as { system?: string }
        const isPort = typeof body.system === 'string' && body.system.includes('financial news analyst')
        if (isPort) {
          return Promise.resolve({
            ok: false,
            status: 500,
            json: async () => ({ error: 'simulated API failure' }),
          })
        }
        return Promise.resolve(endTurnResponse())
      }
      return Promise.resolve({ ok: true, json: async () => ({}) })
    })

    const { NewsClient } = await import('@/app/(protected)/news/news-client')
    render(<NewsClient />)

    await waitFor(() => expect(screen.getByText('Portfolio News')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /Refresh/i }))

    await waitFor(
      () => {
        const post = fetchMock.mock.calls.find(
          c => c[0] === '/api/news' && (c[1] as RequestInit | undefined)?.method === 'POST'
        )
        expect(post).toBeDefined()
      },
      { timeout: 5000 }
    )

    const body = lastNewsPostBody(fetchMock)
    expect(body?.brief_json?.port).toEqual([])
  })

  it('makes exactly one PORT_SYS-using generate call when portfolioTickers > 0', async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/api/news' && init?.method !== 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            id: 'brief-1',
            generated_at: new Date().toISOString(),
            brief_json: JSON.stringify({
              world: [], sg: [], prop: [], jobsGlobal: [], jobsSg: [], port: [],
            }),
            tickers: JSON.stringify(['NVDA', 'MU']),
          }),
        })
      }
      if (url === '/api/portfolio/snapshots')
        return Promise.resolve({
          ok: true,
          json: async () => ({ holdings: [{ ticker: 'NVDA' }, { ticker: 'MU' }] }),
        })
      if (url === '/api/news/generate') return Promise.resolve(endTurnResponse())
      return Promise.resolve({ ok: true, json: async () => ({}) })
    })

    const { NewsClient } = await import('@/app/(protected)/news/news-client')
    render(<NewsClient />)

    await waitFor(() => expect(screen.getByText('Portfolio News')).toBeInTheDocument())

    expect(fetchMock.mock.calls.filter(isPortGenerateCall).length).toBe(0)

    fireEvent.click(screen.getByRole('button', { name: /Refresh/i }))

    await waitFor(
      () => {
        const post = fetchMock.mock.calls.find(
          c => c[0] === '/api/news' && (c[1] as RequestInit | undefined)?.method === 'POST'
        )
        expect(post).toBeDefined()
      },
      { timeout: 5000 }
    )

    expect(fetchMock.mock.calls.filter(isPortGenerateCall).length).toBe(1)
  })

  it('makes zero PORT_SYS-using generate calls when portfolioTickers === 0', async () => {
    const { NewsClient } = await import('@/app/(protected)/news/news-client')
    render(<NewsClient />)

    await waitFor(() => expect(screen.getByText('World Headlines')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /Refresh/i }))

    await waitFor(
      () => {
        const post = fetchMock.mock.calls.find(
          c => c[0] === '/api/news' && (c[1] as RequestInit | undefined)?.method === 'POST'
        )
        expect(post).toBeDefined()
      },
      { timeout: 5000 }
    )

    expect(fetchMock.mock.calls.filter(isPortGenerateCall).length).toBe(0)
  })

  it('updates news.port with fresh per-card timestamps on successful refresh', async () => {
    // When tickers > 0 and the port refresh succeeds, port cards should carry the
    // timestamp generated DURING the refresh (nowSGT()), not the stale timestamps
    // from the DB-loaded brief.
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/api/news' && init?.method !== 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            id: 'brief-1',
            generated_at: new Date().toISOString(),
            brief_json: JSON.stringify({
              world: [], sg: [], prop: [],
              jobsGlobal: [], jobsSg: [],
              port: [STALE_PORT_CARD],
            }),
            tickers: JSON.stringify(['NVDA']),
          }),
        })
      }
      if (url === '/api/portfolio/snapshots')
        return Promise.resolve({ ok: true, json: async () => ({ holdings: [{ ticker: 'NVDA' }] }) })
      if (url === '/api/news/generate') {
        const body = JSON.parse(String(init?.body ?? '{}')) as { system?: string }
        const isPort = typeof body.system === 'string' && body.system.includes('financial news analyst')
        if (isPort) {
          return Promise.resolve(
            endTurnResponse(JSON.stringify([{
              ticker: 'NVDA',
              category: 'Stock',
              sentiment: 'bullish',
              headline: 'NVDA fresh headline',
              catalyst: '',
              summary: 'Fresh summary.',
              keyPoints: [],
              source: 'Reuters',
              url: '',
            }]))
          )
        }
        return Promise.resolve(endTurnResponse())
      }
      return Promise.resolve({ ok: true, json: async () => ({}) })
    })

    const { NewsClient } = await import('@/app/(protected)/news/news-client')
    render(<NewsClient />)

    await waitFor(() => expect(screen.getByText(STALE_PORT_CARD.headline)).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /Refresh/i }))

    // After refresh, the stale headline should be replaced by the fresh one
    await waitFor(
      () => expect(screen.getByText('NVDA fresh headline')).toBeInTheDocument(),
      { timeout: 5000 }
    )

    // And the persisted brief should contain a port card whose timestamp is NOT
    // the stale 25 Apr value (it should be a freshly generated nowSGT string).
    const body = lastNewsPostBody(fetchMock)
    const portCards = body?.brief_json?.port ?? []
    expect(portCards.length).toBe(1)
    expect(portCards[0]?.timestamp).not.toBe(STALE_PORT_CARD.timestamp)
  })
})
