// @vitest-environment jsdom
// Regression test for BUG-004: cached news cards render raw <cite> tags as visible text.
// stripCiteTags is applied in mapCard() for freshly fetched data, but old DB entries
// pass through loadBrief() → JSON.parse() → setNews() without stripping, reaching
// NewsCard render with the raw annotation still in the string.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, waitFor, fireEvent, screen } from '@testing-library/react'
import '@testing-library/jest-dom'

const BRIEF_WITH_CITE_TAGS = {
  id: 'brief-1',
  generated_at: new Date().toISOString(),
  brief_json: JSON.stringify({
    world: [
      {
        id: 'world-0',
        category: 'World',
        sentiment: 'neutral',
        headline: 'Central banks hold steady',
        catalyst: 'Inflation data <cite index="1">eased</cite> in March',
        summary: 'The Fed <cite index="1-19,1-20">maintained</cite> its target rate.',
        keyPoints: ['Key point <cite index="2">here</cite>'],
        source: 'Reuters',
        url: '',
        timestamp: '19 Apr 2026, 09:00 SGT',
      },
    ],
    sg: [], prop: [], jobsGlobal: [], jobsSg: [], port: [],
  }),
  tickers: null,
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => BRIEF_WITH_CITE_TAGS,
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('NewsClient - cite tag render-layer stripping (BUG-004)', () => {
  it('does not render raw <cite> tag markup as visible text in summary', async () => {
    const { NewsClient } = await import('@/app/(protected)/news/news-client')
    const { container } = render(<NewsClient />)
    await waitFor(() => {
      // Card headline confirms the card rendered
      expect(container.textContent).toContain('Central banks hold steady')
    })
    expect(container.textContent).not.toContain('<cite')
  })

  it('does not render raw <cite> tag markup as visible text in catalyst', async () => {
    const { NewsClient } = await import('@/app/(protected)/news/news-client')
    const { container } = render(<NewsClient />)
    await waitFor(() => {
      expect(container.textContent).toContain('eased')
    })
    expect(container.textContent).not.toContain('<cite')
  })

  it('does not render raw <cite> tag markup as visible text in key points', async () => {
    const { NewsClient } = await import('@/app/(protected)/news/news-client')
    const { container } = render(<NewsClient />)
    // Expand key points (collapsed by default)
    await waitFor(() => expect(screen.getByText(/key points/i)).toBeInTheDocument())
    fireEvent.click(screen.getByText(/key points/i))
    await waitFor(() => {
      expect(container.textContent).toContain('Key point')
    })
    expect(container.textContent).not.toContain('<cite')
  })

  it('preserves the inner text of cite tags when stripping', async () => {
    const { NewsClient } = await import('@/app/(protected)/news/news-client')
    const { container } = render(<NewsClient />)
    await waitFor(() => {
      // "maintained" was inside <cite> — it should still be visible
      expect(container.textContent).toContain('maintained')
      // "eased" was inside <cite> in catalyst
      expect(container.textContent).toContain('eased')
    })
  })
})
