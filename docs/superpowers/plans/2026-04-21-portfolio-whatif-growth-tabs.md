# Portfolio Dashboard: What-If + Growth Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Dividends and Thesis tabs in the portfolio dashboard with a What-If scenario simulator tab and a Growth history chart tab, wiring Growth to the existing `/api/portfolio/history` Turso endpoint.

**Architecture:** Two-file change — update `portfolio-client.tsx` to swap out `DividendsTab`/`ThesisTab` for `WhatIfTab`/`GrowthTab`, and update the component test file to cover the new tabs. No schema or API changes needed: the history endpoint already exists, and What-If is pure client-side logic.

**Tech Stack:** Next.js 16.2.4 App Router, React 19 (client component, inline styles), Recharts 3 (add `LineChart`, `Line`, `XAxis`, `YAxis` to existing import), `@libsql/client` via history API already wired, Vitest + Testing Library for TDD.

---

## Tab Map (before → after)

| Position | Before         | After    |
|----------|----------------|----------|
| 1        | Holdings       | Holdings |
| 2        | Orders         | Orders   |
| 3        | Geo            | Geo      |
| 4        | Sector         | Sector   |
| 5        | **Dividends**  | **P&L**  |
| 6        | **P&L**        | **What-If** |
| 7        | **Thesis**     | **Growth** |

---

## File Structure

- **Modify:** `app/(protected)/portfolio/portfolio-client.tsx`
  - Remove: `DividendsTab`, `ThesisTab`, `THESIS` constant
  - Keep: `UPCOMING_DIVS` (DIV badge in Holdings), `OPEN_ORDERS` (Orders tab + limit badges), `PRICE_TARGETS` (MU target bar), `Sparkline`, all existing tabs 1-4, `PnlTab`
  - Add: `WhatIfTab`, `GrowthTab`
  - Update: recharts import (add `LineChart`, `Line`, `XAxis`, `YAxis`), `TABS` array, tab render block
- **Modify:** `tests/components/portfolio-client.test.tsx`
  - Update: recharts vi.mock (add `LineChart`, `Line`, `XAxis`, `YAxis`)
  - Add: `describe('What-If tab', ...)` block
  - Add: `describe('Growth tab', ...)` block

---

## Task 1: Write failing tests for What-If tab

**Files:**
- Modify: `tests/components/portfolio-client.test.tsx`

- [ ] **Step 1: Update recharts mock to include LineChart components**

In `tests/components/portfolio-client.test.tsx`, replace the `vi.mock('recharts', ...)` block at the top with:

```typescript
vi.mock('recharts', () => ({
  PieChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Pie: () => null,
  Cell: () => null,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  LineChart: ({ children }: { children: React.ReactNode }) => <div data-testid="line-chart">{children}</div>,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
}))
```

- [ ] **Step 2: Add What-If tab test block at the end of the file**

Append to `tests/components/portfolio-client.test.tsx`:

