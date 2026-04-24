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
    target: 500, sell_limit: null, buy_limit: null,
    is_new: false, approx: false, note: null,
    dividend_amount: null, dividend_date: null,
  },
  {
    ticker: 'ABBV', name: 'AbbVie Inc.',
    market_value: 640, pnl: 20, pnl_pct: 3.2,
    avg_cost: 213.20, current_price: 220, units: 3,
    geo: 'US', sector: 'Healthcare', currency: 'USD',
    target: null, sell_limit: 218, buy_limit: null,
    is_new: false, approx: false, note: null,
    dividend_amount: null, dividend_date: null,
  },
  {
    ticker: 'AGIX', name: 'KraneShares AI ETF',
    market_value: 160, pnl: -5, pnl_pct: -3.0,
    avg_cost: 16.05, current_price: 16.00, units: 10,
    geo: 'US', sector: 'ETF', currency: 'USD',
    target: null, sell_limit: null, buy_limit: 15.39,
    is_new: false, approx: false, note: null,
    dividend_amount: null, dividend_date: null,
  },
  {
    ticker: 'NEE', name: 'NextEra Energy',
    market_value: 475, pnl: 5, pnl_pct: 1.1,
    avg_cost: 94.70, current_price: 95.00, units: 5,
    geo: 'US', sector: 'Utilities', currency: 'USD',
    target: null, sell_limit: null, buy_limit: null,
    is_new: false, approx: false, note: null,
    dividend_amount: null, dividend_date: null,
  },
]

const BASE_GROWTH = [
  {
    id: 'g1', snapshot_id: 'snap1', dimension: 'K', score: 4,
    label: 'Knowledge', level: 'Developing',
    items_json: JSON.stringify(['P/E understood', 'ETF mechanics']),
    next_text: 'MU cycle-stage valuation',
  },
  {
    id: 'g2', snapshot_id: 'snap1', dimension: 'S', score: 4,
    label: 'Strategy', level: 'Developing',
    items_json: JSON.stringify(['Pre-committed sell limits', 'Geo diversification']),
    next_text: 'MU take-profit plan',
  },
  {
    id: 'g3', snapshot_id: 'snap1', dimension: 'E', score: 3,
    label: 'Execution', level: 'Developing',
    items_json: JSON.stringify(['First SGX odd-lot']),
    next_text: 'Process audit',
  },
]

