# Merge News Into Portfolio (Option A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the standalone News route and merge all news functionality as a "Dashboard | News" tab toggle inside `PortfolioClient`, fed by a single portfolio HTML upload.

**Architecture:** `PortfolioClient` gains a `view: 'dashboard' | 'news'` state. The existing portfolio FAB becomes a `portfolio:open-upload` event dispatch (PortfolioClient listens and calls the file input). After a successful upload, PortfolioClient calls `/api/news/upload` to extract tickers, stores them in state, and passes them to the embedded `NewsClient` as a `sharedTickers` prop. NavBar loses the 'news' View type entirely. `/news` redirects to `/portfolio`.

**Tech Stack:** Next.js App Router, React 18, Vitest + Testing Library, TypeScript

---

## File Map

| File | Change |
|---|---|
| `app/(protected)/components/nav-bar.tsx` | Remove `'news'` View type; change portfolio FAB to dispatch `portfolio:open-upload` |
| `app/(protected)/news/news-client.tsx` | Add `sharedTickers?: string[]` + `onRequestUpload?: () => void` props; sync sharedTickers → internal state + auto-trigger port news |
| `app/(protected)/portfolio/portfolio-client.tsx` | Add `view` state + `portfolioTickers` state; listen for `portfolio:open-upload`; call `/api/news/upload` after upload; refactor `UploadPanel` to accept `onFile`; render `<NewsClient>` when view==='news'; add Dashboard|News toggle bar |
| `app/(protected)/news/page.tsx` | Redirect to `/portfolio` |
| `tests/regression/nav-bar-news-removed.test.tsx` | **New** — navBar has no News view, portfolio FAB dispatches `portfolio:open-upload` |
| `tests/components/portfolio-client-news-tab.test.tsx` | **New** — Dashboard/News toggle, `portfolio:open-upload` event, tickers passed to news view |

---

## Task 1: Failing tests for NavBar changes

**Files:**
- Create: `tests/regression/nav-bar-news-removed.test.tsx`

- [ ] **Step 1: Write the failing test file**

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'

