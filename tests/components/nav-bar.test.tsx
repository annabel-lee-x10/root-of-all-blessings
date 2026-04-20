// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import '@testing-library/jest-dom'

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}))

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/'),
}))

import { NavBar } from '@/app/(protected)/components/nav-bar'
import { usePathname } from 'next/navigation'

beforeEach(() => {
  vi.mocked(usePathname).mockReturnValue('/')
})

// Helpers to scope queries to each nav region
const getTopNav = () => screen.getByRole('navigation', { name: 'Top navigation' })
const getBottomNav = () => screen.getByRole('navigation', { name: 'Bottom navigation' })

describe('NavBar', () => {
  it('renders exactly 3 top-level tab labels in the top nav', () => {
    render(<NavBar />)
    const topNav = getTopNav()
    expect(within(topNav).getByText("Where's My Money")).toBeInTheDocument()
    expect(within(topNav).getByText('News')).toBeInTheDocument()
    expect(within(topNav).getByText('Portfolio')).toBeInTheDocument()
  })

  it('renders Transactions in the bottom bar but not Accounts before More is opened', () => {
    render(<NavBar />)
    const bottomNav = getBottomNav()
    expect(within(bottomNav).getByRole('link', { name: 'Transactions' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Accounts' })).not.toBeInTheDocument()
  })

  it('shows sub-menu items after clicking the dropdown toggle', () => {
    render(<NavBar />)
    const toggle = screen.getByLabelText("Where's My Money sub-menu")
    fireEvent.click(toggle)
    // Transactions is in both bottom bar and dropdown
    expect(screen.getAllByRole('link', { name: 'Transactions' }).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByRole('link', { name: 'Accounts' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Categories' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Tax' })).toBeInTheDocument()
  })

  it('hides sub-menu items when toggle is clicked again', () => {
    render(<NavBar />)
    const toggle = screen.getByLabelText("Where's My Money sub-menu")
    fireEvent.click(toggle)
    expect(screen.getByRole('link', { name: 'Accounts' })).toBeInTheDocument()
    fireEvent.click(toggle)
    // Accounts was only in the dropdown, so it disappears on close
    expect(screen.queryByRole('link', { name: 'Accounts' })).not.toBeInTheDocument()
  })

  it("WMM link points to /", () => {
    vi.mocked(usePathname).mockReturnValue('/')
    render(<NavBar />)
    const wmm = screen.getByText("Where's My Money").closest('a')
    expect(wmm).toHaveAttribute('href', '/')
  })

  it("WMM tab has data-active=true on / (root)", () => {
    vi.mocked(usePathname).mockReturnValue('/')
    render(<NavBar />)
    const wmm = screen.getByText("Where's My Money").closest('[data-active]')
    expect(wmm).toHaveAttribute('data-active', 'true')
  })

  it('WMM tab has data-active=true on /transactions (sub-page)', () => {
    vi.mocked(usePathname).mockReturnValue('/transactions')
    render(<NavBar />)
    const wmm = screen.getByText("Where's My Money").closest('[data-active]')
    expect(wmm).toHaveAttribute('data-active', 'true')
  })

  it('Portfolio tab in top nav has data-active=true on /portfolio', () => {
    vi.mocked(usePathname).mockReturnValue('/portfolio')
    render(<NavBar />)
    const topNav = getTopNav()
    const portfolio = within(topNav).getByText('Portfolio').closest('[data-active]')
    expect(portfolio).toHaveAttribute('data-active', 'true')
  })

  it('renders Sign out button', () => {
    render(<NavBar />)
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
  })

  it('sub-menu Transactions links all point to /transactions', () => {
    render(<NavBar />)
    fireEvent.click(screen.getByLabelText("Where's My Money sub-menu"))
    const links = screen.getAllByRole('link', { name: 'Transactions' })
    links.forEach((link) => expect(link).toHaveAttribute('href', '/transactions'))
  })

  it('sub-menu Tax link points to /tax', () => {
    render(<NavBar />)
    fireEvent.click(screen.getByLabelText("Where's My Money sub-menu"))
    expect(screen.getByRole('link', { name: 'Tax' })).toHaveAttribute('href', '/tax')
  })

  it('sub-menu Accounts link points to /accounts', () => {
    render(<NavBar />)
    fireEvent.click(screen.getByLabelText("Where's My Money sub-menu"))
    expect(screen.getByRole('link', { name: 'Accounts' })).toHaveAttribute('href', '/accounts')
  })

  it('sub-menu Categories link points to /categories', () => {
    render(<NavBar />)
    fireEvent.click(screen.getByLabelText("Where's My Money sub-menu"))
    expect(screen.getByRole('link', { name: 'Categories' })).toHaveAttribute('href', '/categories')
  })

  describe('Bottom tab bar', () => {
    it('renders Dashboard, Transactions, Portfolio tabs in bottom nav', () => {
      render(<NavBar />)
      const bottomNav = getBottomNav()
      expect(within(bottomNav).getByRole('link', { name: /Dashboard/i })).toBeInTheDocument()
      expect(within(bottomNav).getByRole('link', { name: 'Transactions' })).toBeInTheDocument()
      expect(within(bottomNav).getByRole('link', { name: /Portfolio/i })).toBeInTheDocument()
    })

    it('renders the Add transaction FAB link', () => {
      render(<NavBar />)
      const bottomNav = getBottomNav()
      expect(within(bottomNav).getByRole('link', { name: 'Add transaction' })).toBeInTheDocument()
    })

    it('Add transaction link points to /transactions', () => {
      render(<NavBar />)
      const bottomNav = getBottomNav()
      expect(within(bottomNav).getByRole('link', { name: 'Add transaction' })).toHaveAttribute('href', '/transactions')
    })

    it('Dashboard link points to /dashboard', () => {
      render(<NavBar />)
      const bottomNav = getBottomNav()
      expect(within(bottomNav).getByRole('link', { name: /Dashboard/i })).toHaveAttribute('href', '/dashboard')
    })

    it('Portfolio link points to /portfolio', () => {
      render(<NavBar />)
      const bottomNav = getBottomNav()
      expect(within(bottomNav).getByRole('link', { name: /Portfolio/i })).toHaveAttribute('href', '/portfolio')
    })

    it('opens More sheet when More button is clicked', () => {
      render(<NavBar />)
      const bottomNav = getBottomNav()
      const moreBtn = within(bottomNav).getByRole('button', { name: /More/i })
      fireEvent.click(moreBtn)
      expect(screen.getByRole('dialog', { name: 'More options' })).toBeInTheDocument()
    })

    it('More sheet contains Categories, Accounts, Tags, News links', () => {
      render(<NavBar />)
      fireEvent.click(within(getBottomNav()).getByRole('button', { name: /More/i }))
      const sheet = screen.getByRole('dialog', { name: 'More options' })
      expect(within(sheet).getByRole('link', { name: 'Categories' })).toHaveAttribute('href', '/categories')
      expect(within(sheet).getByRole('link', { name: 'Accounts' })).toHaveAttribute('href', '/accounts')
      expect(within(sheet).getByRole('link', { name: 'Tags' })).toHaveAttribute('href', '/tags')
      expect(within(sheet).getByRole('link', { name: 'News' })).toHaveAttribute('href', '/news')
    })

    it('More sheet closes when backdrop is clicked', () => {
      render(<NavBar />)
      fireEvent.click(within(getBottomNav()).getByRole('button', { name: /More/i }))
      expect(screen.getByRole('dialog', { name: 'More options' })).toBeInTheDocument()
      fireEvent.click(screen.getByRole('presentation'))
      expect(screen.queryByRole('dialog', { name: 'More options' })).not.toBeInTheDocument()
    })

    it('Transactions tab is active on /transactions', () => {
      vi.mocked(usePathname).mockReturnValue('/transactions')
      render(<NavBar />)
      const transLink = within(getBottomNav()).getByRole('link', { name: 'Transactions' })
      expect(transLink).toHaveAttribute('data-active', 'true')
    })

    it('Portfolio tab is active on /portfolio', () => {
      vi.mocked(usePathname).mockReturnValue('/portfolio')
      render(<NavBar />)
      const portLink = within(getBottomNav()).getByRole('link', { name: /Portfolio/i })
      expect(portLink).toHaveAttribute('data-active', 'true')
    })
  })
})
