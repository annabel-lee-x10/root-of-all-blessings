// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import React from 'react'

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) =>
    React.createElement('a', { href, ...props }, children),
}))

vi.mock('@/app/(protected)/components/toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

function makeAccount(overrides = {}) {
  return {
    id: 'cc-1',
    name: 'Citi 9773',
    type: 'credit_card',
    currency: 'SGD',
    is_active: 1,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function mockFetch(accounts: unknown[], stats = {}) {
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    if (String(url).includes('/api/accounts')) return Promise.resolve({ json: () => Promise.resolve(accounts), ok: true })
    if (String(url).includes('/api/stats')) return Promise.resolve({ json: () => Promise.resolve({ accounts: stats }), ok: true })
    return Promise.resolve({ json: () => Promise.resolve({}), ok: true })
  }))
}

afterEach(() => vi.unstubAllGlobals())

describe('BUG-031: Accounts page credit_card type', () => {
  it('renders Credit Card section heading when a credit_card account exists', async () => {
    mockFetch([makeAccount()])
    const { default: AccountsPage } = await import('@/app/(protected)/accounts/page')
    render(React.createElement(AccountsPage))
    await waitFor(() => expect(screen.getByText('Credit Card')).toBeInTheDocument(), { timeout: 3000 })
  })

  it('renders credit_card account name under Credit Card heading', async () => {
    mockFetch([makeAccount({ name: 'Citi 9773' })])
    const { default: AccountsPage } = await import('@/app/(protected)/accounts/page')
    render(React.createElement(AccountsPage))
    await waitFor(() => expect(screen.getByText('Citi 9773')).toBeInTheDocument(), { timeout: 3000 })
  })

  it('includes credit_card in the Type dropdown when creating a new account', async () => {
    mockFetch([])
    const { default: AccountsPage } = await import('@/app/(protected)/accounts/page')
    render(React.createElement(AccountsPage))
    const btn = await screen.findByRole('button', { name: '+ New Account' })
    fireEvent.click(btn)
    await waitFor(() => {
      const options = screen.getAllByRole('option')
      const values = options.map(o => (o as HTMLOptionElement).value)
      expect(values).toContain('credit_card')
    }, { timeout: 3000 })
  })
})
