// @vitest-environment jsdom
// Regression tests for BUG-069: News refresh leaves stale cards in the rendered
// DOM on two failure paths in `app/(protected)/news/news-client.tsx`'s refresh loop:
//
//   (a) Skip path — `if (key === 'port' && portfolioTickers.length === 0) continue`
//       skips before any setNews call, so `news.port` keeps its mount-time
//       (stale) value and the cards stay visible after Refresh completes.
//   (b) Catch path — when `agenticLoop` throws (network/API error), the catch
//       only logs and never clears `news[key]`, so any of the 6 sections can
//       retain its mount-time stale cards in the DOM after a failed refresh.
//
// PR #118 (BUG-068) only fixed DB persistence; the UI state updates were never
// added, so users still see stale "25 Apr" cards after Refresh.
//
// Each test seeds the brief with a uniquely-headlined stale card for one
// section, opens that section if it defaults to collapsed, asserts the stale
// card is in the DOM, hits Refresh under conditions that exercise the buggy
// path, and asserts the stale card is GONE from the DOM after the persist POST.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, waitFor, fireEvent, screen, act } from '@testing-library/react'
import '@testing-library/jest-dom'
import type { QsNewsCard, QsBriefSections } from '@/lib/types'

type SectionKey = 'world' | 'sg' | 'prop' | 'jobsGlobal' | 'jobsSg' | 'port'

const EMPTY_SECTIONS: QsBriefSections = {
  world: [], sg: [], prop: [], jobsGlobal: [], jobsSg: [], port: [],
}

// Section metadata: visible header text, distinguishing fragment of the user
// query so we can match `/api/news/generate` calls back to the originating
// section, and whether the section starts open by default in the UI.
const SECTIONS: Record<SectionKey, {
  headerText: string
  queryFragment: string
  defaultOpen: boolean
  staleHeadline: string
}> = {
  world: {
    headerText: 'World Headlines',
    queryFragment: 'world headlines',
    defaultOpen: true,
    staleHeadline: 'STALE WORLD CARD UNIQUE-AAAA',
  },
  sg: {
    headerText: 'Singapore Headlines',
    queryFragment: 'Singapore headlines',
    defaultOpen: true,
    staleHeadline: 'STALE SG CARD UNIQUE-BBBB',
  },
  prop: {
    headerText: 'Singapore Property',
    queryFragment: 'Singapore property',
    defaultOpen: false,
    staleHeadline: 'STALE PROP CARD UNIQUE-CCCC',
  },
  jobsGlobal: {
    headerText: 'Global Tech Employment',
    queryFragment: 'global tech layoff',
    defaultOpen: false,
    staleHeadline: 'STALE JOBSGLOBAL CARD UNIQUE-DDDD',
  },
  jobsSg: {
    headerText: 'Singapore Tech Jobs',
    queryFragment: 'Singapore tech employment',
    defaultOpen: false,
    staleHeadline: 'STALE JOBSSG CARD UNIQUE-EEEE',
  },
  port: {
    headerText: 'Portfolio News',
    queryFragment: '__PORT_SYS__', // matched via system string, not user query
    defaultOpen: true,
    staleHeadline: 'STALE PORT CARD UNIQUE-FFFF',
  },
}

function endTurnResponse(text = '[]') {
  return {
    ok: true,
    json: async () => ({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text }],
    }),
  }
}

function failResponse() {
  return Promise.resolve({
    ok: false,
    status: 500,
    json: async () => ({ error: 'simulated API failure' }),
  })
}

function staleCard(section: SectionKey): QsNewsCard {
  const meta = SECTIONS[section]
  return {
    id: `${section}-0`,
    category: 'Stale',
    sentiment: 'neutral',
    headline: meta.staleHeadline,
    catalyst: '',
    summary: 'Old summary from a previous day.',
    keyPoints: [],
    source: 'Old',
    url: '',
    timestamp: '25 Apr 2026, 09:00 SGT',
    ...(section === 'port' ? { ticker: 'NVDA', tickerColor: '#9B6DFF' } : {}),
  }
}

function isGenerateCallForSection(
  init: RequestInit | undefined,
  section: SectionKey,
): boolean {
  try {
    const body = JSON.parse(String(init?.body ?? '{}')) as {
      system?: string
      messages?: Array<{ role: string; content: unknown }>
    }
    if (section === 'port') {
      return typeof body.system === 'string'
        && body.system.includes('financial news analyst')
    }
    const userMsg = body.messages?.[0]
    const content = typeof userMsg?.content === 'string' ? userMsg.content : ''
    return content.includes(SECTIONS[section].queryFragment)
  } catch {
    return false
  }
}

