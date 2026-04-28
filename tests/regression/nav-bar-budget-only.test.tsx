// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}))

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/dashboard'),
  useRouter: vi.fn(() => ({ push: mockPush })),
}))

vi.mock('@/app/(protected)/components/theme-toggle', () => ({
  ThemeToggle: () => <button>Theme</button>,
}))

import { NavBar } from '@/app/(protected)/components/nav-bar'
import { usePathname } from 'next/navigation'

beforeEach(() => {
  vi.mocked(usePathname).mockReturnValue('/dashboard')
  mockPush.mockClear()
})

const FORBIDDEN_HREFS = ['/portfolio', '/news']

function getAllAnchorHrefs(): string[] {
  return Array.from(document.querySelectorAll('a[href]')).map(
    (a) => (a as HTMLAnchorElement).getAttribute('href') ?? ''
  )
}

describe('NavBar — budget-only shape', () => {
  it('renders without throwing for /dashboard', () => {
    expect(() => render(<NavBar />)).not.toThrow()
  })

  it('top nav has NO Portfolio pill', () => {
    render(<NavBar />)
    expect(screen.queryByRole('button', { name: /^Portfolio$/i })).not.toBeInTheDocument()
  })

  it('top nav has NO News pill', () => {
    render(<NavBar />)
    expect(screen.queryByRole('button', { name: /^News$/i })).not.toBeInTheDocument()
  })

  it('renders no link to /portfolio anywhere in DOM', () => {
    render(<NavBar />)
    const hrefs = getAllAnchorHrefs()
    expect(hrefs.some((h) => h === '/portfolio' || h.startsWith('/portfolio/'))).toBe(false)
  })

  it('renders no link to /news anywhere in DOM', () => {
    render(<NavBar />)
    const hrefs = getAllAnchorHrefs()
    expect(hrefs.some((h) => h === '/news' || h.startsWith('/news/'))).toBe(false)
  })

  it('does not dispatch portfolio:open-upload when bottom nav is rendered', () => {
    render(<NavBar />)
    expect(
      screen.queryByRole('button', { name: /upload portfolio snapshot/i })
    ).not.toBeInTheDocument()
  })

  it('preserves Budget bottom nav: Dashboard, Transactions, Add, Categories', () => {
    render(<NavBar />)
    const bottomNav = screen.getByRole('navigation', { name: 'Bottom navigation' })
    expect(within(bottomNav).getByRole('link', { name: /Dashboard/i })).toHaveAttribute('href', '/dashboard')
    expect(within(bottomNav).getByRole('link', { name: /^Transactions$/i })).toHaveAttribute('href', '/transactions')
    expect(within(bottomNav).getByRole('link', { name: /Add transaction/i })).toHaveAttribute('href', '/add')
    expect(within(bottomNav).getByRole('link', { name: /^Categories$/i })).toHaveAttribute('href', '/categories')
  })

  it('does not render any forbidden href on /transactions', () => {
    vi.mocked(usePathname).mockReturnValue('/transactions')
    render(<NavBar />)
    const hrefs = getAllAnchorHrefs()
    for (const bad of FORBIDDEN_HREFS) {
      expect(hrefs.some((h) => h === bad || h.startsWith(`${bad}/`))).toBe(false)
    }
  })

  it('does not render any forbidden href on /accounts', () => {
    vi.mocked(usePathname).mockReturnValue('/accounts')
    render(<NavBar />)
    const hrefs = getAllAnchorHrefs()
    for (const bad of FORBIDDEN_HREFS) {
      expect(hrefs.some((h) => h === bad || h.startsWith(`${bad}/`))).toBe(false)
    }
  })
})
