// @vitest-environment jsdom
// BUG-066: Stale date subtitle under "QS Daily Brief" title misled users into
// thinking news was current when it was from a previous day. The subtitle line
// `{count} stories · {date}, {time} SGT` must not render. Title and filter pills stay.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'

const FIXED_GENERATED_AT = '2026-04-25T08:23:00+08:00'

const BRIEF_WITH_DATE = {
  id: 'brief-1',
  generated_at: FIXED_GENERATED_AT,
  brief_json: JSON.stringify({
    world: [
      {
        id: 'world-0',
        category: 'World',
        sentiment: 'neutral',
        headline: 'A test headline',
        catalyst: 'A test catalyst',
        summary: 'A test summary.',
        keyPoints: [],
        source: 'Reuters',
        url: '',
        timestamp: FIXED_GENERATED_AT,
      },
    ],
    sg: [], prop: [], jobsGlobal: [], jobsSg: [], port: [],
  }),
  tickers: null,
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => BRIEF_WITH_DATE,
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('NewsClient — stale date subtitle removed (BUG-066)', () => {
  it('does not render the "{count} stories · {date} SGT" subtitle line', async () => {
    const { NewsClient } = await import('@/app/(protected)/news/news-client')
    const { container } = render(<NewsClient />)
    await waitFor(() => {
      expect(container.textContent).toContain('QS Daily Brief')
    })
    expect(container.textContent).not.toMatch(/\d+\s+stories\s+·/)
    expect(container.textContent).not.toContain('SGT')
  })

  it('still renders the QS Daily Brief title', async () => {
    const { NewsClient } = await import('@/app/(protected)/news/news-client')
    const { container } = render(<NewsClient />)
    await waitFor(() => {
      expect(container.textContent).toContain('QS Daily Brief')
    })
  })

  it('still renders the sentiment filter pills (All / Bullish / Bearish / Neutral)', async () => {
    const { NewsClient } = await import('@/app/(protected)/news/news-client')
    const { container } = render(<NewsClient />)
    await waitFor(() => {
      expect(container.textContent).toContain('QS Daily Brief')
    })
    const text = container.textContent || ''
    expect(text.toLowerCase()).toContain('all')
    expect(text.toLowerCase()).toContain('bullish')
    expect(text.toLowerCase()).toContain('bearish')
    expect(text.toLowerCase()).toContain('neutral')
  })
})
