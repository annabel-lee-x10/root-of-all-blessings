// @vitest-environment jsdom
// Regression tests for BUG-012: the Singapore Property section shows "No stories yet"
// when expanded and does not auto-fetch. After the fix, expanding an empty Property
// section triggers a generate API call to populate it.
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

  it('does not re-fetch when collapsing and re-expanding a Property section that now has stories', async () => {
    // First expand triggers a fetch that populates stories, second expand should not
    const { NewsClient } = await import('@/app/(protected)/news/news-client')
    render(<NewsClient />)

    await waitFor(() => expect(screen.getByText('Singapore Property')).toBeInTheDocument())

    // First expand: empty → triggers fetch
    fireEvent.click(screen.getByText('Singapore Property'))
    await waitFor(() => {
      const calls = fetchMock.mock.calls.filter(c => c[0] === '/api/news/generate').length
      expect(calls).toBeGreaterThan(0)
    })

    const callsAfterFirstOpen = fetchMock.mock.calls.filter(c => c[0] === '/api/news/generate').length

    // Collapse
    fireEvent.click(screen.getByText('Singapore Property'))

    // Re-expand: should NOT trigger another fetch (stories already in state even if [])
    fireEvent.click(screen.getByText('Singapore Property'))

    await new Promise(r => setTimeout(r, 150))

    // No additional generate calls (the section was already opened once; stories are empty
    // but the loading cycle already ran — re-opening should not re-fetch)
    const callsAfterSecondOpen = fetchMock.mock.calls.filter(c => c[0] === '/api/news/generate').length
    expect(callsAfterSecondOpen).toBe(callsAfterFirstOpen)
  })
})
