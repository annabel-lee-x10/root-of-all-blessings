// @vitest-environment jsdom
// Regression tests for BUG-025/041/058: Singapore Property section auto-fetch behaviour.
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
    if (url === '/api/news/generate') return Promise.resolve(endTurnResponse())
    return Promise.resolve({ ok: true, json: async () => ({}) })
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('NewsClient – Singapore Property auto-fetch on expand (BUG-012)', () => {
  it('calls /api/news/generate when Singapore Property is expanded with no stories', async () => {
    const { NewsClient } = await import('@/app/(protected)/news/news-client')
    render(<NewsClient />)

    await waitFor(() => expect(screen.getByText('Singapore Property')).toBeInTheDocument())

    const callsBefore = fetchMock.mock.calls.filter(c => c[0] === '/api/news/generate').length
    expect(callsBefore).toBe(0)

    // Expand the collapsed Property section
    fireEvent.click(screen.getByText('Singapore Property'))

    await waitFor(() => {
      const callsAfter = fetchMock.mock.calls.filter(c => c[0] === '/api/news/generate').length
      expect(callsAfter).toBeGreaterThan(callsBefore)
    })
  })

  it('does not call /api/news/generate when Property section already has stories', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/news') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            id: 'brief-1',
            generated_at: new Date().toISOString(),
            brief_json: JSON.stringify({
              world: [], sg: [],
              prop: [{
                id: 'prop-0', category: 'Property', sentiment: 'neutral' as const,
                headline: 'Condo prices hold steady', catalyst: '', summary: 'Summary.',
                keyPoints: [], source: 'ST', url: '', timestamp: 'now',
              }],
              jobsGlobal: [], jobsSg: [], port: [],
            }),
            tickers: null,
          }),
        })
      }
      if (url === '/api/news/generate') return Promise.resolve(endTurnResponse())
      return Promise.resolve({ ok: true, json: async () => ({}) })
    })

    const { NewsClient } = await import('@/app/(protected)/news/news-client')
    render(<NewsClient />)

    await waitFor(() => expect(screen.getByText('Singapore Property')).toBeInTheDocument())

    const callsBefore = fetchMock.mock.calls.filter(c => c[0] === '/api/news/generate').length

    // Expand — section has stories, should NOT trigger a fetch
    fireEvent.click(screen.getByText('Singapore Property'))

    await new Promise(r => setTimeout(r, 150))

    const callsAfter = fetchMock.mock.calls.filter(c => c[0] === '/api/news/generate').length
    expect(callsAfter).toBe(callsBefore)
  })

  it('does NOT trigger a generate call when DB brief already has prop: [] (BUG-041)', async () => {
    // DB brief contains prop: [] — a previous Refresh already ran for property.
    // Opening the section should show "No stories yet" immediately, not skeleton + fetch.
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/news') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            id: 'brief-1',
            generated_at: new Date().toISOString(),
            brief_json: JSON.stringify({
              world: [], sg: [], prop: [], jobsGlobal: [], jobsSg: [], port: [],
            }),
            tickers: null,
          }),
        })
      }
      if (url === '/api/news/generate') return Promise.resolve(endTurnResponse())
      return Promise.resolve({ ok: true, json: async () => ({}) })
    })

    const { NewsClient } = await import('@/app/(protected)/news/news-client')
    render(<NewsClient />)
    await waitFor(() => expect(screen.getByText('Singapore Property')).toBeInTheDocument())

    const callsBefore = fetchMock.mock.calls.filter(c => c[0] === '/api/news/generate').length

    // Expand the collapsed Property section — DB already has prop (empty), so no re-fetch
    fireEvent.click(screen.getByText('Singapore Property'))

    await new Promise(r => setTimeout(r, 150))

    const callsAfter = fetchMock.mock.calls.filter(c => c[0] === '/api/news/generate').length
    expect(callsAfter).toBe(callsBefore)
  })

  it('does not re-fetch when collapsing and re-expanding a Property section that has stories', async () => {
    // When the first open successfully returns stories, re-expanding should not re-fetch
    fetchMock.mockImplementation((url: string, opts?: RequestInit) => {
      if (url === '/api/news') return Promise.resolve({ ok: true, json: async () => null })
      if (url === '/api/news/generate') {
        const body = JSON.parse((opts?.body as string) ?? '{}')
        const userMsg = String((body as { messages?: Array<{ content: unknown }> }).messages?.[0]?.content ?? '')
        if (userMsg.toLowerCase().includes('property') || userMsg.includes('HDB')) {
          return Promise.resolve(endTurnResponse(JSON.stringify([{
            id: 'prop-0', category: 'Property', sentiment: 'neutral' as const,
            headline: 'Condo prices hold steady', catalyst: '', summary: 'Prices stable.',
            keyPoints: [], source: 'ST', url: '', timestamp: 'now',
          }])))
        }
        return Promise.resolve(endTurnResponse())
      }
      return Promise.resolve({ ok: true, json: async () => ({}) })
    })

    const { NewsClient } = await import('@/app/(protected)/news/news-client')
    render(<NewsClient />)

    await waitFor(() => expect(screen.getByText('Singapore Property')).toBeInTheDocument())

    // First expand: triggers fetch and loads a story
    fireEvent.click(screen.getByText('Singapore Property'))
    await waitFor(() => expect(screen.getByText('Condo prices hold steady')).toBeInTheDocument())

    const callsAfterFirstOpen = fetchMock.mock.calls.filter(c => c[0] === '/api/news/generate').length

    // Collapse
    fireEvent.click(screen.getByText('Singapore Property'))

    // Re-expand: should NOT trigger another fetch (stories are loaded)
    fireEvent.click(screen.getByText('Singapore Property'))

    await new Promise(r => setTimeout(r, 150))

    const callsAfterSecondOpen = fetchMock.mock.calls.filter(c => c[0] === '/api/news/generate').length
    expect(callsAfterSecondOpen).toBe(callsAfterFirstOpen)
  })
})

