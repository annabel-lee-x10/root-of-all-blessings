// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import '@testing-library/jest-dom'

const mockPush = vi.fn()

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}))

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/'),
  useRouter: vi.fn(() => ({ push: mockPush })),
}))

import { NavBar } from '@/app/(protected)/components/nav-bar'
import { usePathname } from 'next/navigation'

beforeEach(() => {
  vi.mocked(usePathname).mockReturnValue('/')
  mockPush.mockClear()
})

const getTopNav = () => screen.getByRole('navigation', { name: 'Top navigation' })
const getBottomNav = () => screen.getByRole('navigation', { name: 'Bottom navigation' })

// ── Top nav ──────────────────────────────────────────────────────────────────

describe('Top nav', () => {
  it('renders logo images', () => {
    render(<NavBar />)
    const topNav = getTopNav()
    expect(within(topNav).getAllByAltText('Root OS').length).toBeGreaterThanOrEqual(1)
  })

  it('renders view switcher button', () => {
    render(<NavBar />)
    expect(screen.getByRole('button', { name: 'Switch view' })).toBeInTheDocument()
  })

  it('shows Budget label on budget-view paths', () => {
    vi.mocked(usePathname).mockReturnValue('/transactions')
    render(<NavBar />)
    expect(screen.getByRole('button', { name: 'Switch view' })).toHaveTextContent('Budget')
  })

  it('shows Portfolio label on /portfolio', () => {
    vi.mocked(usePathname).mockReturnValue('/portfolio')
    render(<NavBar />)
    expect(screen.getByRole('button', { name: 'Switch view' })).toHaveTextContent('Portfolio')
  })

  it('opens view switcher dropdown when button is clicked', () => {
    render(<NavBar />)
    fireEvent.click(screen.getByRole('button', { name: 'Switch view' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
  })

  it('dropdown contains Budget and Portfolio menu items (no News)', () => {
    render(<NavBar />)
    fireEvent.click(screen.getByRole('button', { name: 'Switch view' }))
    const menu = screen.getByRole('menu')
    expect(within(menu).getByRole('menuitem', { name: 'Budget' })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: 'Portfolio' })).toBeInTheDocument()
    expect(within(menu).queryByRole('menuitem', { name: 'News' })).not.toBeInTheDocument()
  })

  it('closes dropdown when clicking a menu item', () => {
    render(<NavBar />)
    fireEvent.click(screen.getByRole('button', { name: 'Switch view' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Budget' }))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('navigates to /portfolio when Portfolio view is selected', () => {
    render(<NavBar />)
    fireEvent.click(screen.getByRole('button', { name: 'Switch view' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Portfolio' }))
    expect(mockPush).toHaveBeenCalledWith('/portfolio')
  })

  it('navigates to /dashboard when Budget view is selected from another view', () => {
    vi.mocked(usePathname).mockReturnValue('/portfolio')
    render(<NavBar />)
    fireEvent.click(screen.getByRole('button', { name: 'Switch view' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Budget' }))
    expect(mockPush).toHaveBeenCalledWith('/dashboard')
  })

  it('does not navigate when selecting the already-active view', () => {
    render(<NavBar />)
    fireEvent.click(screen.getByRole('button', { name: 'Switch view' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Budget' }))
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('renders Sign out button', () => {
    render(<NavBar />)
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
  })
})

// ── Budget bottom nav ─────────────────────────────────────────────────────────

describe('Budget view bottom nav', () => {
  it('shows Dashboard, Transactions, Categories tabs', () => {
    render(<NavBar />)
    const bottomNav = getBottomNav()
    expect(within(bottomNav).getByRole('link', { name: /Dashboard/i })).toBeInTheDocument()
    expect(within(bottomNav).getByRole('link', { name: 'Transactions' })).toBeInTheDocument()
    expect(within(bottomNav).getByRole('link', { name: /Categories/i })).toBeInTheDocument()
  })

  it('shows More button', () => {
    render(<NavBar />)
    expect(within(getBottomNav()).getByRole('button', { name: /More/i })).toBeInTheDocument()
  })

  it('Dashboard link points to /dashboard', () => {
    render(<NavBar />)
    expect(within(getBottomNav()).getByRole('link', { name: /Dashboard/i })).toHaveAttribute('href', '/dashboard')
  })

  it('Transactions link points to /transactions', () => {
    render(<NavBar />)
    expect(within(getBottomNav()).getByRole('link', { name: 'Transactions' })).toHaveAttribute('href', '/transactions')
  })

  it('Categories link points to /categories', () => {
    render(<NavBar />)
    expect(within(getBottomNav()).getByRole('link', { name: /Categories/i })).toHaveAttribute('href', '/categories')
  })

  it('FAB Add transaction link points to /add', () => {
    render(<NavBar />)
    expect(within(getBottomNav()).getByRole('link', { name: 'Add transaction' })).toHaveAttribute('href', '/add')
  })

  it('Dashboard tab is active on /dashboard', () => {
    vi.mocked(usePathname).mockReturnValue('/dashboard')
    render(<NavBar />)
    expect(within(getBottomNav()).getByRole('link', { name: /Dashboard/i })).toHaveAttribute('data-active', 'true')
  })

  it('Transactions tab is active on /transactions', () => {
    vi.mocked(usePathname).mockReturnValue('/transactions')
    render(<NavBar />)
    expect(within(getBottomNav()).getByRole('link', { name: 'Transactions' })).toHaveAttribute('data-active', 'true')
  })

  it('Categories tab is active on /categories', () => {
    vi.mocked(usePathname).mockReturnValue('/categories')
    render(<NavBar />)
    expect(within(getBottomNav()).getByRole('link', { name: /Categories/i })).toHaveAttribute('data-active', 'true')
  })

  it('does not show Portfolio link directly in bottom nav', () => {
    render(<NavBar />)
    expect(within(getBottomNav()).queryByRole('link', { name: /Portfolio/i })).not.toBeInTheDocument()
  })
})

// ── Budget More sheet ─────────────────────────────────────────────────────────

describe('Budget More sheet', () => {
  it('opens when More button is clicked', () => {
    render(<NavBar />)
    fireEvent.click(within(getBottomNav()).getByRole('button', { name: /More/i }))
    expect(screen.getByRole('dialog', { name: 'More options' })).toBeInTheDocument()
  })

  it('contains Accounts and Tags links (News and Portfolio removed)', () => {
    render(<NavBar />)
    fireEvent.click(within(getBottomNav()).getByRole('button', { name: /More/i }))
    const sheet = screen.getByRole('dialog', { name: 'More options' })
    expect(within(sheet).getByRole('link', { name: 'Accounts' })).toHaveAttribute('href', '/accounts')
    expect(within(sheet).getByRole('link', { name: 'Tags' })).toHaveAttribute('href', '/tags')
    expect(within(sheet).queryByRole('link', { name: 'News' })).not.toBeInTheDocument()
    expect(within(sheet).queryByRole('link', { name: 'Portfolio' })).not.toBeInTheDocument()
  })

  it('does NOT contain Dashboard, Transactions, or Categories links', () => {
    render(<NavBar />)
    fireEvent.click(within(getBottomNav()).getByRole('button', { name: /More/i }))
    const sheet = screen.getByRole('dialog', { name: 'More options' })
    expect(within(sheet).queryByRole('link', { name: /Dashboard/i })).not.toBeInTheDocument()
    expect(within(sheet).queryByRole('link', { name: 'Transactions' })).not.toBeInTheDocument()
    expect(within(sheet).queryByRole('link', { name: /Categories/i })).not.toBeInTheDocument()
  })

  it('contains Sign out button', () => {
    render(<NavBar />)
    fireEvent.click(within(getBottomNav()).getByRole('button', { name: /More/i }))
    const sheet = screen.getByRole('dialog', { name: 'More options' })
    expect(within(sheet).getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
  })

  it('closes when backdrop is clicked', () => {
    render(<NavBar />)
    fireEvent.click(within(getBottomNav()).getByRole('button', { name: /More/i }))
    expect(screen.getByRole('dialog', { name: 'More options' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('presentation'))
    expect(screen.queryByRole('dialog', { name: 'More options' })).not.toBeInTheDocument()
  })
})

// ── Portfolio bottom nav ──────────────────────────────────────────────────────

describe('Portfolio view bottom nav', () => {
  beforeEach(() => {
    vi.mocked(usePathname).mockReturnValue('/portfolio')
  })

  it('shows only the FAB — no Dashboard/Transactions/Categories', () => {
    render(<NavBar />)
    const bottomNav = getBottomNav()
    expect(within(bottomNav).queryByRole('link', { name: /Dashboard/i })).not.toBeInTheDocument()
    expect(within(bottomNav).queryByRole('link', { name: 'Transactions' })).not.toBeInTheDocument()
    expect(within(bottomNav).queryByRole('link', { name: /Categories/i })).not.toBeInTheDocument()
  })

  it('FAB is a button that dispatches portfolio:open-upload (not a link)', () => {
    render(<NavBar />)
    const dispatched: Event[] = []
    const handler = (e: Event) => dispatched.push(e)
    window.addEventListener('portfolio:open-upload', handler)
    const fab = within(getBottomNav()).getByRole('button', { name: 'Upload portfolio snapshot' })
    expect(fab).toBeInTheDocument()
    fireEvent.click(fab)
    window.removeEventListener('portfolio:open-upload', handler)
    expect(dispatched).toHaveLength(1)
    expect(within(getBottomNav()).queryByRole('link', { name: 'Upload portfolio snapshot' })).not.toBeInTheDocument()
  })

  it('does not show More button', () => {
    render(<NavBar />)
    expect(within(getBottomNav()).queryByRole('button', { name: /More/i })).not.toBeInTheDocument()
  })
})

// ── News view (removed — /news redirects to /portfolio) ──────────────────────
// The news view has been removed from the NavBar. /news redirects to /portfolio.
// No 'news' view entry exists in the view switcher or bottom nav.

// ── View detection ────────────────────────────────────────────────────────────

describe('View detection from URL', () => {
  it('budget view for /', () => {
    vi.mocked(usePathname).mockReturnValue('/')
    render(<NavBar />)
    expect(screen.getByRole('button', { name: 'Switch view' })).toHaveTextContent('Budget')
  })

  it('budget view for /dashboard', () => {
    vi.mocked(usePathname).mockReturnValue('/dashboard')
    render(<NavBar />)
    expect(screen.getByRole('button', { name: 'Switch view' })).toHaveTextContent('Budget')
  })

  it('budget view for /accounts', () => {
    vi.mocked(usePathname).mockReturnValue('/accounts')
    render(<NavBar />)
    expect(screen.getByRole('button', { name: 'Switch view' })).toHaveTextContent('Budget')
  })

  it('budget view for /tags', () => {
    vi.mocked(usePathname).mockReturnValue('/tags')
    render(<NavBar />)
    expect(screen.getByRole('button', { name: 'Switch view' })).toHaveTextContent('Budget')
  })

  it('portfolio view for /portfolio', () => {
    vi.mocked(usePathname).mockReturnValue('/portfolio')
    render(<NavBar />)
    expect(screen.getByRole('button', { name: 'Switch view' })).toHaveTextContent('Portfolio')
  })

  it('budget view for /news (news removed — redirects to /portfolio)', () => {
    vi.mocked(usePathname).mockReturnValue('/news')
    render(<NavBar />)
    expect(screen.getByRole('button', { name: 'Switch view' })).toHaveTextContent('Budget')
  })
})