vi.mock('next/navigation', () => ({
  usePathname: vi.fn().mockReturnValue('/portfolio'),
  useRouter: vi.fn().mockReturnValue({ push: vi.fn() }),
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

vi.mock('@/app/(protected)/components/theme-toggle', () => ({
  ThemeToggle: () => <button>Theme</button>,
}))

afterEach(() => {
  vi.resetModules()
})

describe('NavBar — news view removed', () => {
  it('view switcher dropdown does NOT include News', async () => {
    const { NavBar } = await import('@/app/(protected)/components/nav-bar')
    const user = userEvent.setup()
    render(<NavBar />)
    const switchBtn = screen.getByRole('button', { name: /switch view/i })
    await user.click(switchBtn)
    const items = screen.queryAllByRole('menuitem')
    const labels = items.map(el => el.textContent)
    expect(labels).not.toContain('News')
  })

  it('view switcher includes Budget and Portfolio', async () => {
    const { NavBar } = await import('@/app/(protected)/components/nav-bar')
    const user = userEvent.setup()
    render(<NavBar />)
    await user.click(screen.getByRole('button', { name: /switch view/i }))
    const labels = screen.getAllByRole('menuitem').map(el => el.textContent)
    expect(labels).toContain('Budget')
    expect(labels).toContain('Portfolio')
  })

  it('portfolio FAB dispatches portfolio:open-upload, NOT a link', async () => {
    const { NavBar } = await import('@/app/(protected)/components/nav-bar')
    const events: Event[] = []
    window.addEventListener('portfolio:open-upload', e => events.push(e))
    render(<NavBar />)
    const fab = screen.getByRole('button', { name: /upload portfolio snapshot/i })
    fab.click()
    expect(events).toHaveLength(1)
    window.removeEventListener('portfolio:open-upload', () => {})
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/regression/nav-bar-news-removed.test.tsx
```

Expected: FAIL — "News" still appears in view switcher; FAB is a `<Link>` not a `<button>` dispatching the event.

---

## Task 2: Implement NavBar changes

**Files:**
- Modify: `app/(protected)/components/nav-bar.tsx`

- [ ] **Step 1: Remove 'news' from View type and related maps**

In `nav-bar.tsx`, change:
```tsx
type View = 'budget' | 'portfolio' | 'news'

const VIEW_LABELS: Record<View, string> = {
  budget: 'Budget',
  portfolio: 'Portfolio',
  news: 'News',
}

const VIEW_HOME: Record<View, string> = {
  budget: '/dashboard',
  portfolio: '/portfolio',
  news: '/news',
}

function getView(pathname: string): View {
  if (pathname.startsWith('/portfolio')) return 'portfolio'
  if (pathname.startsWith('/news')) return 'news'
  return 'budget'
}
```

To:
```tsx
type View = 'budget' | 'portfolio'

const VIEW_LABELS: Record<View, string> = {
  budget: 'Budget',
  portfolio: 'Portfolio',
}

const VIEW_HOME: Record<View, string> = {
  budget: '/dashboard',
  portfolio: '/portfolio',
}

function getView(pathname: string): View {
  if (pathname.startsWith('/portfolio')) return 'portfolio'
  return 'budget'
}
```

- [ ] **Step 2: Update view switcher dropdown to only show 2 views**

Change:
```tsx
{(['budget', 'portfolio', 'news'] as View[]).map((v) => (
```

To:
```tsx
{(['budget', 'portfolio'] as View[]).map((v) => (
```

- [ ] **Step 3: Replace portfolio FAB Link with button that dispatches portfolio:open-upload**

The bottom nav currently has:
```tsx
) : (
  /* Portfolio / News — FAB only */
  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    {view === 'portfolio' ? (
      <Link href="/portfolio" aria-label="Upload portfolio snapshot" style={fabStyle}>
        <PlusIcon size={26} />
      </Link>
    ) : (
      <button
        aria-label="Add news"
        style={{ ...fabStyle, cursor: 'pointer', border: 'none', padding: 0 }}
        onClick={() => window.dispatchEvent(new CustomEvent('news:open-upload'))}
      >
        <PlusIcon size={26} />
      </button>
    )}
  </div>
)}
```

Replace with:
```tsx
) : (
  /* Portfolio — FAB only */
  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <button
      aria-label="Upload portfolio snapshot"
      style={{ ...fabStyle, cursor: 'pointer', border: 'none', padding: 0 }}
      onClick={() => window.dispatchEvent(new CustomEvent('portfolio:open-upload'))}
    >
      <PlusIcon size={26} />
    </button>
  </div>
)}
```

- [ ] **Step 4: Run failing tests — they should now pass**

```bash
npx vitest run tests/regression/nav-bar-news-removed.test.tsx
```

Expected: PASS (3/3)

- [ ] **Step 5: Run full test suite to confirm no regressions**

```bash
npx vitest run
```

Expected: All previously-passing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add app/(protected)/components/nav-bar.tsx tests/regression/nav-bar-news-removed.test.tsx
git commit -m "feat(nav): remove news view, portfolio FAB dispatches portfolio:open-upload"
```

---

## Task 3: Failing tests for NewsClient sharedTickers prop

**Files:**
- Create: `tests/components/portfolio-news-client-shared.test.tsx`

- [ ] **Step 1: Write the failing test file**

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'

const EMPTY_BRIEF = {
  id: 'b1',
  generated_at: new Date().toISOString(),
  brief_json: JSON.stringify({ world: [], sg: [], prop: [], jobsGlobal: [], jobsSg: [], port: [] }),
  tickers: null,
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => EMPTY_BRIEF,
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('NewsClient — sharedTickers prop', () => {
  it('shows Portfolio News section when sharedTickers has items (no upload needed)', async () => {
    const { NewsClient } = await import('@/app/(protected)/news/news-client')
    render(<NewsClient sharedTickers={['NVDA', 'MU']} />)
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled())
    // Portfolio section becomes visible because tickers are provided
    expect(screen.getByText('Portfolio News')).toBeInTheDocument()
  })

  it('calls onRequestUpload when Upload Portfolio button is clicked with onRequestUpload provided', async () => {
    const onRequestUpload = vi.fn()
    const { NewsClient } = await import('@/app/(protected)/news/news-client')
    render(<NewsClient sharedTickers={[]} onRequestUpload={onRequestUpload} />)
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled())
    const uploadBtn = screen.getByRole('button', { name: /upload portfolio/i })
    uploadBtn.click()
    expect(onRequestUpload).toHaveBeenCalledTimes(1)
  })

  it('shows ticker count in upload button when sharedTickers has items', async () => {
    const { NewsClient } = await import('@/app/(protected)/news/news-client')
    render(<NewsClient sharedTickers={['NVDA', 'MU', 'AAPL']} onRequestUpload={vi.fn()} />)
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled())
    expect(screen.getByRole('button', { name: /portfolio \(3\)/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run tests/components/portfolio-news-client-shared.test.tsx
```

Expected: FAIL — `sharedTickers` prop doesn't exist yet; Portfolio News section not visible.

---

## Task 4: Implement NewsClient sharedTickers + onRequestUpload props

**Files:**
- Modify: `app/(protected)/news/news-client.tsx`

- [ ] **Step 1: Add props to NewsClient export signature**

Change:
```tsx
export function NewsClient() {
```

To:
```tsx
export function NewsClient({
  sharedTickers,
  onRequestUpload,
}: {
  sharedTickers?: string[]
  onRequestUpload?: () => void
} = {}) {
```

- [ ] **Step 2: Add a ref to track previous sharedTickers for change detection**

After the existing `propFetchedRef` declaration, add:
```tsx
const sharedTickersPrevRef = useRef<string>('')
```

- [ ] **Step 3: Add useEffect to sync sharedTickers into internal state and auto-trigger portfolio news**

Add this effect after the existing `useEffect(() => { loadBrief() }, [loadBrief])` effect:

```tsx
useEffect(() => {
  if (sharedTickers === undefined) return
  const key = sharedTickers.join(',')
  if (key === sharedTickersPrevRef.current) return
  sharedTickersPrevRef.current = key
  setPortfolioTickers(sharedTickers)
  if (sharedTickers.length > 0) {
    void refreshPortfolioNews(sharedTickers)
  }
  // refreshPortfolioNews only closes over stable state setters; intentionally omitted from deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [sharedTickers])
```

- [ ] **Step 4: Update the Upload Portfolio button click handler to call onRequestUpload when provided**

Find the upload button in the sticky sub-nav:
```tsx
<button
  onClick={() => fileRef.current?.click()}
  disabled={uploading}
  style={{ ... }}
>
  {uploading ? 'Uploading...' : portfolioTickers.length > 0 ? `Portfolio (${portfolioTickers.length})` : 'Upload Portfolio'}
</button>
```

Change to:
```tsx
<button
  onClick={() => onRequestUpload ? onRequestUpload() : fileRef.current?.click()}
  disabled={uploading}
  style={{ ... }}
>
  {uploading ? 'Uploading...' : portfolioTickers.length > 0 ? `Portfolio (${portfolioTickers.length})` : 'Upload Portfolio'}
</button>
```

- [ ] **Step 5: Run the new tests — they should pass**

```bash
npx vitest run tests/components/portfolio-news-client-shared.test.tsx
```

Expected: PASS (3/3)

- [ ] **Step 6: Run full test suite**

```bash
npx vitest run
```

Expected: All previously-passing tests still pass (the `news:open-upload` listener is still in NewsClient; existing tests for it remain valid).

- [ ] **Step 7: Commit**

```bash
git add app/(protected)/news/news-client.tsx tests/components/portfolio-news-client-shared.test.tsx
git commit -m "feat(news): add sharedTickers + onRequestUpload props for portfolio embedding"
```

---

## Task 5: Failing tests for PortfolioClient Dashboard/News tab

**Files:**
- Create: `tests/components/portfolio-client-news-tab.test.tsx`

- [ ] **Step 1: Write the failing test file**

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'

// NewsClient renders loading state on mount — mock it to keep tests fast
vi.mock('@/app/(protected)/news/news-client', () => ({
  NewsClient: ({ sharedTickers }: { sharedTickers?: string[] }) => (
    <div data-testid="news-client">
      News view — tickers: {(sharedTickers ?? []).join(',')}
    </div>
  ),
}))

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => null, // no snapshot
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('PortfolioClient — Dashboard/News toggle', () => {
  it('renders Dashboard and News toggle buttons', async () => {
    const { PortfolioClient } = await import('@/app/(protected)/portfolio/portfolio-client')
    render(<PortfolioClient />)
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled())
    expect(screen.getByRole('button', { name: /^dashboard$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^news$/i })).toBeInTheDocument()
  })

  it('shows Dashboard view (upload panel) by default when no snapshot', async () => {
    const { PortfolioClient } = await import('@/app/(protected)/portfolio/portfolio-client')
    render(<PortfolioClient />)
    await waitFor(() => screen.getByRole('button', { name: /^dashboard$/i }))
    expect(screen.getByText(/no portfolio data yet/i)).toBeInTheDocument()
    expect(screen.queryByTestId('news-client')).not.toBeInTheDocument()
  })

  it('switches to News view when News tab is clicked', async () => {
    const { PortfolioClient } = await import('@/app/(protected)/portfolio/portfolio-client')
    render(<PortfolioClient />)
    await waitFor(() => screen.getByRole('button', { name: /^news$/i }))
    fireEvent.click(screen.getByRole('button', { name: /^news$/i }))
    await waitFor(() => expect(screen.getByTestId('news-client')).toBeInTheDocument())
    expect(screen.queryByText(/no portfolio data yet/i)).not.toBeInTheDocument()
  })

  it('portfolio:open-upload event triggers file input click', async () => {
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {})
    const { PortfolioClient } = await import('@/app/(protected)/portfolio/portfolio-client')
    render(<PortfolioClient />)
    await waitFor(() => screen.getByRole('button', { name: /^dashboard$/i }))
    window.dispatchEvent(new CustomEvent('portfolio:open-upload'))
    expect(clickSpy).toHaveBeenCalledTimes(1)
    clickSpy.mockRestore()
  })

  it('passes portfolioTickers to NewsClient after successful upload', async () => {
    const mockFetch = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
      if (url === '/api/portfolio/snapshots') return Promise.resolve({ ok: true, json: async () => null })
      if (url === '/api/portfolio' && (opts?.method === 'POST')) {
        return Promise.resolve({ ok: true, json: async () => ({ holdings_count: 5 }) })
      }
      if (url === '/api/news/upload') {
        return Promise.resolve({ ok: true, json: async () => ({ tickers: ['NVDA', 'MU'] }) })
      }
      return Promise.resolve({ ok: true, json: async () => null })
    })
    vi.stubGlobal('fetch', mockFetch)

    const { PortfolioClient } = await import('@/app/(protected)/portfolio/portfolio-client')
    render(<PortfolioClient />)
    await waitFor(() => screen.getByRole('button', { name: /^news$/i }))

    // Simulate file upload
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['<html><body>portfolio</body></html>'], 'portfolio.html', { type: 'text/html' })
    Object.defineProperty(input, 'files', { value: [file], writable: false, configurable: true })
    fireEvent.change(input)

    // Wait for both API calls
    await waitFor(() =>
      expect(mockFetch.mock.calls.some((c: unknown[]) => c[0] === '/api/news/upload')).toBe(true)
    )

    // Switch to news view and check tickers
    fireEvent.click(screen.getByRole('button', { name: /^news$/i }))
    await waitFor(() =>
      expect(screen.getByTestId('news-client').textContent).toContain('NVDA')
    )
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run tests/components/portfolio-client-news-tab.test.tsx
```

Expected: FAIL — toggle buttons don't exist, `portfolio:open-upload` not handled.

---

## Task 6: Implement PortfolioClient Dashboard/News toggle + embed NewsClient

**Files:**
- Modify: `app/(protected)/portfolio/portfolio-client.tsx`

- [ ] **Step 1: Add NewsClient import at the top of the file**

After the existing imports, add:
```tsx
import { NewsClient } from '../news/news-client'
```

- [ ] **Step 2: Add view and portfolioTickers state to PortfolioClient**

After `const [tab, setTab] = useState<Tab>('holdings')`, add:
```tsx
const [view, setView] = useState<'dashboard' | 'news'>('dashboard')
const [portfolioTickers, setPortfolioTickers] = useState<string[]>([])
```

- [ ] **Step 3: Add portfolio:open-upload event listener**

After the existing `useEffect(() => { load() }, [load])`, add:
```tsx
useEffect(() => {
  function onOpenUpload() { fileRef.current?.click() }
  window.addEventListener('portfolio:open-upload', onOpenUpload)
  return () => window.removeEventListener('portfolio:open-upload', onOpenUpload)
}, [])
```

- [ ] **Step 4: Extend handleFile to extract tickers after portfolio upload**

Replace the existing `handleFile` function:
```tsx
async function handleFile(file: File) {
  setUploading(true)
  try {
    const html = await file.text()
    const res = await fetch('/api/portfolio', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html, snapshot_date: new Date().toISOString() }),
    })
    const data = await res.json()
    if (!res.ok) { showToast(data.error || 'Parse failed', 'error'); return }
    showToast(`Imported ${data.holdings_count} holdings`, 'success')

    // Extract tickers for the News sub-view
    try {
      const form = new FormData()
      form.append('file', file)
      const tickerRes = await fetch('/api/news/upload', { method: 'POST', body: form })
      if (tickerRes.ok) {
        const { tickers } = await tickerRes.json() as { tickers: string[] }
        setPortfolioTickers(tickers)
      }
    } catch { /* ticker extraction is best-effort — portfolio upload already succeeded */ }

    await load()
  } catch { showToast('Upload failed', 'error') }
  finally { setUploading(false); if (fileRef.current) fileRef.current.value = '' }
}
```

- [ ] **Step 5: Refactor UploadPanel to accept onFile + disabled props instead of managing its own upload**

Replace the entire `UploadPanel` component:
```tsx
function UploadPanel({ onFile, disabled }: { onFile: (file: File) => void; disabled?: boolean }) {
  const T = useTheme()
  const panelFileRef = useRef<HTMLInputElement>(null)
  const [drag, setDrag] = useState(false)

  const BTN: React.CSSProperties = {
    padding: '0.35rem 0.85rem', borderRadius: 6, border: 'none', cursor: 'pointer',
    fontSize: '0.8rem', fontWeight: 600, background: T.orange, color: '#fff',
  }

  return (
    <div style={{ padding: '4rem 1.5rem', textAlign: 'center' }}>
      <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📊</div>
      <div style={{ color: T.pale, fontSize: '1.1rem', fontWeight: 600, marginBottom: 8 }}>No portfolio data yet</div>
      <div style={{ color: T.mid, fontSize: '0.85rem', marginBottom: 24, lineHeight: 1.6 }}>
        Run <code>npm run seed:snap27</code> to load Snap 27 data, or upload a Syfe HTML export.
      </div>
      <div
        onClick={() => panelFileRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) onFile(f) }}
        style={{
          border: `2px dashed ${drag ? T.orange : T.border}`, borderRadius: 10,
          padding: '2.5rem', cursor: 'pointer', marginBottom: 12,
          background: drag ? 'rgba(232,82,10,0.05)' : 'transparent',
        }}
      >
        <div style={{ color: drag ? T.orange : T.mid, fontSize: '0.9rem' }}>
          {disabled ? 'Parsing…' : 'Drop HTML file here, or click to browse'}
        </div>
      </div>
      <input ref={panelFileRef} type="file" accept=".html,.htm" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }} />
      <button style={BTN} onClick={() => panelFileRef.current?.click()} disabled={disabled}>
        {disabled ? 'Importing…' : 'Choose File'}
      </button>
    </div>
  )
}
```

- [ ] **Step 6: Add the Dashboard|News toggle bar component**

After the `WRAP` constant definition, add a helper:
```tsx
function ViewToggle({
  view, onSwitch, theme,
}: { view: 'dashboard' | 'news'; onSwitch: (v: 'dashboard' | 'news') => void; theme: Theme }) {
  return (
    <div style={{ display: 'flex', borderBottom: `1px solid ${theme.border}` }}>
      {(['dashboard', 'news'] as const).map(v => (
        <button key={v} onClick={() => onSwitch(v)} style={{
          flex: 1, padding: '10px', background: 'none', border: 'none', cursor: 'pointer',
          fontSize: '0.82rem', fontWeight: view === v ? 700 : 400,
          color: view === v ? theme.orange : theme.mid,
          borderBottom: view === v ? `2px solid ${theme.orange}` : '2px solid transparent',
          textTransform: 'capitalize',
        }}>
          {v === 'dashboard' ? 'Dashboard' : 'News'}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 7: Restructure PortfolioClient render to single return with conditional content**

Replace the entire content of `PortfolioClient` from the three separate `return` statements (loading, no-snapshot, with-snapshot) with a single unified return. The new render:

```tsx
// Derive snapshot-dependent values (only used in dashboard view)
const holdings = snapshot?.holdings ?? []
const total_value = snapshot?.total_value ?? 0
const unrealised_pnl = snapshot?.unrealised_pnl ?? null
const realised_pnl = snapshot?.realised_pnl ?? null
const cash = snapshot?.cash ?? null
const totalUSD = holdings.reduce((s, h) => s + valueUSD(h), 0)
const pnlPct = unrealised_pnl !== null && total_value > 0
  ? (unrealised_pnl / (total_value - (unrealised_pnl ?? 0))) * 100 : null

return (
  <ThemeCtx.Provider value={theme}>
    <div
      data-theme={dark ? 'dark' : 'light'}
      style={{ minHeight: '100vh', background: theme.bg, color: theme.pale, fontFamily: "'Sora', system-ui, sans-serif" }}
    >
      <div style={WRAP}>

        {/* Topbar — always visible */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '14px 16px 10px', borderBottom: `1px solid ${theme.border}`,
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 700, fontSize: '1rem', color: theme.pale }}>Portfolio</span>
              {snapshot?.snap_label && (
                <span data-testid="snap-label" style={{ ...TAG, background: theme.orange + '22', color: theme.orange, fontSize: '0.72rem' }}>
                  {snapshot.snap_label}
                </span>
              )}
            </div>
            {snapshot && (
              <div style={{ fontSize: '0.7rem', color: theme.mid, marginTop: 1 }}>
                {snapshot.snap_time ?? snapshot.snapshot_date.slice(0, 10)} · {holdings.length} holdings
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input ref={fileRef} type="file" accept=".html,.htm" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
            {snapshot && (
              <button style={BTN_SEC} onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? 'Importing…' : 'Update Snapshot'}
              </button>
            )}
            {themeToggle}
          </div>
        </div>

        {/* Dashboard | News toggle — always visible */}
        <ViewToggle view={view} onSwitch={setView} theme={theme} />

        {/* Content */}
        {view === 'news' ? (
          <NewsClient
            sharedTickers={portfolioTickers}
            onRequestUpload={() => fileRef.current?.click()}
          />
        ) : loading ? (
          <div style={{ padding: '3rem 1.5rem', textAlign: 'center', color: theme.mid }}>Loading…</div>
        ) : !snapshot ? (
          <UploadPanel onFile={handleFile} disabled={uploading} />
        ) : (
          <>
            {/* KPI row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, padding: '10px 12px' }}>
              {[
                {
                  label: 'Value',
                  primary: `$${fmt(total_value)}`,
                  secondary: Math.abs(totalUSD - total_value) > 10 ? `~$${fmt(totalUSD)} USD` : null,
                  color: theme.pale,
                },
                {
                  label: 'Unrealised',
                  primary: unrealised_pnl !== null ? `${unrealised_pnl >= 0 ? '+' : ''}$${fmt(Math.abs(unrealised_pnl))}` : '—',
                  secondary: pnlPct !== null ? fmtPct(pnlPct) : null,
                  color: unrealised_pnl !== null ? pnlColor(unrealised_pnl, theme) : theme.mid,
                },
                {
                  label: 'Realised',
                  primary: realised_pnl !== null ? `${realised_pnl >= 0 ? '+' : ''}$${fmt(Math.abs(realised_pnl))}` : `${holdings.length} pos`,
                  secondary: cash !== null ? `Cash $${fmt(cash)}` : null,
                  color: realised_pnl !== null ? pnlColor(realised_pnl, theme) : theme.pale,
                },
              ].map(k => (
                <div key={k.label} style={{ background: theme.card, border: `1px solid ${theme.border}`, borderRadius: 10, padding: '10px 12px' }}>
                  <div style={{ fontSize: '0.63rem', color: theme.mid, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3 }}>{k.label}</div>
                  <div style={{ ...MONO, fontSize: '0.92rem', fontWeight: 700, color: k.color }}>{k.primary}</div>
                  {k.secondary && <div style={{ ...MONO, fontSize: '0.65rem', color: k.color, opacity: 0.75 }}>{k.secondary}</div>}
                </div>
              ))}
            </div>

            {/* Tab bar */}
            <div style={{
              display: 'flex', overflowX: 'auto', padding: '4px 12px 0',
              borderBottom: `1px solid ${theme.border}`,
              scrollbarWidth: 'none',
            }}>
              {TABS.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)} style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: '8px 10px',
                  fontSize: '0.78rem', fontWeight: tab === t.id ? 700 : 400, whiteSpace: 'nowrap',
                  color: tab === t.id ? theme.orange : theme.mid,
                  borderBottom: tab === t.id ? `2px solid ${theme.orange}` : '2px solid transparent',
                  transition: 'color 0.15s',
                }}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div style={{ paddingTop: 12 }}>
              {tab === 'holdings' && <HoldingsTab holdings={holdings} />}
              {tab === 'orders'   && <OrdersTab orders={snapshot.orders} snap={snapshot} />}
              {tab === 'geo'      && <GeoTab holdings={holdings} />}
              {tab === 'sector'   && <SectorTab holdings={holdings} />}
              {tab === 'pnl'      && <PnlTab holdings={holdings} snap={snapshot} />}
              {tab === 'whatif'   && <WhatIfTab holdings={holdings} />}
              {tab === 'growth'   && <GrowthTab growth={snapshot.growth} milestones={snapshot.milestones} />}
            </div>
          </>
        )}

      </div>
    </div>
  </ThemeCtx.Provider>
)
```

Note: `BTN_SEC` is currently defined inside the main render. Move its definition before the new unified return:
```tsx
const BTN_SEC: React.CSSProperties = {
  padding: '0.35rem 0.85rem', borderRadius: 6, cursor: 'pointer',
  fontSize: '0.8rem', fontWeight: 600, background: theme.inset, color: theme.pale,
  border: `1px solid ${theme.border}`,
}
```

- [ ] **Step 8: Run the new portfolio-client tests**

```bash
npx vitest run tests/components/portfolio-client-news-tab.test.tsx
```

Expected: PASS (5/5)

- [ ] **Step 9: Run full test suite**

```bash
npx vitest run
```

Expected: All previously-passing tests still pass.

- [ ] **Step 10: Commit**

```bash
git add app/(protected)/portfolio/portfolio-client.tsx tests/components/portfolio-client-news-tab.test.tsx
git commit -m "feat(portfolio): add Dashboard/News toggle, embed NewsClient, extract tickers after upload"
```

---

## Task 7: Redirect /news/page.tsx to /portfolio

**Files:**
- Modify: `app/(protected)/news/page.tsx`

- [ ] **Step 1: Replace NewsClient render with redirect**

Replace the entire file with:
```tsx
import { redirect } from 'next/navigation'

export default function NewsPage() {
  redirect('/portfolio')
}
```

Note: `export const metadata` is removed since the redirect page doesn't render.

- [ ] **Step 2: Run full test suite**

```bash
npx vitest run
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add app/(protected)/news/page.tsx
git commit -m "feat(news): redirect /news to /portfolio (news now a sub-view)"
```

---

## Task 8: Build verification and PR

- [ ] **Step 1: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 2: Run full test suite one final time**

```bash
npx vitest run
```

Expected: All tests pass.

- [ ] **Step 3: Push and create PR**

```bash
git push -u origin claude/intelligent-kepler-d0e2d8
gh pr create \
  --title "feat: merge News into Portfolio as Dashboard/News sub-view" \
  --body "$(cat <<'EOF'
## Summary

- Removes the standalone News bottom-nav tab and `/news` route (now redirects to `/portfolio`)
- Adds a **Dashboard | News** toggle bar inside the Portfolio screen
- One portfolio HTML upload now feeds both the holdings dashboard AND ticker-filtered news
- NavBar `View` type shrinks from 3 values (`budget | portfolio | news`) to 2 (`budget | portfolio`)
- Portfolio FAB dispatches `portfolio:open-upload` custom event (same pattern as old `news:open-upload`)
- `NewsClient` gains `sharedTickers` + `onRequestUpload` props for embedding; standalone usage unchanged

## Test plan

- [ ] `npx vitest run tests/regression/nav-bar-news-removed.test.tsx` — NavBar no longer has News view
- [ ] `npx vitest run tests/components/portfolio-news-client-shared.test.tsx` — sharedTickers prop works
- [ ] `npx vitest run tests/components/portfolio-client-news-tab.test.tsx` — Dashboard/News toggle works
- [ ] `npx vitest run` — Full suite green
- [ ] Vercel preview: upload a Syfe HTML → holdings appear in Dashboard tab → switch to News tab → Portfolio News auto-generates
- [ ] Vercel preview: `/news` URL redirects to `/portfolio`
- [ ] Vercel preview: Portfolio FAB (+) opens file picker on mobile
- [ ] Vercel preview: View switcher shows Budget | Portfolio (no News)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Watch Vercel deployment**

```bash
gh pr checks --watch
```

Fix any build errors that appear. Common issues:
- TypeScript error if `BTN_SEC` is referenced before definition — move it above the return
- Import cycle if `PortfolioClient` and `NewsClient` are in the same file (they're not — safe)
- `redirect()` in a server component should work; if build fails, try `import { permanentRedirect } from 'next/navigation'` instead

---

## Self-Review Checklist

**Spec coverage:**
- ✅ Portfolio tab keeps its + button (upload HTML snapshot) → portfolio:open-upload FAB
- ✅ Upload feeds BOTH portfolio dashboard AND ticker news → handleFile calls /api/news/upload
- ✅ Dashboard | News toggle inside Portfolio screen → ViewToggle component
- ✅ News bottom-nav tab removed → View type has no 'news'
- ✅ Top-nav view switcher drops "News" → view switcher maps over ['budget', 'portfolio']
- ✅ news:open-upload custom event no longer dispatched from nav-bar → removed from FAB
- ✅ All existing news functionality kept → NewsClient unchanged except new props
- ✅ /news route handled → redirect to /portfolio

**No placeholders:** All steps have complete code.

**Type consistency:**
- `UploadPanel` props change from `{ onUploaded: () => void }` to `{ onFile: (file: File) => void; disabled?: boolean }` — used consistently in Task 6 Steps 5 and 7
- `ViewToggle` component defined in Task 6 Step 6, used in Task 6 Step 7 ✅
- `NewsClient` props `sharedTickers` and `onRequestUpload` defined in Task 4 Step 1, used in Task 6 Step 7 ✅
- `portfolioTickers` state in `PortfolioClient` defined in Task 6 Step 2, passed to `NewsClient` in Task 6 Step 7 ✅
