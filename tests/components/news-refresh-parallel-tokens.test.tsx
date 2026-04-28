// @vitest-environment jsdom
// Tests for the parallel news-refresh + token-tracking feature.
//
// Behaviours covered:
//   1. handleRefresh fires all 6 section fetches in parallel via
//      Promise.allSettled — total wall time is the slowest single fetch,
//      not the sum of all fetches. Verified by counting the number of
//      /api/news/generate calls that have been started before any single
//      response resolves: a sequential loop would have called fetch 1×,
//      while parallel fires all 6 immediately.
//
//   2. One section's failure must NOT abort the others (failure isolation).
//      Mock world's generate to reject, all five other sections still post
//      their fresh cards into the DOM and the persisted brief.
//
//   3. The Anthropic API exposes per-turn `usage.input_tokens /
//      output_tokens / cache_*`. agenticLoop sums these across turns and
//      the refresh accumulates them across all 6 sections. The footer of
//      the News tab renders the total after refresh completes.
//
//   4. The token total is persisted alongside the brief (in a `_meta`
//      slot inside brief_json) so it survives reloads — mounting with a
//      pre-populated _meta.tokens shows the footer count without requiring
//      a fresh refresh.
//
// All API calls are mocked — no live Anthropic calls are made.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, waitFor, fireEvent, screen, act } from '@testing-library/react'
import '@testing-library/jest-dom'
import type { QsBriefSections } from '@/lib/types'

const EMPTY_SECTIONS: QsBriefSections = {
  world: [], sg: [], prop: [], jobsGlobal: [], jobsSg: [], port: [],
}

type GenBody = {
  system?: string
  messages?: Array<{ role: string; content: unknown }>
}

function bodyOf(init?: RequestInit): GenBody {
  try { return JSON.parse(String(init?.body ?? '{}')) as GenBody } catch { return {} }
}

function isPortCall(init?: RequestInit): boolean {
  return typeof bodyOf(init).system === 'string'
    && (bodyOf(init).system as string).includes('financial news analyst')
}

type SectionKey = 'world' | 'sg' | 'prop' | 'jobsGlobal' | 'jobsSg' | 'port'

const SECTION_FRAGMENT: Record<Exclude<SectionKey, 'port'>, string> = {
  world: 'world headlines',
  sg: 'Singapore headlines',
  prop: 'Singapore property',
  jobsGlobal: 'global tech layoff',
  jobsSg: 'Singapore tech employment',
}

function detectSection(init?: RequestInit): SectionKey | null {
  if (isPortCall(init)) return 'port'
  const userMsg = bodyOf(init).messages?.[0]
  const content = typeof userMsg?.content === 'string' ? userMsg.content : ''
  for (const [key, frag] of Object.entries(SECTION_FRAGMENT)) {
    if (content.includes(frag)) return key as SectionKey
  }
  return null
}

function endTurn(text: string, usage?: Record<string, number>) {
  return {
    ok: true,
    json: async () => ({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text }],
      ...(usage ? { usage } : {}),
    }),
  }
}

function failResp() {
  return Promise.resolve({
    ok: false,
    status: 500,
    json: async () => ({ error: 'simulated failure' }),
  })
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

// ── default loader: clean DB brief, tickers loaded so port participates ──────
function setupBriefLoader(opts: {
  briefJson?: object | null
  tickers?: string[]
} = {}) {
  const tickers = opts.tickers ?? ['NVDA']
  const briefJson = opts.briefJson === null
    ? null
    : opts.briefJson ?? EMPTY_SECTIONS

  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    if (url === '/api/news' && init?.method !== 'POST') {
      return Promise.resolve({
        ok: true,
        json: async () => briefJson === null ? null : ({
          id: 'brief-1',
          generated_at: new Date().toISOString(),
          brief_json: JSON.stringify(briefJson),
          tickers: tickers.length > 0 ? JSON.stringify(tickers) : null,
        }),
      })
    }
    if (url === '/api/portfolio/snapshots') {
      return Promise.resolve({
        ok: true,
        json: async () => ({ holdings: tickers.map(t => ({ ticker: t })) }),
      })
    }
    if (url === '/api/news' && init?.method === 'POST') {
      return Promise.resolve({ ok: true, json: async () => ({}) })
    }
    return Promise.resolve({ ok: true, json: async () => ({}) })
  })
}

function lastNewsPost(): { brief_json?: unknown } | null {
  const posts = fetchMock.mock.calls.filter(
    c => c[0] === '/api/news' && (c[1] as RequestInit | undefined)?.method === 'POST'
  )
  const last = posts[posts.length - 1]
  if (!last) return null
  try { return JSON.parse(String((last[1] as RequestInit).body)) } catch { return null }
}

