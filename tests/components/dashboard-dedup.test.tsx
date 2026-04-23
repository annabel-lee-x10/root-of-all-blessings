// @vitest-environment jsdom
// Fix 1: DraftsCard and RecentTransactions must NOT fetch /api/accounts, /api/categories,
// or /api/tags when those arrays are supplied as props by the parent (dashboard page).
// The parent fetches them once server-side; redundant client-side re-fetches are eliminated.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'

const ACCOUNTS = [
  { id: 'acc-1', name: 'DBS', type: 'bank', currency: 'SGD', is_active: 1, created_at: '2024-01-01', updated_at: '2024-01-01' },
]
const CATEGORIES = [
  { id: 'cat-1', name: 'Food', type: 'expense', sort_order: 0, parent_id: null, created_at: '2024-01-01', updated_at: '2024-01-01' },
]
const TAGS = [
  { id: 'tag-1', name: 'hawker', created_at: '2024-01-01' },
]

function makeFetch() {
  return vi.fn().mockImplementation((url: string) => {
    if (typeof url === 'string' && url.includes('/api/transactions')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [], total: 0 }) })
    }
    if (typeof url === 'string' && url.includes('/api/categories/frequent')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
    }
    // Catch-all — tracks unexpected calls without throwing
    return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
  })
}

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('Fix 1: DraftsCard skips shared-data fetches when props are provided', () => {
  it('does NOT fetch /api/accounts, /api/categories, or /api/tags when props are supplied', async () => {
    const fetchMock = makeFetch()
    vi.stubGlobal('fetch', fetchMock)

    const { DraftsCard } = await import('@/app/(protected)/components/drafts-card')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    render(<DraftsCard {...({ accounts: ACCOUNTS, categories: CATEGORIES, tags: TAGS } as any)} />)

    // Wait for the drafts fetch — proves effects actually ran
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/transactions'))
    })

    const urls = (fetchMock.mock.calls as [string, unknown?][]).map(([url]) => url)
    expect(urls.some(u => u.includes('/api/accounts'))).toBe(false)
    expect(urls.some(u => u.includes('/api/categories') && !u.includes('/frequent'))).toBe(false)
    expect(urls.some(u => u === '/api/tags')).toBe(false)
  })
})

describe('Fix 1: RecentTransactions skips shared-data fetches when props are provided', () => {
  it('does NOT fetch /api/accounts, /api/categories, or /api/tags when props are supplied', async () => {
    const fetchMock = makeFetch()
    vi.stubGlobal('fetch', fetchMock)

    const { RecentTransactions } = await import('@/app/(protected)/components/recent-transactions')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    render(<RecentTransactions {...({ accounts: ACCOUNTS, categories: CATEGORIES, tags: TAGS } as any)} />)

    // Wait for the transactions fetch — proves effects actually ran
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('limit=5'))
    })

    const urls = (fetchMock.mock.calls as [string, unknown?][]).map(([url]) => url)
    expect(urls.some(u => u.includes('/api/accounts'))).toBe(false)
    expect(urls.some(u => u.includes('/api/categories') && !u.includes('/frequent'))).toBe(false)
    expect(urls.some(u => u === '/api/tags')).toBe(false)
  })
})
