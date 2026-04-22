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
    <a href={href} {...(props as object)}>{children}</a>
  ),
}))

vi.mock('@/app/(protected)/components/theme-toggle', () => ({
  ThemeToggle: () => <button>Theme</button>,
}))

afterEach(() => {
  vi.resetModules()
})

describe('NavBar — news view removed', () => {
  it('view switcher pills do NOT include News', async () => {
    const { NavBar } = await import('@/app/(protected)/components/nav-bar')
    render(<NavBar />)
    expect(screen.queryByRole('button', { name: 'News' })).not.toBeInTheDocument()
  })

  it('view switcher pills include Budget and Portfolio', async () => {
    const { NavBar } = await import('@/app/(protected)/components/nav-bar')
    render(<NavBar />)
    expect(screen.getByRole('button', { name: 'Budget' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Portfolio' })).toBeInTheDocument()
  })

  it('portfolio FAB dispatches portfolio:open-upload event', async () => {
    const { NavBar } = await import('@/app/(protected)/components/nav-bar')
    const events: Event[] = []
    const handler = (e: Event) => events.push(e)
    window.addEventListener('portfolio:open-upload', handler)
    render(<NavBar />)
    const fab = screen.getByRole('button', { name: /upload portfolio snapshot/i })
    fab.click()
    expect(events).toHaveLength(1)
    window.removeEventListener('portfolio:open-upload', handler)
  })
})
