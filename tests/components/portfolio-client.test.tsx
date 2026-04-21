// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom'

vi.mock('@/app/(protected)/components/toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

const BASE_HOLDINGS = [
  {
    ticker: 'MU', name: 'Micron Technology',
    market_value: 1600, pnl: -50, pnl_pct: -3.0,
    avg_cost: 337.20, current_price: 320, units: 5,
    geo: 'US', sector: 'Technology', currency: 'USD',
    target: 500,
  },
  {
    ticker: 'ABBV', name: 'AbbVie Inc.',
    market_value: 640, pnl: 20, pnl_pct: 3.2,
    avg_cost: 213.20, current_price: 220, units: 3,
    geo: 'US', sector: 'Healthcare', currency: 'USD',
  },
  {
    ticker: 'AGIX', name: 'KraneShares AI ETF',
    market_value: 160, pnl: -5, pnl_pct: -3.0,
    avg_cost: 16.05, current_price: 16.00, units: 10,
    geo: 'US', sector: 'ETF', currency: 'USD',
  },
  {
    ticker: 'NEE', name: 'NextEra Energy',
    market_value: 475, pnl: 5, pnl_pct: 1.1,
    avg_cost: 94.70, current_price: 95.00, units: 5,
    geo: 'US', sector: 'Utilities', currency: 'USD',
  },
]

const SNAP = {
  id: 'snap1',
  snapshot_date: '2026-04-09T07:19:00.000Z',
  total_value: 10000,
  total_pnl: -30,
  holdings: BASE_HOLDINGS,
  orders: [
    { id: 'o1', ticker: 'ABBV', geo: 'US', type: 'SELL LIMIT', price: 230, qty: 3, currency: 'USD', new_flag: 0 },
    { id: 'o2', ticker: 'AGIX', geo: 'US', type: 'BUY LIMIT', price: 15.50, qty: 10, currency: 'USD', new_flag: 0 },
  ],
  realised_trades: [],
  growth: [],
  milestones: [],
}

const ORDERS = [
  { ticker: 'ABBV', geo: 'US', type: 'SELL LIMIT', price: 218.00, qty: 3, currency: 'USD', placed: '07 Apr 20:44 SGT' },
  { ticker: 'AGIX', geo: 'US', type: 'BUY LIMIT',  price: 15.39,  qty: 2, currency: 'USD', placed: '08 Apr 01:17 SGT' },
]

/** Mock fetch to return correct data per URL */
function mockMultiFetch() {
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    let data: unknown = null
    if (url === '/api/portfolio/orders')   data = ORDERS
    else if (url === '/api/portfolio/realised') data = []
    else if (url === '/api/portfolio/growth')   data = { scores: [], milestones: [] }
    else /* /api/portfolio */               data = SNAP
    return Promise.resolve({ ok: true, json: () => Promise.resolve(data) })
  }))
}

beforeEach(() => mockMultiFetch())

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

async function renderDashboard() {
  mockMultiFetch()
  const { PortfolioClient } = await import('@/app/(protected)/portfolio/portfolio-client')
  render(<PortfolioClient />)
  // Wait for Holdings tab to load (cards have data-testid="holding-card-{ticker}")
  await waitFor(() => expect(screen.getAllByTestId(/^holding-card-/).length).toBeGreaterThan(0))
}

// ── Feature 1: Sparklines ─────────────────────────────────────────────────────
describe('Holdings tab – sparklines', () => {
  it('renders one sparkline SVG per holding card', async () => {
    await renderDashboard()
    const sparklines = screen.getAllByTestId('sparkline')
    expect(sparklines).toHaveLength(BASE_HOLDINGS.length)
  })

  it('each sparkline contains a polyline with a non-empty points attribute', async () => {
    await renderDashboard()
    const sparklines = screen.getAllByTestId('sparkline')
    for (const svg of sparklines) {
      const polyline = svg.querySelector('polyline')
      expect(polyline).toBeTruthy()
      const pts = polyline!.getAttribute('points')
      expect(pts).toBeTruthy()
      expect(pts!.trim().length).toBeGreaterThan(0)
    }
  })

  it('sparklines are deterministic – same ticker produces same points on re-render', async () => {
    await renderDashboard()
    const first = screen.getAllByTestId('sparkline')
    const points1 = first.map(s => s.querySelector('polyline')?.getAttribute('points'))

    cleanup()
    await renderDashboard()
    const second = screen.getAllByTestId('sparkline')
    const points2 = second.map(s => s.querySelector('polyline')?.getAttribute('points'))

    expect(points1).toEqual(points2)
  })
})