// ── BUG-058 regression ────────────────────────────────────────────────────────
// Three failure modes that left Property permanently showing "No stories yet":
//  1. handleRefresh set propFetchedRef=true unconditionally (even with 0 cards)
//  2. handlePropOpen set propFetchedRef=true at start and never reset it on empty
//  3. No retry when the model returned prose instead of a JSON array
describe('NewsClient – Singapore Property permanent "No stories yet" (BUG-058)', () => {
  function propQuery(msg: string) {
    return msg.toLowerCase().includes('property') || msg.includes('HDB')
  }

  it('property section triggers a fetch after Refresh returned 0 prop cards', async () => {
    fetchMock.mockImplementation((url: string, opts?: RequestInit) => {
      if (url === '/api/news') return Promise.resolve({ ok: true, json: async () => null })
      if (url === '/api/news/generate') {
        const body = JSON.parse((opts?.body as string) ?? '{}')
        const userMsg = String((body as { messages?: Array<{ content: unknown }> }).messages?.[0]?.content ?? '')
        if (propQuery(userMsg)) return Promise.resolve(endTurnResponse('[]'))
        return Promise.resolve(endTurnResponse(JSON.stringify([{
          id: 'w1', category: 'World', sentiment: 'neutral' as const,
          headline: 'Markets update', catalyst: '', summary: 'Summary.',
          keyPoints: [], source: 'Reuters', url: '', timestamp: 'now',
        }])))
      }
      return Promise.resolve({ ok: true, json: async () => null })
    })

    const { NewsClient } = await import('@/app/(protected)/news/news-client')
    render(<NewsClient />)
    await waitFor(() => expect(screen.getByText('↻ Refresh')).toBeInTheDocument())

    fireEvent.click(screen.getByText('↻ Refresh'))
    // Wait for all sections to finish (button re-enables after setRefreshing(false))
    await waitFor(
      () => expect(screen.getByRole('button', { name: '↻ Refresh' })).not.toBeDisabled(),
      { timeout: 10000 },
    )

    const callsAfterRefresh = fetchMock.mock.calls.filter(c => c[0] === '/api/news/generate').length

    // Expand Property section — must trigger handlePropOpen because prop got 0 cards
    fireEvent.click(screen.getByText('Singapore Property'))

    await waitFor(() => {
      const newCalls = fetchMock.mock.calls.filter(c => c[0] === '/api/news/generate').length
      expect(newCalls).toBeGreaterThan(callsAfterRefresh)
    }, { timeout: 5000 })
  })

  it('property section can be re-fetched after auto-fetch returns 0 cards', async () => {
    // Default mock returns '[]' — parseArr returns [], no retry (starts with '['),
    // but Fix 2 resets propFetchedRef so the next expand can retry.
    const { NewsClient } = await import('@/app/(protected)/news/news-client')
    render(<NewsClient />)
    await waitFor(() => expect(screen.getByText('Singapore Property')).toBeInTheDocument())

    // First expand — handlePropOpen fires, returns 0 cards
    fireEvent.click(screen.getByText('Singapore Property'))
    await waitFor(() =>
      expect(fetchMock.mock.calls.filter(c => c[0] === '/api/news/generate').length).toBeGreaterThan(0),
    )
    // Allow React to flush the setLoadingSections(false) state update
    await new Promise(r => setTimeout(r, 50))

    const callsAfterFirstOpen = fetchMock.mock.calls.filter(c => c[0] === '/api/news/generate').length

    // Collapse then re-expand — should fire handlePropOpen again (propFetchedRef was reset)
    fireEvent.click(screen.getByText('Singapore Property'))
    fireEvent.click(screen.getByText('Singapore Property'))

    await waitFor(() => {
      const newCalls = fetchMock.mock.calls.filter(c => c[0] === '/api/news/generate').length
      expect(newCalls).toBeGreaterThan(callsAfterFirstOpen)
    }, { timeout: 5000 })
  })

  it('retries once when agenticLoop returns unparseable prose and uses retry result', async () => {
    let propCallCount = 0
    fetchMock.mockImplementation((url: string, opts?: RequestInit) => {
      if (url === '/api/news') return Promise.resolve({ ok: true, json: async () => null })
      if (url === '/api/news/generate') {
        const body = JSON.parse((opts?.body as string) ?? '{}')
        const userMsg = String((body as { messages?: Array<{ content: unknown }> }).messages?.[0]?.content ?? '')
        if (propQuery(userMsg)) {
          propCallCount++
          if (propCallCount === 1) {
            // Prose response — parseArr returns [], raw does not start with '['
            return Promise.resolve(endTurnResponse('I searched for property news but could not format results.'))
          }
          // Retry: valid JSON
          return Promise.resolve(endTurnResponse(JSON.stringify([{
            id: 'prop-0', category: 'Property', sentiment: 'neutral' as const,
            headline: 'Condo prices hold steady', catalyst: '', summary: 'Prices stable.',
            keyPoints: [], source: 'ST', url: '', timestamp: 'now',
          }])))
        }
        return Promise.resolve(endTurnResponse('[]'))
      }
      return Promise.resolve({ ok: true, json: async () => null })
    })

    const { NewsClient } = await import('@/app/(protected)/news/news-client')
    render(<NewsClient />)
    await waitFor(() => expect(screen.getByText('Singapore Property')).toBeInTheDocument())

    fireEvent.click(screen.getByText('Singapore Property'))

    // Story from the retry must appear
    await waitFor(
      () => expect(screen.getByText('Condo prices hold steady')).toBeInTheDocument(),
      { timeout: 5000 },
    )
    expect(propCallCount).toBe(2)
  })
})
