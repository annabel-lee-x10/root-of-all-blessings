// @vitest-environment jsdom
// Regression test: approving a draft must dispatch 'transaction-saved' so that
// RecentTransactions and ExpenseDashboard refresh without a manual page reload.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'

const DRAFT: Record<string, unknown> = {
  id: 'draft-1',
  type: 'expense',
  amount: 12.5,
  currency: 'SGD',
  fx_rate: null,
  fx_date: null,
  sgd_equivalent: null,
  account_id: 'acc-1',
  account_name: 'DBS',
  to_account_id: null,
  to_account_name: null,
  category_id: null,
  category_name: null,
  payee: 'NTUC',
  note: null,
  payment_method: null,
  status: 'draft',
  datetime: '2026-04-20T10:00:00.000+08:00',
  created_at: '2026-04-20T02:00:00.000Z',
  updated_at: '2026-04-20T02:00:00.000Z',
  tags: [],
}

function makeFetch(drafts = [DRAFT]) {
  return vi.fn((url: string, opts?: RequestInit) => {
    if (typeof url === 'string' && url.includes('status=draft')) {
      return Promise.resolve({ ok: true, json: async () => ({ data: drafts, total: drafts.length }) })
    }
    if (typeof url === 'string' && url.includes('/api/accounts')) {
      return Promise.resolve({ ok: true, json: async () => [] })
    }
    if (typeof url === 'string' && url.includes('/api/categories')) {
      return Promise.resolve({ ok: true, json: async () => [] })
    }
    if (typeof url === 'string' && url.includes('/api/tags')) {
      return Promise.resolve({ ok: true, json: async () => [] })
    }
    // PATCH to approve
    if (opts?.method === 'PATCH') {
      return Promise.resolve({ ok: true, json: async () => ({ ...DRAFT, status: 'approved' }) })
    }
    return Promise.resolve({ ok: true, json: async () => ({}) })
  })
}

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('DraftsCard — approve dispatches transaction-saved (BUG)', () => {
  it('dispatches transaction-saved event when a draft is approved', async () => {
    vi.stubGlobal('fetch', makeFetch())

    const { DraftsCard } = await import('@/app/(protected)/components/drafts-card')
    render(<DraftsCard />)

    // Open the collapsible panel
    fireEvent.click(screen.getByRole('button', { name: /drafts/i }))

    // Wait for the draft to appear
    await waitFor(() => expect(screen.getByText('NTUC')).toBeInTheDocument())

    // Listen for the event before clicking Approve
    const received: Event[] = []
    window.addEventListener('transaction-saved', (e) => received.push(e))

    fireEvent.click(screen.getByRole('button', { name: /^Approve$/i }))

    await waitFor(() => expect(received).toHaveLength(1))

    window.removeEventListener('transaction-saved', received[0] as unknown as EventListener)
  })

  it('dispatches transaction-saved event when all drafts are approved', async () => {
    const DRAFT2 = { ...DRAFT, id: 'draft-2', payee: 'Grab' }
    vi.stubGlobal('fetch', makeFetch([DRAFT, DRAFT2]))

    const { DraftsCard } = await import('@/app/(protected)/components/drafts-card')
    render(<DraftsCard />)

    fireEvent.click(screen.getByRole('button', { name: /drafts/i }))

    await waitFor(() => expect(screen.getByText('NTUC')).toBeInTheDocument())

    const received: Event[] = []
    window.addEventListener('transaction-saved', (e) => received.push(e))

    fireEvent.click(screen.getByRole('button', { name: /approve all/i }))

    await waitFor(() => expect(received).toHaveLength(1))
  })
})