```typescript
// ── Feature 6: What-If tab ────────────────────────────────────────────────────
describe('What-If tab', () => {
  it('renders a What-If tab button in the tab bar', async () => {
    await renderDashboard()
    expect(screen.getByRole('button', { name: /what.if/i })).toBeInTheDocument()
  })

  it('clicking What-If tab shows holding rows with delta inputs', async () => {
    await renderDashboard()
    fireEvent.click(screen.getByRole('button', { name: /what.if/i }))
    await waitFor(() => {
      expect(screen.getByTestId('whatif-input-MU')).toBeInTheDocument()
    })
  })

  it('shows delta inputs for each holding', async () => {
    await renderDashboard()
    fireEvent.click(screen.getByRole('button', { name: /what.if/i }))
    await waitFor(() => {
      // BASE_HOLDINGS has 4 tickers: MU, ABBV, AGIX, NEE
      const inputs = screen.getAllByTestId(/^whatif-input-/)
      expect(inputs).toHaveLength(BASE_HOLDINGS.length)
    })
  })

  it('shows a summary card with current and projected totals', async () => {
    await renderDashboard()
    fireEvent.click(screen.getByRole('button', { name: /what.if/i }))
    await waitFor(() => {
      expect(screen.getByTestId('whatif-summary')).toBeInTheDocument()
    })
  })

  it('projected total updates when a delta input changes', async () => {
    await renderDashboard()
    fireEvent.click(screen.getByRole('button', { name: /what.if/i }))
    await waitFor(() => screen.getByTestId('whatif-input-MU'))

    // Get initial projected value
    const summaryBefore = screen.getByTestId('whatif-projected').textContent

    // Change MU delta to +10%
    fireEvent.change(screen.getByTestId('whatif-input-MU'), { target: { value: '10' } })

    await waitFor(() => {
      const summaryAfter = screen.getByTestId('whatif-projected').textContent
      expect(summaryAfter).not.toBe(summaryBefore)
    })
  })

  it('Reset All button resets all deltas to 0', async () => {
    await renderDashboard()
    fireEvent.click(screen.getByRole('button', { name: /what.if/i }))
    await waitFor(() => screen.getByTestId('whatif-input-MU'))

    // Set a non-zero delta
    fireEvent.change(screen.getByTestId('whatif-input-MU'), { target: { value: '10' } })

    // Reset
    fireEvent.click(screen.getByRole('button', { name: /reset all/i }))
    await waitFor(() => {
      const input = screen.getByTestId('whatif-input-MU') as HTMLInputElement
      expect(Number(input.value)).toBe(0)
    })
  })
})
```

- [ ] **Step 3: Run the new tests to confirm they fail**

Run: `cd D:\a10101100_labs\root-of-all-blessings && npx vitest run tests/components/portfolio-client.test.tsx 2>&1 | tail -30`

Expected: All 6 What-If tests FAIL with "Unable to find role 'button' {name: /what.if/i}" or similar — confirming red phase.

- [ ] **Step 4: Commit the failing tests**

```bash
git add tests/components/portfolio-client.test.tsx
git commit -m "test: add failing tests for What-If tab (TDD red phase)"
```

---

## Task 2: Implement WhatIfTab + update portfolio-client.tsx

**Files:**
- Modify: `app/(protected)/portfolio/portfolio-client.tsx`

- [ ] **Step 1: Update the recharts import line**

Find the current recharts import at the top of `portfolio-client.tsx`:

```typescript
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
```

Replace with:

```typescript
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, LineChart, Line, XAxis, YAxis } from 'recharts'
```

- [ ] **Step 2: Update the TABS array**

Find:

```typescript
type Tab = 'holdings' | 'orders' | 'geo' | 'sector' | 'dividends' | 'pnl' | 'thesis'
const TABS: { id: Tab; label: string }[] = [
  { id: 'holdings',  label: 'Holdings' },
  { id: 'orders',    label: 'Orders' },
  { id: 'geo',       label: 'Geo' },
  { id: 'sector',    label: 'Sector' },
  { id: 'dividends', label: 'Dividends' },
  { id: 'pnl',       label: 'P&L' },
  { id: 'thesis',    label: 'Thesis' },
]
```

Replace with:

```typescript
type Tab = 'holdings' | 'orders' | 'geo' | 'sector' | 'pnl' | 'whatif' | 'growth'
const TABS: { id: Tab; label: string }[] = [
  { id: 'holdings', label: 'Holdings' },
  { id: 'orders',   label: 'Orders' },
  { id: 'geo',      label: 'Geo' },
  { id: 'sector',   label: 'Sector' },
  { id: 'pnl',      label: 'P&L' },
  { id: 'whatif',   label: 'What-If' },
  { id: 'growth',   label: 'Growth' },
]
```

- [ ] **Step 3: Remove DividendsTab and ThesisTab components, and the THESIS constant**

Delete the entire `// ── Tab: Dividends` section (the `DividendsTab` function, lines ~647–688).

Delete the entire `// ── Tab: Thesis` section (the `ThesisTab` function, lines ~748–807).