function lastNewsPost(fetchMock: ReturnType<typeof vi.fn>): unknown[] | undefined {
  const posts = fetchMock.mock.calls.filter(
    c => c[0] === '/api/news' && (c[1] as RequestInit | undefined)?.method === 'POST'
  )
  return posts[posts.length - 1]
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

/**
 * Mount NewsClient with a brief that has a stale card in the named section,
 * expand the section if needed, hit Refresh, then return so the caller can
 * assert on the DOM.
 *
 * Modes:
 *   - 'skip-port':   tickers === 0 → loop hits the `continue` for port.
 *   - 'catch':       /api/news/generate fails for `section` only → catch fires.
 */
async function runRefreshScenario(
  section: SectionKey,
  mode: 'skip-port' | 'catch',
): Promise<void> {
  const meta = SECTIONS[section]
  const briefSections: QsBriefSections = {
    ...EMPTY_SECTIONS,
    [section]: [staleCard(section)],
  }

  // For port-related scenarios, decide whether tickers are present.
  // skip-port: tickers must be empty AND the brief must already have a port
  //            card so the section renders on mount.
  // catch:     port section needs tickers to even attempt the fetch (the loop
  //            skips when tickers === 0); seed tickers so the catch path runs.
  const tickers = section === 'port'
    ? (mode === 'skip-port' ? [] : ['NVDA'])
    : []

  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    if (url === '/api/news' && init?.method !== 'POST') {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          id: 'brief-1',
          generated_at: new Date().toISOString(),
          brief_json: JSON.stringify(briefSections),
          tickers: tickers.length > 0 ? JSON.stringify(tickers) : null,
        }),
      })
    }
    if (url === '/api/portfolio/snapshots') {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          holdings: tickers.map(t => ({ ticker: t })),
        }),
      })
    }
    if (url === '/api/news/generate') {
      if (mode === 'catch' && isGenerateCallForSection(init, section)) {
        return failResponse()
      }
      return Promise.resolve(endTurnResponse())
    }
    if (url === '/api/news' && init?.method === 'POST') {
      return Promise.resolve({ ok: true, json: async () => ({}) })
    }
    return Promise.resolve({ ok: true, json: async () => ({}) })
  })

  const { NewsClient } = await import('@/app/(protected)/news/news-client')
  render(<NewsClient />)

  // Wait for the brief to load and the section header to appear.
  await waitFor(() => expect(screen.getByText(meta.headerText)).toBeInTheDocument())

  // Expand the section if it's not open by default. The card itself only
  // renders when the section is open AND has items.
  if (!meta.defaultOpen) {
    fireEvent.click(screen.getByText(meta.headerText))
  }

  // Confirm the stale card is visible BEFORE refresh — otherwise the test
  // can't tell whether the post-refresh assertion is meaningful.
  await waitFor(
    () => expect(screen.getByText(meta.staleHeadline)).toBeInTheDocument(),
    { timeout: 3000 }
  )

  fireEvent.click(screen.getByRole('button', { name: /Refresh/i }))

  // Wait for the persist POST that closes out handleRefresh().
  await waitFor(
    () => expect(lastNewsPost(fetchMock)).toBeDefined(),
    { timeout: 8000 }
  )

  // Allow any trailing setState calls inside handleRefresh's catch / setRefreshMsg
  // to flush before assertions.
  await act(async () => { await Promise.resolve() })
}

describe('NewsClient — Refresh clears stale cards from the UI (BUG-069)', () => {
  describe('Skip path (port, tickers === 0)', () => {
    it('clears stale port card from the DOM when refresh skips port', async () => {
      await runRefreshScenario('port', 'skip-port')
      expect(screen.queryByText(SECTIONS.port.staleHeadline)).not.toBeInTheDocument()
    })
  })

  describe('Catch path (agenticLoop throws)', () => {
    it('clears stale world card from the DOM when world fetch fails', async () => {
      await runRefreshScenario('world', 'catch')
      expect(screen.queryByText(SECTIONS.world.staleHeadline)).not.toBeInTheDocument()
    })

    it('clears stale sg card from the DOM when sg fetch fails', async () => {
      await runRefreshScenario('sg', 'catch')
      expect(screen.queryByText(SECTIONS.sg.staleHeadline)).not.toBeInTheDocument()
    })

    it('clears stale prop card from the DOM when prop fetch fails', async () => {
      await runRefreshScenario('prop', 'catch')
      expect(screen.queryByText(SECTIONS.prop.staleHeadline)).not.toBeInTheDocument()
    })

    it('clears stale jobsGlobal card from the DOM when jobsGlobal fetch fails', async () => {
      await runRefreshScenario('jobsGlobal', 'catch')
      expect(screen.queryByText(SECTIONS.jobsGlobal.staleHeadline)).not.toBeInTheDocument()
    })

    it('clears stale jobsSg card from the DOM when jobsSg fetch fails', async () => {
      await runRefreshScenario('jobsSg', 'catch')
      expect(screen.queryByText(SECTIONS.jobsSg.staleHeadline)).not.toBeInTheDocument()
    })

    it('clears stale port card from the DOM when port fetch fails', async () => {
      await runRefreshScenario('port', 'catch')
      expect(screen.queryByText(SECTIONS.port.staleHeadline)).not.toBeInTheDocument()
    })
  })
})
