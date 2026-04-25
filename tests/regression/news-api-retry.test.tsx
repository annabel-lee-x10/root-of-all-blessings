// @vitest-environment jsdom
// Regression tests for BUG-059: anthropicTurn must retry once on 429/5xx API errors,
// and must NOT retry on 400/401/403 or successful responses.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, waitFor, screen } from '@testing-library/react'
import '@testing-library/jest-dom'

function successResponse(text = '[]') {
  return {
    ok: true,
    status: 200,
    json: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text }] }),
  }
}

function errorResponse(status: number) {
  return { ok: false, status, json: async () => ({ error: `HTTP ${status}` }) }
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn().mockImplementation((url: string) => {
    if (url === '/api/news') return Promise.resolve({ ok: true, json: async () => null })
    if (url === '/api/news/generate') return Promise.resolve(successResponse())
    return Promise.resolve({ ok: true, json: async () => ({}) })
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.resetModules()
})

function generateCallCount() {
  return fetchMock.mock.calls.filter((c: unknown[]) => c[0] === '/api/news/generate').length
}

// Render NewsClient, wait for it to be interactive with real timers,
// then switch to fake timers and expand the Property section (fire-and-forget async call).
async function renderAndExpand() {
  const { NewsClient } = await import('@/app/(protected)/news/news-client')
  render(<NewsClient />)
  // Real timers here so waitFor polls correctly while loadBrief() resolves
  await waitFor(() => screen.getByText('Singapore Property'))
  // Switch to fake timers before the click so the 2-second retry delay is controlled
  vi.useFakeTimers()
  fireEvent.click(screen.getByText('Singapore Property'))
}

describe('BUG-059 – anthropicTurn retries once on 429 and 5xx', () => {
  it('retries once on 429 — fetch called twice, second call succeeds', async () => {
    let n = 0
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/news') return Promise.resolve({ ok: true, json: async () => null })
      if (url === '/api/news/generate') {
        n++
        return Promise.resolve(n === 1 ? errorResponse(429) : successResponse())
      }
      return Promise.resolve({ ok: true, json: async () => ({}) })
    })

    await renderAndExpand()
    // First fetch (429) resolves via microtask before runAllTimersAsync starts.
    // runAllTimersAsync fires the faked 2-second delay, then the second fetch resolves.
    await vi.runAllTimersAsync()

    expect(generateCallCount()).toBe(2)
  })

  it('retries once on 500 — fetch called twice, second call succeeds', async () => {
    let n = 0
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/news') return Promise.resolve({ ok: true, json: async () => null })
      if (url === '/api/news/generate') {
        n++
        return Promise.resolve(n === 1 ? errorResponse(500) : successResponse())
      }
      return Promise.resolve({ ok: true, json: async () => ({}) })
    })

    await renderAndExpand()
    await vi.runAllTimersAsync()

    expect(generateCallCount()).toBe(2)
  })

  it('does NOT retry on 400 — fetch called exactly once', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/news') return Promise.resolve({ ok: true, json: async () => null })
      if (url === '/api/news/generate') return Promise.resolve(errorResponse(400))
      return Promise.resolve({ ok: true, json: async () => ({}) })
    })

    await renderAndExpand()
    await vi.runAllTimersAsync()

    expect(generateCallCount()).toBe(1)
  })

  it('successful response passes through without retry — fetch called exactly once', async () => {
    // Default mock already returns a 200 success
    await renderAndExpand()
    await vi.runAllTimersAsync()

    expect(generateCallCount()).toBe(1)
  })
})