Delete the `THESIS` constant (lines ~106–119).

Keep: `UPCOMING_DIVS` (still used in HoldingsTab for the DIV badge), `OPEN_ORDERS`, `PRICE_TARGETS`.

- [ ] **Step 4: Add WhatIfTab component**

Insert this component after `PnlTab` and before the main `PortfolioClient` component:

```typescript
// ── Tab: What-If ──────────────────────────────────────────────────────────────
function WhatIfTab({ holdings }: { holdings: Holding[] }) {
  const T = useTheme()
  const [deltas, setDeltas] = useState<Record<string, number>>({})

  const sorted = [...holdings].sort((a, b) => valueUSD(b) - valueUSD(a))
  const totalCurrent = sorted.reduce((s, h) => s + valueUSD(h), 0)
  const totalProjected = sorted.reduce((s, h) => {
    const key = h.ticker ?? h.name
    const delta = deltas[key] ?? 0
    return s + valueUSD(h) * (1 + delta / 100)
  }, 0)
  const impact = totalProjected - totalCurrent
  const impactPct = totalCurrent > 0 ? (impact / totalCurrent) * 100 : 0

  function resetAll() { setDeltas({}) }

  return (
    <div style={{ padding: '0 12px' }}>
      {/* Summary card */}
      <div data-testid="whatif-summary" style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: '14px', marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: '0.63rem', color: T.mid, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Current</div>
            <div style={{ ...MONO, fontSize: '1rem', fontWeight: 700, color: T.pale }}>~${fmt(totalCurrent)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.63rem', color: T.mid, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Projected</div>
            <div data-testid="whatif-projected" style={{ ...MONO, fontSize: '1rem', fontWeight: 700, color: pnlColor(impact) }}>
              ~${fmt(totalProjected)}
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'center', ...MONO, fontSize: '1.1rem', fontWeight: 700, color: pnlColor(impact) }}>
          {impact >= 0 ? '+' : ''}${fmt(Math.abs(impact))} ({fmtPct(impactPct)})
        </div>
      </div>

      {/* Holdings list */}
      {sorted.map((h, i) => {
        const key = h.ticker ?? h.name + i
        const tickerKey = h.ticker ?? h.name + i
        const delta = deltas[tickerKey] ?? 0
        const projectedValue = valueUSD(h) * (1 + delta / 100)
        const currency = holdingCurrency(h)
        const sym = currency === 'SGD' ? 'S$' : currency === 'GBP' ? '£' : '$'
        const sc = sectorColor(holdingSector(h))

        return (
          <div key={key} style={{
            background: T.card, borderRadius: 10, marginBottom: 8,
            borderTop: `1px solid ${T.border}`, borderRight: `1px solid ${T.border}`,
            borderBottom: `1px solid ${T.border}`, borderLeft: `4px solid ${sc}`,
            padding: '10px 12px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <div style={{ ...MONO, fontSize: '0.88rem', fontWeight: 700, color: T.pale }}>
                  {h.ticker ?? h.name.slice(0, 10)}
                </div>
                <div style={{ ...MONO, fontSize: '0.75rem', color: T.mid }}>{sym}{fmt(h.market_value)}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  data-testid={`whatif-input-${h.ticker ?? h.name + i}`}
                  type="number"
                  step="0.5"
                  value={delta}
                  onChange={e => {
                    const v = parseFloat(e.target.value) || 0
                    setDeltas(prev => ({ ...prev, [tickerKey]: v }))
                  }}
                  style={{
                    width: 70, ...MONO, fontSize: '0.85rem', textAlign: 'right',
                    background: T.inset, border: `1px solid ${T.border}`, borderRadius: 6,
                    padding: '4px 6px',
                    color: delta === 0 ? T.mid : delta > 0 ? T.green : T.red,
                  }}
                />
                <span style={{ color: T.mid, fontSize: '0.78rem' }}>%</span>
              </div>
            </div>
            {delta !== 0 && (
              <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between' }}>
                <div style={{ fontSize: '0.7rem', color: T.mid }}>Projected</div>
                <div style={{ ...MONO, fontSize: '0.8rem', color: pnlColor(projectedValue - valueUSD(h)) }}>
                  ~${fmt(projectedValue)} ({delta >= 0 ? '+' : ''}{fmt(delta, 1)}%)
                </div>
              </div>
            )}
          </div>
        )
      })}

      <button
        style={{
          width: '100%', marginTop: 4,
          padding: '0.35rem 0.85rem', borderRadius: 6, border: 'none', cursor: 'pointer',
          fontSize: '0.8rem', fontWeight: 600, background: T.inset, color: T.pale,
          borderTop: `1px solid ${T.border}`,
        }}
        onClick={resetAll}
      >
        Reset All
      </button>
    </div>
  )
}
```