describe('NewsClient — parallel refresh + token tracking', () => {
  // ── Test A: parallelism ───────────────────────────────────────────────────
  it('fires all 6 section /api/news/generate calls in parallel before any one resolves', async () => {
    setupBriefLoader({ tickers: ['NVDA'] })

    // Hold every generate call indefinitely so we can observe the call count
    // BEFORE any of them resolve. Sequential code would have called fetch
    // exactly once at this point and be awaiting it; parallel code calls
    // all 6 (5 search sections + port) in the same microtask burst.
    const pendingResolvers: Array<(v: unknown) => void> = []
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/api/news' && init?.method !== 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            id: 'brief-1',
            generated_at: new Date().toISOString(),
            brief_json: JSON.stringify(EMPTY_SECTIONS),
            tickers: JSON.stringify(['NVDA']),
          }),
        })
      }
      if (url === '/api/portfolio/snapshots') {
        return Promise.resolve({ ok: true, json: async () => ({ holdings: [{ ticker: 'NVDA' }] }) })
      }
      if (url === '/api/news/generate') {
        return new Promise(resolve => { pendingResolvers.push(resolve) })
      }
      if (url === '/api/news' && init?.method === 'POST') {
        return Promise.resolve({ ok: true, json: async () => ({}) })
      }
      return Promise.resolve({ ok: true, json: async () => ({}) })
    })

    const { NewsClient } = await import('@/app/(protected)/news/news-client')
    render(<NewsClient />)

    await waitFor(() => expect(screen.getByRole('button', { name: /Refresh/i })).toBeEnabled())

    fireEvent.click(screen.getByRole('button', { name: /Refresh/i }))

    // Allow the synchronous portion of every per-section task to run (each task
    // calls fetch synchronously before its first await).
    await waitFor(() => {
      const generateCalls = fetchMock.mock.calls.filter(c => c[0] === '/api/news/generate').length
      expect(generateCalls).toBe(6)
    }, { timeout: 1000 })

    // Drain pending resolvers so the test doesn't leak open promises.
    for (const r of pendingResolvers) {
      r({ ok: true, json: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: '[]' }] }) })
    }
  })

  // ── Test B: failure isolation ─────────────────────────────────────────────
  it('one failed section does not abort the other 5 — they still post their fresh cards', async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/api/news' && init?.method !== 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            id: 'brief-1',
            generated_at: new Date().toISOString(),
            brief_json: JSON.stringify(EMPTY_SECTIONS),
            tickers: JSON.stringify(['NVDA']),
          }),
        })
      }
      if (url === '/api/portfolio/snapshots') {
        return Promise.resolve({ ok: true, json: async () => ({ holdings: [{ ticker: 'NVDA' }] }) })
      }
      if (url === '/api/news/generate') {
        const section = detectSection(init)
        if (section === 'world') return failResp()
        // every other section returns one usable headline
        const headline = `FRESH-${section}-HEAD`
        return Promise.resolve(endTurn(JSON.stringify([{
          id: `${section}-0`, category: 'X', sentiment: 'neutral',
          headline, catalyst: '', summary: '.', keyPoints: [],
          source: 'Src', url: '',
          ...(section === 'port' ? { ticker: 'NVDA' } : {}),
        }])))
      }
      if (url === '/api/news' && init?.method === 'POST') {
        return Promise.resolve({ ok: true, json: async () => ({}) })
      }
      return Promise.resolve({ ok: true, json: async () => ({}) })
    })

    const { NewsClient } = await import('@/app/(protected)/news/news-client')
    render(<NewsClient />)
    await waitFor(() => expect(screen.getByRole('button', { name: /Refresh/i })).toBeEnabled())

    fireEvent.click(screen.getByRole('button', { name: /Refresh/i }))

    await waitFor(() => expect(lastNewsPost()).not.toBeNull(), { timeout: 8000 })
    await act(async () => { await Promise.resolve() })

    // The 5 sections that didn't fail must have produced fresh cards.
    // Open default-collapsed sections so their cards render.
    fireEvent.click(screen.getByText('Singapore Property'))
    fireEvent.click(screen.getByText('Global Tech Employment'))
    fireEvent.click(screen.getByText('Singapore Tech Jobs'))

    await waitFor(() => {
      expect(screen.getByText('FRESH-sg-HEAD')).toBeInTheDocument()
      expect(screen.getByText('FRESH-prop-HEAD')).toBeInTheDocument()
      expect(screen.getByText('FRESH-jobsGlobal-HEAD')).toBeInTheDocument()
      expect(screen.getByText('FRESH-jobsSg-HEAD')).toBeInTheDocument()
      expect(screen.getByText('FRESH-port-HEAD')).toBeInTheDocument()
    })

    // World failed — it should have no headline rendered for the FRESH variant.
    expect(screen.queryByText('FRESH-world-HEAD')).not.toBeInTheDocument()
  })

  // ── Test C: token total appears in the footer after refresh ───────────────
  it('renders total token count in the footer after refresh completes', async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/api/news' && init?.method !== 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            id: 'brief-1',
            generated_at: new Date().toISOString(),
            brief_json: JSON.stringify(EMPTY_SECTIONS),
            tickers: JSON.stringify(['NVDA']),
          }),
        })
      }
      if (url === '/api/portfolio/snapshots') {
        return Promise.resolve({ ok: true, json: async () => ({ holdings: [{ ticker: 'NVDA' }] }) })
      }
      if (url === '/api/news/generate') {
        // Each call returns 100 input + 50 output = 150 tokens.
        // 6 sections × 150 = 900 total, in 600 / out 300.
        return Promise.resolve(endTurn('[]', { input_tokens: 100, output_tokens: 50 }))
      }
      if (url === '/api/news' && init?.method === 'POST') {
        return Promise.resolve({ ok: true, json: async () => ({}) })
      }
      return Promise.resolve({ ok: true, json: async () => ({}) })
    })

    const { NewsClient } = await import('@/app/(protected)/news/news-client')
    const { container } = render(<NewsClient />)
    await waitFor(() => expect(screen.getByRole('button', { name: /Refresh/i })).toBeEnabled())

    fireEvent.click(screen.getByRole('button', { name: /Refresh/i }))

    await waitFor(() => expect(lastNewsPost()).not.toBeNull(), { timeout: 8000 })
    await act(async () => { await Promise.resolve() })

    // Footer should display the total — assert text fragment is present anywhere
    // in the DOM. Format: "Last refresh: 900 tokens" (with optional commas) and
    // a breakdown that totals to 900.
    await waitFor(() => {
      expect(container.textContent).toMatch(/Last refresh/i)
      expect(container.textContent).toMatch(/900\s*tokens/i)
    })
  })

  // ── Test D: persisted token total survives reload ─────────────────────────
  it('shows persisted token total in footer on initial load (no refresh)', async () => {
    // Simulate a previously-saved brief with _meta.tokens already inside.
    const persisted = {
      ...EMPTY_SECTIONS,
      _meta: {
        tokens: {
          input_tokens: 42180,
          output_tokens: 5058,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
          total: 47238,
        },
      },
    }
    setupBriefLoader({ briefJson: persisted, tickers: [] })

    const { NewsClient } = await import('@/app/(protected)/news/news-client')
    const { container } = render(<NewsClient />)

    await waitFor(() => {
      expect(container.textContent).toMatch(/Last refresh/i)
      // Comma-formatted total (47,238) — accept either with or without commas.
      expect(container.textContent).toMatch(/47[,]?238\s*tokens/i)
    })
  })

  // ── Test E: post body includes _meta.tokens for persistence ──────────────
  it('persists _meta.tokens in the brief_json payload posted to /api/news', async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/api/news' && init?.method !== 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            id: 'brief-1',
            generated_at: new Date().toISOString(),
            brief_json: JSON.stringify(EMPTY_SECTIONS),
            tickers: JSON.stringify(['NVDA']),
          }),
        })
      }
      if (url === '/api/portfolio/snapshots') {
        return Promise.resolve({ ok: true, json: async () => ({ holdings: [{ ticker: 'NVDA' }] }) })
      }
      if (url === '/api/news/generate') {
        return Promise.resolve(endTurn('[]', { input_tokens: 7, output_tokens: 3 }))
      }
      if (url === '/api/news' && init?.method === 'POST') {
        return Promise.resolve({ ok: true, json: async () => ({}) })
      }
      return Promise.resolve({ ok: true, json: async () => ({}) })
    })

    const { NewsClient } = await import('@/app/(protected)/news/news-client')
    render(<NewsClient />)
    await waitFor(() => expect(screen.getByRole('button', { name: /Refresh/i })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: /Refresh/i }))

    await waitFor(() => expect(lastNewsPost()).not.toBeNull(), { timeout: 8000 })

    const body = lastNewsPost() as { brief_json?: { _meta?: { tokens?: { total?: number } } } } | null
    expect(body?.brief_json?._meta?.tokens?.total).toBe(60) // 6 × (7+3)
  })
})