// ── Feature 2: SELL / BUY limit badges ───────────────────────────────────────
describe('Holdings tab – limit badges', () => {
  it('shows SELL badge on card when ticker has an active SELL LIMIT order', async () => {
    await renderDashboard()
    // ABBV has SELL LIMIT in ORDERS
    expect(screen.getByTestId('limit-badge-ABBV')).toHaveTextContent('SELL')
  })

  it('shows BUY badge on card when ticker has an active BUY LIMIT order', async () => {
    await renderDashboard()
    // AGIX has BUY LIMIT in ORDERS
    expect(screen.getByTestId('limit-badge-AGIX')).toHaveTextContent('BUY')
  })

  it('shows no limit badge when ticker has no active orders', async () => {
    await renderDashboard()
    // MU has no entry in ORDERS
    expect(screen.queryByTestId('limit-badge-MU')).not.toBeInTheDocument()
  })

  it('SELL badge is styled with purple colour scheme', async () => {
    await renderDashboard()
    const badge = screen.getByTestId('limit-badge-ABBV')
    // Purple color used for sell limits (snap27 style)
    expect(badge.style.color).toMatch(/#9B6DFF|rgb\(155,\s*109,\s*255\)/)
  })

  it('BUY badge is styled with green colour scheme', async () => {
    await renderDashboard()
    const badge = screen.getByTestId('limit-badge-AGIX')
    // Green color used for buy limits (snap27 style)
    expect(badge.style.color).toMatch(/#3DD68C|rgb\(61,\s*214,\s*140\)/)
  })
})

// ── Feature 3: Target price progress bar ─────────────────────────────────────
describe('Holdings tab – target price progress bar', () => {
  it('shows target bar in expanded detail for MU (which has a $500 target)', async () => {
    await renderDashboard()
    fireEvent.click(screen.getByTestId('holding-card-MU'))
    await waitFor(() => expect(screen.getByTestId('target-bar-MU')).toBeInTheDocument())
  })

  it('target bar shows the target price text', async () => {
    await renderDashboard()
    fireEvent.click(screen.getByTestId('holding-card-MU'))
    await waitFor(() => {
      const bar = screen.getByTestId('target-bar-MU')
      expect(bar.textContent).toContain('500')
    })
  })

  it('no target bar in expanded detail for NEE (no price target)', async () => {
    await renderDashboard()
    fireEvent.click(screen.getByTestId('holding-card-NEE'))
    // Expanded detail shows — NEE sector label appears; no target bar
    await waitFor(() => screen.getByTestId('holding-card-NEE'))
    expect(screen.queryByTestId('target-bar-NEE')).not.toBeInTheDocument()
  })
})

// ── Feature 4: 1D% change on cards ───────────────────────────────────────────
describe('Holdings tab – 1D% change', () => {
  it('displays 1D% change on card when change_1d_pct is present', async () => {
    const snapWith1D = {
      ...SNAP,
      holdings: BASE_HOLDINGS.map(h => ({
        ...h,
        change_1d_pct: h.ticker === 'MU' ? -2.5 : 1.0,
      })),
    }
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      let data: unknown = null
      if (url === '/api/portfolio/orders')   data = ORDERS
      else if (url === '/api/portfolio/realised') data = []
      else if (url === '/api/portfolio/growth')   data = { scores: [], milestones: [] }
      else data = snapWith1D
      return Promise.resolve({ ok: true, json: () => Promise.resolve(data) })
    }))
    const { PortfolioClient } = await import('@/app/(protected)/portfolio/portfolio-client')
    render(<PortfolioClient />)
    await waitFor(() => expect(screen.getAllByTestId(/^holding-card-/).length).toBeGreaterThan(0))
    expect(screen.getByTestId('change-1d-MU')).toBeInTheDocument()
  })

  it('1D% value is formatted correctly (e.g. -2.50%)', async () => {
    const snapWith1D = {
      ...SNAP,
      holdings: BASE_HOLDINGS.map(h => ({ ...h, change_1d_pct: h.ticker === 'MU' ? -2.5 : 1.0 })),
    }
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      let data: unknown = null
      if (url === '/api/portfolio/orders')   data = ORDERS
      else if (url === '/api/portfolio/realised') data = []
      else if (url === '/api/portfolio/growth')   data = { scores: [], milestones: [] }
      else data = snapWith1D
      return Promise.resolve({ ok: true, json: () => Promise.resolve(data) })
    }))
    const { PortfolioClient } = await import('@/app/(protected)/portfolio/portfolio-client')
    render(<PortfolioClient />)
    await waitFor(() => expect(screen.getAllByTestId(/^holding-card-/).length).toBeGreaterThan(0))
    expect(screen.getByTestId('change-1d-MU').textContent).toMatch(/-2[.,]50%/)
  })

  it('does not render 1D% element when change_1d_pct is absent', async () => {
    await renderDashboard() // SNAP has no change_1d_pct
    expect(screen.queryByTestId('change-1d-MU')).not.toBeInTheDocument()
  })

  it('positive 1D% is displayed with leading +', async () => {
    const snapWith1D = {
      ...SNAP,
      holdings: BASE_HOLDINGS.map(h => ({ ...h, change_1d_pct: 1.5 })),
    }
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      let data: unknown = null
      if (url === '/api/portfolio/orders')   data = ORDERS
      else if (url === '/api/portfolio/realised') data = []
      else if (url === '/api/portfolio/growth')   data = { scores: [], milestones: [] }
      else data = snapWith1D
      return Promise.resolve({ ok: true, json: () => Promise.resolve(data) })
    }))
    const { PortfolioClient } = await import('@/app/(protected)/portfolio/portfolio-client')
    render(<PortfolioClient />)
    await waitFor(() => expect(screen.getAllByTestId(/^holding-card-/).length).toBeGreaterThan(0))
    expect(screen.getByTestId('change-1d-MU').textContent).toContain('+')
  })
})