const SNAP = {
  id: 'snap1',
  snapshot_date: '2026-04-09T07:19:00.000Z',
  snap_label: 'Snap 19',
  snap_time: '07:19 SGT 9 Apr 2026',
  total_value: 10000,
  unrealised_pnl: -30,
  realised_pnl: 9.46,
  cash: 200,
  holdings: BASE_HOLDINGS,
  orders: [
    {
      id: 'o1', snapshot_id: 'snap1',
      ticker: 'ABBV', geo: 'US', type: 'SELL LIMIT',
      price: 218, qty: 3, currency: 'USD',
      placed: '07 Apr 20:44 SGT', current_price: 220,
      note: '', new_flag: 0,
    },
    {
      id: 'o2', snapshot_id: 'snap1',
      ticker: 'AGIX', geo: 'US', type: 'BUY LIMIT',
      price: 15.39, qty: 2, currency: 'USD',
      placed: '08 Apr 01:17 SGT', current_price: 16.00,
      note: '', new_flag: 0,
    },
  ],
  realised: [
    { id: 'r1', snapshot_id: 'snap1', key: 'QQQ', value: 20.50 },
    { id: 'r2', snapshot_id: 'snap1', key: 'AAPL', value: -11.03 },
  ],
  growth: BASE_GROWTH,
  milestones: [
    { id: 'm1', snapshot_id: 'snap1', date: '27 Mar', tags_json: '["E"]', text: 'First position - MU entry', sort_order: 0 },
  ],
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
  it('shows SELL badge on card when holding has a sell_limit set', async () => {
    await renderDashboard()
    // ABBV has sell_limit: 218
    expect(screen.getByTestId('limit-badge-ABBV')).toHaveTextContent('SELL')
  })

  it('shows BUY badge on card when holding has a buy_limit set', async () => {
    await renderDashboard()
    // AGIX has buy_limit: 15.39
    expect(screen.getByTestId('limit-badge-AGIX')).toHaveTextContent('BUY')
  })

  it('shows no limit badge when holding has no sell_limit or buy_limit', async () => {
    await renderDashboard()
    // MU has sell_limit: null, buy_limit: null
    expect(screen.queryByTestId('limit-badge-MU')).not.toBeInTheDocument()
  })

  it('SELL badge is styled with red colour scheme', async () => {
    await renderDashboard()
    const badge = screen.getByTestId('limit-badge-ABBV')
    expect(badge.style.color).toMatch(/#FF5A5A|rgb\(255,\s*90,\s*90\)/)
  })

  it('BUY badge is styled with teal colour scheme', async () => {
    await renderDashboard()
    const badge = screen.getByTestId('limit-badge-AGIX')
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

// ── Feature 6: Orders tab wired to API data ───────────────────────────────────
describe('Orders tab – API-wired data', () => {
  it('renders orders from the snap response (not static data)', async () => {
    await renderDashboard()
    fireEvent.click(screen.getByRole('button', { name: /^Orders$/i }))
    await waitFor(() => {
      expect(screen.getByTestId('order-ticker-ABBV')).toBeInTheDocument()
      expect(screen.getByTestId('order-ticker-AGIX')).toBeInTheDocument()
    })
  })

  it('shows SELL LIMIT type badge on sell orders', async () => {
    await renderDashboard()
    fireEvent.click(screen.getByRole('button', { name: /^Orders$/i }))
    await waitFor(() => expect(screen.getByTestId('order-type-ABBV')).toHaveTextContent('SELL LIMIT'))
  })

  it('shows BUY LIMIT type badge on buy orders', async () => {
    await renderDashboard()
    fireEvent.click(screen.getByRole('button', { name: /^Orders$/i }))
    await waitFor(() => expect(screen.getByTestId('order-type-AGIX')).toHaveTextContent('BUY LIMIT'))
  })

  it('shows "no orders" message when orders array is empty', async () => {
    await renderDashboard({ ...SNAP, orders: [] })
    fireEvent.click(screen.getByRole('button', { name: /^Orders$/i }))
    await waitFor(() => expect(screen.getByTestId('orders-empty')).toBeInTheDocument())
  })
})

// ── Feature 7: Growth tab ─────────────────────────────────────────────────────
describe('Growth tab', () => {
  it('renders Growth tab button', async () => {
    await renderDashboard()
    expect(screen.getByRole('button', { name: /^Growth$/i })).toBeInTheDocument()
  })

  it('shows K, S, E dimension scores when Growth tab is active', async () => {
    await renderDashboard()
    fireEvent.click(screen.getByRole('button', { name: /^Growth$/i }))
    await waitFor(() => {
      expect(screen.getByTestId('growth-dimension-K')).toBeInTheDocument()
      expect(screen.getByTestId('growth-dimension-S')).toBeInTheDocument()
      expect(screen.getByTestId('growth-dimension-E')).toBeInTheDocument()
    })
  })

  it('shows score value for each dimension', async () => {
    await renderDashboard()
    fireEvent.click(screen.getByRole('button', { name: /^Growth$/i }))
    await waitFor(() => {
      expect(screen.getByTestId('growth-score-K').textContent).toContain('4')
      expect(screen.getByTestId('growth-score-S').textContent).toContain('4')
      expect(screen.getByTestId('growth-score-E').textContent).toContain('3')
    })
  })

  it('shows level text for each dimension', async () => {
    await renderDashboard()
    fireEvent.click(screen.getByRole('button', { name: /^Growth$/i }))
    await waitFor(() => {
      expect(screen.getByTestId('growth-dimension-K').textContent).toContain('Developing')
    })
  })

  it('shows next-steps text for a dimension after expanding it', async () => {
    await renderDashboard()
    fireEvent.click(screen.getByRole('button', { name: /^Growth$/i }))
    await waitFor(() => expect(screen.getByTestId('growth-dimension-K')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('growth-dimension-K'))
    await waitFor(() => {
      expect(screen.getByTestId('growth-next-K').textContent).toContain('MU cycle-stage valuation')
    })
  })

  it('shows "no growth data" message when growth array is empty', async () => {
    await renderDashboard({ ...SNAP, growth: [] })
    fireEvent.click(screen.getByRole('button', { name: /^Growth$/i }))
    await waitFor(() => expect(screen.getByTestId('growth-empty')).toBeInTheDocument())
  })
})

// ── Feature 8: What-If tab ────────────────────────────────────────────────────
describe('What-If tab', () => {
  it('renders What-If tab button', async () => {
    await renderDashboard()
    expect(screen.getByRole('button', { name: /What.If/i })).toBeInTheDocument()
  })

  it('shows each holding with its current price in What-If tab', async () => {
    await renderDashboard()
    fireEvent.click(screen.getByRole('button', { name: /What.If/i }))
    await waitFor(() => {
      expect(screen.getByTestId('whatif-row-MU')).toBeInTheDocument()
    })
  })

  it('shows total portfolio value initially', async () => {
    await renderDashboard()
    fireEvent.click(screen.getByRole('button', { name: /What.If/i }))
    await waitFor(() => {
      expect(screen.getByTestId('whatif-total')).toBeInTheDocument()
    })
  })
})

// ── Feature 9: KPI row shows snap-level data ──────────────────────────────────
describe('KPI row', () => {
  it('shows snap label in topbar', async () => {
    await renderDashboard()
    await waitFor(() => {
      expect(screen.getByTestId('snap-label')).toHaveTextContent('Snap 19')
    })
  })
})

// ── Phase 2 Feature 1: Day high/low + prev close in expanded holding ──────────
describe('Holdings tab – day range and prev close (Phase 2)', () => {
  const snapWithDayRange = {
    ...SNAP,
    holdings: BASE_HOLDINGS.map(h =>
      h.ticker === 'MU'
        ? { ...h, day_high: 330.50, day_low: 310.20, prev_close: 322.00 }
        : h
    ),
  }

  it('shows DAY RANGE section in expanded holding when day_high and day_low are present', async () => {
    await renderDashboard(snapWithDayRange)
    fireEvent.click(screen.getByTestId('holding-card-MU'))
    await waitFor(() => {
      expect(screen.getByTestId('day-range-MU')).toBeInTheDocument()
    })
  })

  it('displays day_high value in DAY RANGE section', async () => {
    await renderDashboard(snapWithDayRange)
    fireEvent.click(screen.getByTestId('holding-card-MU'))
    await waitFor(() => {
      expect(screen.getByTestId('day-range-MU').textContent).toContain('330')
    })
  })

  it('displays day_low value in DAY RANGE section', async () => {
    await renderDashboard(snapWithDayRange)
    fireEvent.click(screen.getByTestId('holding-card-MU'))
    await waitFor(() => {
      expect(screen.getByTestId('day-range-MU').textContent).toContain('310')
    })
  })

  it('shows PREV CLOSE section in expanded holding when prev_close is present', async () => {
    await renderDashboard(snapWithDayRange)
    fireEvent.click(screen.getByTestId('holding-card-MU'))
    await waitFor(() => {
      expect(screen.getByTestId('prev-close-MU')).toBeInTheDocument()
    })
  })

  it('displays prev_close value correctly', async () => {
    await renderDashboard(snapWithDayRange)
    fireEvent.click(screen.getByTestId('holding-card-MU'))
    await waitFor(() => {
      expect(screen.getByTestId('prev-close-MU').textContent).toContain('322')
    })
  })

  it('does not show DAY RANGE section when day_high and day_low are absent', async () => {
    await renderDashboard() // BASE_HOLDINGS has no day_high/day_low
    fireEvent.click(screen.getByTestId('holding-card-MU'))
    await waitFor(() => screen.getByTestId('holding-card-MU'))
    expect(screen.queryByTestId('day-range-MU')).not.toBeInTheDocument()
  })

  it('does not show PREV CLOSE section when prev_close is absent', async () => {
    await renderDashboard()
    fireEvent.click(screen.getByTestId('holding-card-MU'))
    await waitFor(() => screen.getByTestId('holding-card-MU'))
    expect(screen.queryByTestId('prev-close-MU')).not.toBeInTheDocument()
  })
})

// ── Phase 2 Feature 2: Order status badge ─────────────────────────────────────
describe('Orders tab – status badge (Phase 2)', () => {
  const snapWithOrderStatus = {
    ...SNAP,
    orders: [
      {
        id: 'o1', snapshot_id: 'snap1',
        ticker: 'ABBV', geo: 'US', type: 'SELL LIMIT',
        price: 218, qty: 3, currency: 'USD',
        placed: '07 Apr 20:44 SGT', current_price: 220,
        note: '', new_flag: 0, status: 'open',
      },
      {
        id: 'o2', snapshot_id: 'snap1',
        ticker: 'AGIX', geo: 'US', type: 'BUY LIMIT',
        price: 15.39, qty: 2, currency: 'USD',
        placed: '08 Apr 01:17 SGT', current_price: 16.00,
        note: '', new_flag: 0, status: 'open',
      },
    ],
  }

  it('shows status badge on each order in Orders tab', async () => {
    await renderDashboard(snapWithOrderStatus)
    fireEvent.click(screen.getByRole('button', { name: /^Orders$/i }))
    await waitFor(() => {
      expect(screen.getByTestId('order-status-ABBV')).toBeInTheDocument()
      expect(screen.getByTestId('order-status-AGIX')).toBeInTheDocument()
    })
  })

  it('status badge shows the order status value', async () => {
    await renderDashboard(snapWithOrderStatus)
    fireEvent.click(screen.getByRole('button', { name: /^Orders$/i }))
    await waitFor(() => {
      expect(screen.getByTestId('order-status-ABBV')).toHaveTextContent('open')
    })
  })
})

// ── BUG-042 / BUG-051: screenshot upload accessible when snapshot data exists ──
// BUG-042 confirmed the area must be reachable. BUG-051 moved it to a FAB modal.
describe('BUG-042 / BUG-051 – screenshot upload area accessible when snapshot data exists', () => {
  it('upload area is NOT shown inline by default when snapshot data exists', async () => {
    await renderDashboard()
    expect(screen.queryByText('Upload Syfe Screenshots')).not.toBeInTheDocument()
  })

  it('upload area becomes visible after portfolio:open-upload event is dispatched', async () => {
    await renderDashboard()
    fireEvent(window, new CustomEvent('portfolio:open-upload'))
    await waitFor(() => {
      expect(screen.getByText('Upload Syfe Screenshots')).toBeInTheDocument()
    })
  })
})

// ── BUG-051: FAB opens screenshot upload modal (no topbar "+" button) ─────────
describe('BUG-051 – portfolio:open-upload opens screenshot upload modal', () => {
  it('topbar has no button with data-testid="upload-btn"', async () => {
    await renderDashboard()
    expect(screen.queryByTestId('upload-btn')).not.toBeInTheDocument()
  })

  it('topbar has no hidden HTML file input accepting .html/.htm', async () => {
    await renderDashboard()
    const htmlInputs = document.querySelectorAll('input[type="file"][accept*=".html"]')
    expect(htmlInputs).toHaveLength(0)
  })

  it('upload modal is NOT visible before the FAB event fires', async () => {
    await renderDashboard()
    expect(screen.queryByText('Upload Syfe Screenshots')).not.toBeInTheDocument()
  })

  it('upload modal IS visible after portfolio:open-upload fires', async () => {
    await renderDashboard()
    fireEvent(window, new CustomEvent('portfolio:open-upload'))
    await waitFor(() => {
      expect(screen.getByText('Upload Syfe Screenshots')).toBeInTheDocument()
    })
  })
})

// ── BUG-048: FX/valueUSD logic removed ───────────────────────────────────────
describe('BUG-048 – FX/valueUSD logic removed', () => {
  it('Geo tab does not show "~$" FX-approximated prefix on geo values', async () => {
    await renderDashboard()
    fireEvent.click(screen.getByRole('button', { name: /^Geo$/i }))
    await waitFor(() => screen.getByRole('button', { name: /^Geo$/i }))
    expect(document.body.textContent).not.toContain('~$')
  })

  it('Sector tab does not show "~$" FX-approximated prefix on sector values', async () => {
    await renderDashboard()
    fireEvent.click(screen.getByRole('button', { name: /^Sector$/i }))
    await waitFor(() => screen.getByRole('button', { name: /^Sector$/i }))
    expect(document.body.textContent).not.toContain('~$')
  })

  it('KPI row does not show a secondary "~$... USD" FX approximation', async () => {
    await renderDashboard()
    expect(document.body.textContent).not.toMatch(/~\$.*USD/)
  })
})

// ── BUG-049: dead HTML-upload file input removed from topbar ──────────────────
describe('BUG-049 – dead HTML-upload file input removed from topbar', () => {
  it('there is no hidden file input accepting .html/.htm files in the document', async () => {
    await renderDashboard()
    const htmlInput = document.querySelector('input[type="file"][accept*=".html"]')
    expect(htmlInput).not.toBeInTheDocument()
  })

  it('dispatching portfolio:open-upload event does not open a file picker (no fileRef)', async () => {
    await renderDashboard()
    expect(() => {
      window.dispatchEvent(new CustomEvent('portfolio:open-upload'))
    }).not.toThrow()
    expect(document.querySelector('input[type="file"][accept*=".html"]')).not.toBeInTheDocument()
  })
})

// ── BUG-050: Geo/Sector FX disclaimer text removed ────────────────────────────
describe('BUG-050 – Geo/Sector FX disclaimers removed', () => {
  it('Geo tab does not show the "~USD totals · SGD≈0.74 · GBP≈1.29" disclaimer', async () => {
    await renderDashboard()
    fireEvent.click(screen.getByRole('button', { name: /^Geo$/i }))
    await waitFor(() => screen.getByRole('button', { name: /^Geo$/i }))
    expect(document.body.textContent).not.toContain('SGD≈')
    expect(document.body.textContent).not.toContain('GBP≈')
    expect(document.body.textContent).not.toMatch(/~USD totals/)
  })

  it('Sector tab does not show "~USD totals · NON-USD APPROXIMATED" disclaimer', async () => {
    await renderDashboard()
    fireEvent.click(screen.getByRole('button', { name: /^Sector$/i }))
    await waitFor(() => screen.getByRole('button', { name: /^Sector$/i }))
    expect(document.body.textContent).not.toContain('NON-USD APPROXIMATED')
    expect(document.body.textContent).not.toMatch(/~USD totals/)
  })
})

// ── BUG-052: Holdings sorted by market_value (no FX conversion) ───────────────
describe('BUG-052 – holdings sorted by market_value not FX-converted value', () => {
  it('Holdings are sorted by market_value, not FX-converted value', async () => {
    // SGD holding: market_value=2000 (SGD). FX-converted ≈ 1480 USD (< MU's 1600 USD).
    // Without FX: 2000 > 1600 → SGD holding appears first.
    // With FX: 1480 < 1600 → MU appears first. Test catches the FX regression.
    const snapSorted = {
      ...SNAP,
      holdings: [
        {
          ticker: 'SGD_BIG', name: 'Big SGD Holding',
          market_value: 2000, pnl: 0, pnl_pct: 0,
          avg_cost: 400, current_price: 400, units: 5,
          geo: 'SG', sector: 'ETF', currency: 'SGD',
          target: null, sell_limit: null, buy_limit: null,
          is_new: false, approx: false, note: null,
          dividend_amount: null, dividend_date: null,
        },
        {
          ticker: 'USD_SMALL', name: 'Small USD Holding',
          market_value: 1600, pnl: 0, pnl_pct: 0,
          avg_cost: 320, current_price: 320, units: 5,
          geo: 'US', sector: 'Technology', currency: 'USD',
          target: null, sell_limit: null, buy_limit: null,
          is_new: false, approx: false, note: null,
          dividend_amount: null, dividend_date: null,
        },
      ],
    }
    await renderDashboard(snapSorted)
    const cards = screen.getAllByTestId(/^holding-card-/)
    const sgdIdx = cards.findIndex(c => c.getAttribute('data-testid') === 'holding-card-SGD_BIG')
    const usdIdx = cards.findIndex(c => c.getAttribute('data-testid') === 'holding-card-USD_SMALL')
    expect(sgdIdx).toBeLessThan(usdIdx)
  })
})

// ── BUG-053: Holdings display values exactly as stored in DB ──────────────────
describe('BUG-053 – holdings display values exactly as stored in DB', () => {
  it('market_value is displayed exactly as returned by API (no transformation)', async () => {
    await renderDashboard()
    const muCard = screen.getByTestId('holding-card-MU')
    expect(muCard.textContent).toContain('1,600')
  })

  it('pnl magnitude is displayed exactly as returned by API', async () => {
    await renderDashboard()
    // MU pnl: -50 → displayed as "50" in the loss color
    const muCard = screen.getByTestId('holding-card-MU')
    expect(muCard.textContent).toMatch(/50\.00/)
  })

  it('pnl_pct is displayed exactly as returned by API', async () => {
    await renderDashboard()
    // MU pnl_pct: -3.0 → displayed as "-3.00%"
    const muCard = screen.getByTestId('holding-card-MU')
    expect(muCard.textContent).toContain('-3.00%')
  })
})

// ── BUG-034: non-ok API response must not crash the component ─────────────────
describe('BUG-034 – API error does not crash component', () => {
  it('shows upload panel (not crash) when API returns 500 with JSON error body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'no such table: portfolio_holdings' }),
    }))
    const { PortfolioClient } = await import('@/app/(protected)/portfolio/portfolio-client')
    render(<PortfolioClient />)
    await waitFor(() =>
      expect(screen.getByText(/No portfolio data yet/i)).toBeInTheDocument()
    )
  })

  it('shows upload panel when API returns 500 with non-JSON body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new SyntaxError('Unexpected token <')),
    }))
    const { PortfolioClient } = await import('@/app/(protected)/portfolio/portfolio-client')
    render(<PortfolioClient />)
    await waitFor(() =>
      expect(screen.getByText(/No portfolio data yet/i)).toBeInTheDocument()
    )
  })
})