- [ ] **Step 5: Update the tab render block in PortfolioClient**

Find the current tab content block near the bottom of the `PortfolioClient` return statement:

```typescript
          {tab === 'holdings'  && <HoldingsTab  holdings={holdings} />}
          {tab === 'orders'    && <OrdersTab    holdings={holdings} />}
          {tab === 'geo'       && <GeoTab       holdings={holdings} />}
          {tab === 'sector'    && <SectorTab    holdings={holdings} />}
          {tab === 'dividends' && <DividendsTab holdings={holdings} />}
          {tab === 'pnl'       && <PnlTab       holdings={holdings} totalPnl={total_pnl} />}
          {tab === 'thesis'    && <ThesisTab    holdings={holdings} />}
```

Replace with:

```typescript
          {tab === 'holdings' && <HoldingsTab holdings={holdings} />}
          {tab === 'orders'   && <OrdersTab   holdings={holdings} />}
          {tab === 'geo'      && <GeoTab      holdings={holdings} />}
          {tab === 'sector'   && <SectorTab   holdings={holdings} />}
          {tab === 'pnl'      && <PnlTab      holdings={holdings} totalPnl={total_pnl} />}
          {tab === 'whatif'   && <WhatIfTab   holdings={holdings} />}
          {tab === 'growth'   && <GrowthTab />}
```

- [ ] **Step 6: Run What-If tests — expect green**

Run: `cd D:\a10101100_labs\root-of-all-blessings && npx vitest run tests/components/portfolio-client.test.tsx --reporter=verbose 2>&1 | grep -E "(PASS|FAIL|✓|✗|What-If)" | head -30`

Expected: All 6 What-If tests pass. All prior tests (sparklines, badges, theme toggle, etc.) still pass.

- [ ] **Step 7: Commit**

```bash
git add app/(protected)/portfolio/portfolio-client.tsx tests/components/portfolio-client.test.tsx
git commit -m "feat: add What-If scenario tab, replace Dividends tab"
```

---

## Task 3: Write failing tests for Growth tab

**Files:**
- Modify: `tests/components/portfolio-client.test.tsx`

- [ ] **Step 1: Add a mock for the history endpoint in the test helpers**

After the `SNAP` constant definition in the test file, add:

```typescript
const HISTORY = [
  { id: 'snap-a', snapshot_date: '2026-03-01T00:00:00.000Z', total_value: 9500, total_pnl: -200, created_at: '2026-03-01T00:00:00.000Z' },
  { id: 'snap-b', snapshot_date: '2026-03-15T00:00:00.000Z', total_value: 9800, total_pnl: 100, created_at: '2026-03-15T00:00:00.000Z' },
  { id: 'snap-c', snapshot_date: '2026-04-09T07:19:00.000Z', total_value: 10000, total_pnl: -30, created_at: '2026-04-09T07:19:00.000Z' },
]

function mockFetchWithHistory(portfolioData: unknown, historyData: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
    if (url.includes('/history')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(historyData) })
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve(portfolioData) })
  }))
}
```

- [ ] **Step 2: Add Growth tab test block at the end of the file**

Append to `tests/components/portfolio-client.test.tsx`:

