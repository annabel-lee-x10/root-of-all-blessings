// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom'

vi.mock('@/app/(protected)/components/toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

vi.mock('recharts', () => ({
  PieChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Pie: () => null,
  Cell: () => null,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

const BASE_HOLDINGS = [
  {
    ticker: 'MU', name: 'Micron Technology',
    market_value: 1600, pnl: -50, pnl_pct: -3.0,
    avg_cost: 337.20, current_price: 320, units: 5,
    geo: 'US', sector: 'Technology', currency: 'USD',
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
}

function mockFetch(data: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(data),
  }))
}

beforeEach(() => mockFetch(SNAP))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

async function renderDashboard(data = SNAP) {
  mockFetch(data)
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
    // ABBV has SELL LIMIT in OPEN_ORDERS
    expect(screen.getByTestId('limit-badge-ABBV')).toHaveTextContent('SELL')
  })

  it('shows BUY badge on card when ticker has an active BUY LIMIT order', async () => {
    await renderDashboard()
    // AGIX has BUY LIMIT in OPEN_ORDERS
    expect(screen.getByTestId('limit-badge-AGIX')).toHaveTextContent('BUY')
  })

  it('shows no limit badge when ticker has no active orders', async () => {
    await renderDashboard()
    // MU has no entry in OPEN_ORDERS
    expect(screen.queryByTestId('limit-badge-MU')).not.toBeInTheDocument()
  })

  it('SELL badge is styled with red colour scheme', async () => {
    await renderDashboard()
    const badge = screen.getByTestId('limit-badge-ABBV')
    // Red color used for sell limits
    expect(badge.style.color).toMatch(/#FF5A5A|rgb\(255,\s*90,\s*90\)/)
  })

  it('BUY badge is styled with teal colour scheme', async () => {
    await renderDashboard()
    const badge = screen.getByTestId('limit-badge-AGIX')
    // Teal color used for buy limits
    expect(badge.style.color).toMatch(/#06D6A0|rgb\(6,\s*214,\s*160\)/)
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
    await renderDashboard(snapWith1D)
    expect(screen.getByTestId('change-1d-MU')).toBeInTheDocument()
  })

  it('1D% value is formatted correctly (e.g. -2.50%)', async () => {
    const snapWith1D = {
      ...SNAP,
      holdings: BASE_HOLDINGS.map(h => ({ ...h, change_1d_pct: h.ticker === 'MU' ? -2.5 : 1.0 })),
    }
    await renderDashboard(snapWith1D)
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
    await renderDashboard(snapWith1D)
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
    mockFetch(null)
    const { PortfolioClient } = await import('@/app/(protected)/portfolio/portfolio-client')
    render(<PortfolioClient />)
    await waitFor(() => expect(screen.getByRole('button', { name: /toggle theme/i })).toBeInTheDocument())
  })
})
