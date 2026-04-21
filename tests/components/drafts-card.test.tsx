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

const CATEGORY_DINING = { id: 'cat-dining', name: 'Dining Out', type: 'expense', sort_order: 1, parent_id: null, created_at: '2024-01-01', updated_at: '2024-01-01' }
// "Dining Out" tag shares a name with the category — BUG-029 regression
const TAG_DINING = { id: 'tag-dining', name: 'Dining Out', created_at: '2024-01-01' }
const TAG_WEEKEND = { id: 'tag-weekend', name: 'weekend', created_at: '2024-01-01' }

function makeFetch(drafts = [DRAFT], { categories = [] as object[], tags = [] as object[] } = {}) {
  return vi.fn((url: string, opts?: RequestInit) => {
    if (typeof url === 'string' && url.includes('status=draft')) {
      return Promise.resolve({ ok: true, json: async () => ({ data: drafts, total: drafts.length }) })
    }
    if (typeof url === 'string' && url.includes('/api/accounts')) {
      return Promise.resolve({ ok: true, json: async () => [] })
    }
    if (typeof url === 'string' && url.includes('/api/categories')) {
      return Promise.resolve({ ok: true, json: async () => categories })
    }
    if (typeof url === 'string' && url.includes('/api/tags')) {
      return Promise.resolve({ ok: true, json: async () => tags })
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

// ---------------------------------------------------------------------------
// BUG-029 regression: DraftsCard tag picker must not show category-named tags
// ---------------------------------------------------------------------------
describe('DraftsCard — BUG-029 regression: tag picker excludes category-named tags', () => {
  it('does not show a tag whose name matches a category name', async () => {
    vi.stubGlobal('fetch', makeFetch([DRAFT], {
      categories: [CATEGORY_DINING],
      tags: [TAG_DINING, TAG_WEEKEND],
    }))

    const { DraftsCard } = await import('@/app/(protected)/components/drafts-card')
    render(<DraftsCard />)

    fireEvent.click(screen.getByRole('button', { name: /drafts/i }))
    await waitFor(() => expect(screen.getByText('NTUC')).toBeInTheDocument())

    // Open edit form
    fireEvent.click(screen.getByRole('button', { name: /^Edit$/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument())

    // "Dining Out" matches a category name — must NOT appear as a tag toggle button
    const tagButtons = screen.queryAllByRole('button', { name: /dining out/i })
    expect(tagButtons).toHaveLength(0)
  })

  it('still shows tags whose names do not match any category', async () => {
    vi.stubGlobal('fetch', makeFetch([DRAFT], {
      categories: [CATEGORY_DINING],
      tags: [TAG_DINING, TAG_WEEKEND],
    }))

    const { DraftsCard } = await import('@/app/(protected)/components/drafts-card')
    render(<DraftsCard />)

    fireEvent.click(screen.getByRole('button', { name: /drafts/i }))
    await waitFor(() => expect(screen.getByText('NTUC')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /^Edit$/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument())

    // "weekend" has no matching category — must appear as a tag button
    expect(screen.getByRole('button', { name: /^weekend$/i })).toBeInTheDocument()
  })
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