```typescript
// ── Feature 7: Growth tab ─────────────────────────────────────────────────────
describe('Growth tab', () => {
  it('renders a Growth tab button in the tab bar', async () => {
    await renderDashboard()
    expect(screen.getByRole('button', { name: /growth/i })).toBeInTheDocument()
  })

  it('clicking Growth tab fetches /api/portfolio/history', async () => {
    mockFetchWithHistory(SNAP, HISTORY)
    const { PortfolioClient } = await import('@/app/(protected)/portfolio/portfolio-client')
    render(<PortfolioClient />)
    await waitFor(() => screen.getAllByTestId(/^holding-card-/).length > 0)

    fireEvent.click(screen.getByRole('button', { name: /growth/i }))

    await waitFor(() => {
      const fetchMock = vi.mocked(fetch)
      const historyCalls = fetchMock.mock.calls.filter(([url]) => (url as string).includes('/history'))
      expect(historyCalls.length).toBeGreaterThan(0)
    })
  })

  it('Growth tab shows a line chart when history has data', async () => {
    mockFetchWithHistory(SNAP, HISTORY)
    const { PortfolioClient } = await import('@/app/(protected)/portfolio/portfolio-client')
    render(<PortfolioClient />)
    await waitFor(() => screen.getAllByTestId(/^holding-card-/).length > 0)

    fireEvent.click(screen.getByRole('button', { name: /growth/i }))

    await waitFor(() => {
      expect(screen.getByTestId('line-chart')).toBeInTheDocument()
    })
  })

  it('Growth tab shows snapshot summary card with gain/loss', async () => {
    mockFetchWithHistory(SNAP, HISTORY)
    const { PortfolioClient } = await import('@/app/(protected)/portfolio/portfolio-client')
    render(<PortfolioClient />)
    await waitFor(() => screen.getAllByTestId(/^holding-card-/).length > 0)

    fireEvent.click(screen.getByRole('button', { name: /growth/i }))

    await waitFor(() => {
      expect(screen.getByTestId('growth-summary')).toBeInTheDocument()
    })
  })

  it('Growth tab shows "No snapshot history" when history is empty', async () => {
    mockFetchWithHistory(SNAP, [])
    const { PortfolioClient } = await import('@/app/(protected)/portfolio/portfolio-client')
    render(<PortfolioClient />)
    await waitFor(() => screen.getAllByTestId(/^holding-card-/).length > 0)

    fireEvent.click(screen.getByRole('button', { name: /growth/i }))

    await waitFor(() => {
      expect(screen.getByText(/no snapshot history/i)).toBeInTheDocument()
    })
  })

  it('Growth tab shows individual snapshot rows', async () => {
    mockFetchWithHistory(SNAP, HISTORY)
    const { PortfolioClient } = await import('@/app/(protected)/portfolio/portfolio-client')
    render(<PortfolioClient />)
    await waitFor(() => screen.getAllByTestId(/^holding-card-/).length > 0)

    fireEvent.click(screen.getByRole('button', { name: /growth/i }))

    await waitFor(() => {
      const rows = screen.getAllByTestId(/^growth-row-/)
      expect(rows).toHaveLength(HISTORY.length)
    })
  })
})
```

- [ ] **Step 3: Run the new tests to confirm they fail**

Run: `cd D:\a10101100_labs\root-of-all-blessings && npx vitest run tests/components/portfolio-client.test.tsx 2>&1 | tail -20`

Expected: All 6 Growth tests FAIL — confirms red phase.

- [ ] **Step 4: Commit the failing Growth tests**

```bash
git add tests/components/portfolio-client.test.tsx
git commit -m "test: add failing tests for Growth tab (TDD red phase)"
```

---

## Task 4: Implement GrowthTab component

**Files:**
- Modify: `app/(protected)/portfolio/portfolio-client.tsx`

- [ ] **Step 1: Add GrowthTab component**

Insert this component after `WhatIfTab` and before the main `PortfolioClient` component:

