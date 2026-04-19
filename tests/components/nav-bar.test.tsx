// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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

describe('NavBar', () => {
  it('renders exactly 3 top-level tab labels', () => {
    render(<NavBar />)
    expect(screen.getByText("Where's My Money")).toBeInTheDocument()
    expect(screen.getByText('News')).toBeInTheDocument()
    expect(screen.getByText('Portfolio')).toBeInTheDocument()
  })

  it('does not render Transactions or Accounts as visible links before dropdown is opened', () => {
    render(<NavBar />)
    expect(screen.queryByRole('link', { name: 'Transactions' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Accounts' })).not.toBeInTheDocument()
  })

  it('shows sub-menu items after clicking the dropdown toggle', () => {
    render(<NavBar />)
    const toggle = screen.getByLabelText("Where's My Money sub-menu")
    fireEvent.click(toggle)
    expect(screen.getByRole('link', { name: 'Transactions' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Accounts' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Categories' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Tax' })).toBeInTheDocument()
  })

  it('hides sub-menu when toggle is clicked again', () => {
    render(<NavBar />)
    const toggle = screen.getByLabelText("Where's My Money sub-menu")
    fireEvent.click(toggle)
    expect(screen.getByRole('link', { name: 'Transactions' })).toBeInTheDocument()
    fireEvent.click(toggle)
    expect(screen.queryByRole('link', { name: 'Transactions' })).not.toBeInTheDocument()
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

  it('Portfolio tab has data-active=true on /portfolio', () => {
    vi.mocked(usePathname).mockReturnValue('/portfolio')
    render(<NavBar />)
    const portfolio = screen.getByText('Portfolio').closest('[data-active]')
    expect(portfolio).toHaveAttribute('data-active', 'true')
  })

  it('renders Sign out button', () => {
    render(<NavBar />)
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
  })

  it('sub-menu Transactions link points to /transactions', () => {
    render(<NavBar />)
    fireEvent.click(screen.getByLabelText("Where's My Money sub-menu"))
    expect(screen.getByRole('link', { name: 'Transactions' })).toHaveAttribute('href', '/transactions')
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
})