// ── Feature 5: Dark / light theme toggle ─────────────────────────────────────
describe('theme toggle', () => {
  it('renders a theme toggle button in the topbar', async () => {
    await renderDashboard()
    expect(screen.getByRole('button', { name: /toggle theme/i })).toBeInTheDocument()
  })

  it('shows moon icon by default (dark mode)', async () => {
    await renderDashboard()
    const btn = screen.getByRole('button', { name: /toggle theme/i })
    expect(btn.textContent).toContain('🌙')
  })

  it('switches to sun icon after clicking toggle once (light mode)', async () => {
    await renderDashboard()
    const btn = screen.getByRole('button', { name: /toggle theme/i })
    fireEvent.click(btn)
    expect(btn.textContent).toContain('☀️')
  })

  it('reverts to moon icon after clicking toggle twice', async () => {
    await renderDashboard()
    const btn = screen.getByRole('button', { name: /toggle theme/i })
    fireEvent.click(btn)
    fireEvent.click(btn)
    expect(btn.textContent).toContain('🌙')
  })

  it('wrapper div has data-theme=dark by default', async () => {
    await renderDashboard()
    expect(document.querySelector('[data-theme="dark"]')).toBeInTheDocument()
  })

  it('wrapper div switches to data-theme=light after toggle click', async () => {
    await renderDashboard()
    fireEvent.click(screen.getByRole('button', { name: /toggle theme/i }))
    expect(document.querySelector('[data-theme="light"]')).toBeInTheDocument()
  })

  it('theme toggle is visible in empty state (null snapshot — no portfolio uploaded yet)', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      let data: unknown = null
      if (url === '/api/portfolio/orders')   data = []
      else if (url === '/api/portfolio/realised') data = []
      else if (url === '/api/portfolio/growth')   data = { scores: [], milestones: [] }
      else data = null
      return Promise.resolve({ ok: true, json: () => Promise.resolve(data) })
    }))
    const { PortfolioClient } = await import('@/app/(protected)/portfolio/portfolio-client')
    render(<PortfolioClient />)
    await waitFor(() => expect(screen.getByRole('button', { name: /toggle theme/i })).toBeInTheDocument())
  })
})