```typescript
// ── Tab: Growth ───────────────────────────────────────────────────────────────
interface HistoryPoint {
  id: string
  snapshot_date: string
  total_value: number
  total_pnl: number | null
  created_at: string
}

function GrowthTab() {
  const T = useTheme()
  const [history, setHistory] = useState<HistoryPoint[] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/portfolio/history')
      .then(r => r.json())
      .then((data: HistoryPoint[]) => setHistory(data))
      .catch(() => setHistory([]))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: T.mid }}>Loading…</div>
    )
  }

  if (!history || history.length === 0) {
    return (
      <div style={{ padding: '2rem 12px', textAlign: 'center', color: T.mid }}>
        No snapshot history available
      </div>
    )
  }

  const chartData = history.map(h => ({
    date: h.snapshot_date.slice(0, 10),
    value: Math.round(h.total_value),
  }))

  const first = chartData[0].value
  const last = chartData[chartData.length - 1].value
  const gain = last - first
  const gainPct = first > 0 ? (gain / first) * 100 : 0
  const minVal = Math.min(...chartData.map(d => d.value))
  const maxVal = Math.max(...chartData.map(d => d.value))

  return (
    <div style={{ padding: '0 12px' }}>
      {/* Summary */}
      <div
        data-testid="growth-summary"
        style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: '14px', marginBottom: 16, textAlign: 'center' }}
      >
        <div style={{ fontSize: '0.63rem', color: T.mid, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
          {history.length} Snapshots · {chartData[0].date} → {chartData[chartData.length - 1].date}
        </div>
        <div style={{ ...MONO, fontSize: '1.3rem', fontWeight: 700, color: pnlColor(gain) }}>
          {gain >= 0 ? '+' : ''}${fmt(Math.abs(gain))} ({fmtPct(gainPct)})
        </div>
      </div>

      {/* Line chart */}
      <div style={{ height: 220, marginBottom: 16 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
            <XAxis
              dataKey="date"
              tick={{ fontSize: 9, fill: T.mid }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              domain={[minVal * 0.96, maxVal * 1.04]}
              tickFormatter={(v: number) => `$${Math.round(v / 1000)}k`}
              tick={{ fontSize: 9, fill: T.mid }}
              tickLine={false}
              axisLine={false}
              width={36}
            />
            <Tooltip
              contentStyle={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 6, fontSize: '0.8rem' }}
              formatter={(v: number) => [`$${fmt(v)}`, 'Value']}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke={T.orange}
              strokeWidth={2}
              dot={{ fill: T.orange, r: 3 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Snapshot list (newest first) */}
      {[...history].reverse().map((h, i) => {
        const prev = [...history].reverse()[i + 1]
        const delta = prev ? h.total_value - prev.total_value : null
        const deltaPct = prev && prev.total_value > 0
          ? ((h.total_value - prev.total_value) / prev.total_value) * 100
          : null

        return (
          <div
            key={h.id}
            data-testid={`growth-row-${h.id}`}
            style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: '10px 14px', marginBottom: 8 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ ...MONO, fontSize: '0.85rem', fontWeight: 600, color: T.pale }}>
                ${fmt(h.total_value)}
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                {delta !== null && deltaPct !== null && (
                  <div style={{ ...MONO, fontSize: '0.75rem', color: pnlColor(delta) }}>
                    {delta >= 0 ? '+' : ''}${fmt(Math.abs(delta))} ({fmtPct(deltaPct)})
                  </div>
                )}
                <div style={{ fontSize: '0.72rem', color: T.mid }}>
                  {h.snapshot_date.slice(0, 10)}
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Run all component tests — expect full green**

Run: `cd D:\a10101100_labs\root-of-all-blessings && npx vitest run tests/components/portfolio-client.test.tsx --reporter=verbose 2>&1 | tail -40`

Expected: All tests pass (sparklines ×3, badges ×5, target bar ×3, 1D% ×4, theme ×7, What-If ×6, Growth ×6 = 34 tests).

- [ ] **Step 3: Run full test suite**

Run: `cd D:\a10101100_labs\root-of-all-blessings && npx vitest run 2>&1 | tail -15`

Expected: All tests pass. Note the exact count.

- [ ] **Step 4: TypeScript check**

Run: `cd D:\a10101100_labs\root-of-all-blessings && npx tsc --noEmit 2>&1 | head -20`

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add app/(protected)/portfolio/portfolio-client.tsx tests/components/portfolio-client.test.tsx
git commit -m "feat: add Growth history tab wired to /api/portfolio/history"
```

