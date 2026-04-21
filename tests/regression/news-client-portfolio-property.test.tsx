// @vitest-environment jsdom
// Regression tests for:
//   BUG-012 — Portfolio section hidden when no tickers/port news (nav link broken)
//   BUG-013 — Property section defaultOpen=false hides stories on initial load
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'

vi.mock('@/app/(protected)/components/toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

const WORLD_CARD = {
  id: 'world-0',
  category: 'World',
  sentiment: 'neutral',
  headline: 'Central banks hold rates steady',
  catalyst: '',
  summary: 'Fed held rates at 4.5%.',
  keyPoints: [],
  source: 'Reuters',
  url: '',
  timestamp: '21 Apr 2026, 09:00 SGT',
}

const PROP_CARD = {
  id: 'prop-0',
  category: 'Property',
  sentiment: 'bullish',
  headline: 'HDB resale prices rise 3% in Q1',
  catalyst: 'Strong demand from upgraders',
  summary: 'HDB resale flat prices rose 3% quarter-on-quarter in Q1 2026.',
  keyPoints: ['Upgrader demand strong', 'New launches sold out'],
  source: 'Straits Times',
  url: '',
  timestamp: '21 Apr 2026, 10:00 SGT',
}

const PORT_CARD = {
  id: 'port-0',
  ticker: 'NVDA',
  category: 'Technology',
  sentiment: 'bullish',
  headline: 'NVDA beats earnings estimates',
  catalyst: 'AI revenue surges',
  summary: 'NVIDIA reported record quarterly revenue driven by data-centre AI demand.',
  keyPoints: [],
  source: 'Bloomberg',
  url: '',
  timestamp: '21 Apr 2026, 10:30 SGT',
}

function makeBrief(overrides: Record<string, unknown> = {}) {
  return {
    id: 'brief-1',
    generated_at: new Date().toISOString(),
    brief_json: JSON.stringify({
      world: [WORLD_CARD],
      sg: [],
      prop: [],
      jobsGlobal: [],
      jobsSg: [],
      port: [],
      ...overrides,
    }),
    tickers: null,
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

// ── BUG-012: Portfolio section always rendered ────────────────────────────────

describe('NewsClient – BUG-012: Portfolio section visibility', () => {
  it('renders Portfolio News section header even when there are no tickers and no port news', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeBrief(), // no port data, no tickers
    }))

    const { NewsClient } = await import('@/app/(protected)/news/news-client')
    render(<NewsClient />)

    await waitFor(() =>
      expect(screen.getByText('Central banks hold rates steady')).toBeInTheDocument()
    )

    expect(screen.getByText('Portfolio News')).toBeInTheDocument()
  })

  it('shows an inline "+ Upload Portfolio" button inside the Portfolio News section when there are no tickers', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeBrief(),
    }))

    const { NewsClient } = await import('@/app/(protected)/news/news-client')
    render(<NewsClient />)

    await waitFor(() =>
      expect(screen.getByText('Central banks hold rates steady')).toBeInTheDocument()
    )

    // The portfolio section shows a dedicated upload button (distinct from the sub-nav button)
    expect(screen.getByRole('button', { name: /\+ upload portfolio/i })).toBeInTheDocument()
  })

  it('shows portfolio news cards when port data is present in the brief', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeBrief({ port: [PORT_CARD] }),
    }))

    const { NewsClient } = await import('@/app/(protected)/news/news-client')
    render(<NewsClient />)

    await waitFor(() =>
      expect(screen.getByText('NVDA beats earnings estimates')).toBeInTheDocument()
    )
  })
})

// ── BUG-013: Property section open by default ─────────────────────────────────

describe('NewsClient – BUG-013: Property section defaultOpen', () => {
  it('shows Property stories immediately on load (no click required) when brief has prop news', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeBrief({ prop: [PROP_CARD] }),
    }))

    const { NewsClient } = await import('@/app/(protected)/news/news-client')
    render(<NewsClient />)

    await waitFor(() =>
      expect(screen.getByText('HDB resale prices rise 3% in Q1')).toBeInTheDocument()
    )
  })

  it('Property section header is always in the document', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeBrief(),
    }))

    const { NewsClient } = await import('@/app/(protected)/news/news-client')
    render(<NewsClient />)

    await waitFor(() =>
      expect(screen.getByText('Central banks hold rates steady')).toBeInTheDocument()
    )

    expect(screen.getByText('Singapore Property')).toBeInTheDocument()
  })
})