---

## Task 5: Create PR and merge

**Files:** None (git operations only)

- [ ] **Step 1: Verify branch and clean state**

Run: `git status && git log --oneline -5`

Expected: Clean working tree, 4 commits on `claude/kind-burnell-25ca98` (failing What-If tests, What-If impl, failing Growth tests, Growth impl).

- [ ] **Step 2: Push branch to remote**

Run: `git push -u origin claude/kind-burnell-25ca98`

Expected: Branch pushed successfully.

- [ ] **Step 3: Create PR**

Run:
```bash
gh pr create \
  --base main \
  --title "feat: replace Dividends/Thesis tabs with What-If + Growth tabs" \
  --body "$(cat <<'EOF'
## Summary
- Removes **Dividends** and **Thesis** tabs from the portfolio dashboard
- Adds **What-If** tab: client-side price scenario simulator — adjust % change per holding, see projected portfolio impact in real time with a Reset All button
- Adds **Growth** tab: historical portfolio value chart wired to \`/api/portfolio/history\`, with a Recharts line chart and per-snapshot delta rows
- New tab order: Holdings | Orders | Geo | Sector | P&L | What-If | Growth
- No schema or API changes — \`portfolio_snapshots\` history endpoint already existed

## Test plan
- [x] TDD: wrote failing tests before each implementation (red → green)
- [x] 6 new What-If tests: tab renders, inputs per holding, summary card, projected total updates, Reset All
- [x] 6 new Growth tests: tab renders, history fetch, line chart, summary, empty state, snapshot rows
- [x] All existing tests pass (sparklines, limit badges, target price bars, 1D%, theme toggle)
- [x] TypeScript clean (\`tsc --noEmit\`)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Merge the PR**

Run: `gh pr merge --squash --delete-branch`

Expected: PR merged to main.

---

## Self-Review

### Spec coverage
- ✓ Holdings tab: preserved (sparklines, limit badges, target price bar, DIV badge, 1D%, expand detail, theme)
- ✓ Orders tab: preserved (progress bars, fill distance, hardcoded OPEN_ORDERS)
- ✓ Geo tab: preserved (donut chart + geo cards)
- ✓ Sector tab: preserved (sector allocation bars)
- ✓ P&L tab: preserved (unrealised hero card, ranked bars, realised note)
- ✓ What-If tab: new — summary (current vs projected), per-holding % inputs, projected detail row, Reset All
- ✓ Growth tab: new — summary gain, Recharts LineChart, snapshot list with deltas
- ✓ Wired to Turso: Growth tab fetches `/api/portfolio/history` which reads `portfolio_snapshots` via libsql
- ✓ TDD: all new behaviour tested before implementation
- ✓ Schema + API: no new schema needed; history API pre-existing

### Placeholder scan
- No TBD or TODO
- All code blocks are complete and executable
- All types reference `Holding` from `lib/types.ts` (unchanged)
- `HistoryPoint` interface defined in full before use

### Type consistency
- `WhatIfTab` receives `{ holdings: Holding[] }` — consistent with all other tabs
- `GrowthTab` takes no props — fetches independently
- `HistoryPoint` shape matches `/api/portfolio/history` response (id, snapshot_date, total_value, total_pnl, created_at)
- `delta` key uses `h.ticker ?? h.name + i` — consistent between input `data-testid` and `deltas` state key
- `pnlColor`, `fmt`, `fmtPct`, `MONO`, `useTheme()` — all helpers available in scope
