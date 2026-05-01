// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'

const showToastMock = vi.fn()
vi.mock('@/app/(protected)/components/toast', () => ({
  useToast: () => ({ showToast: showToastMock }),
}))
vi.mock('@/app/(protected)/components/confirm-dialog', () => ({
  ConfirmDialog: () => null,
}))

const ACCOUNT = {
  id: 'acc1', name: 'DBS', type: 'bank', currency: 'SGD',
  is_active: 1, created_at: '2024-01-01', updated_at: '2024-01-01',
}
const CATEGORY = {
  id: 'cat1', name: 'Food', type: 'expense', sort_order: 1, parent_id: null,
  created_at: '2024-01-01', updated_at: '2024-01-01',
}
const TX = {
  id: 'tx1', type: 'expense', amount: 12.5, currency: 'SGD',
  fx_rate: null, fx_date: null, sgd_equivalent: null,
  account_id: 'acc1', to_account_id: null, category_id: 'cat1',
  payee: 'Hawker', note: 'lunch', payment_method: 'bank',
  datetime: '2026-04-01T10:00:00+08:00', status: 'approved',
  created_at: '2026-04-01', updated_at: '2026-04-01',
  account_name: 'DBS', to_account_name: null, category_name: 'Food', tags: [],
}

function setupFetch(extra?: (url: string, init?: RequestInit) => Response | undefined) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url)
    const custom = extra?.(u, init)
    if (custom) return custom
    if (u.includes('/api/transactions/clone')) {
      return { ok: true, status: 201, json: async () => ({ ...TX, id: 'new-draft', status: 'draft' }) }
    }
    if (u.includes('/api/transactions') && !u.includes('/payees') && !u.includes('/clone')) {
      return { ok: true, json: async () => ({ data: [TX], total: 1 }) }
    }
    if (u.includes('/api/accounts')) return { ok: true, json: async () => [ACCOUNT] }
    if (u.includes('/api/categories/frequent')) return { ok: true, json: async () => [] }
    if (u.includes('/api/categories')) return { ok: true, json: async () => [CATEGORY] }
    if (u.includes('/api/tags')) return { ok: true, json: async () => [] }
    return { ok: true, json: async () => [] }
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
  showToastMock.mockReset()
})

async function openEditForm() {
  const { default: TransactionsPage } = await import('@/app/(protected)/transactions/page')
  render(<TransactionsPage />)
  await waitFor(() => expect(screen.getByText('Hawker')).toBeInTheDocument())
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
  await waitFor(() => expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument())
}

describe('Clone button on edit transaction form', () => {
  it('renders [Cancel] [Clone] [Save changes] in that DOM order', async () => {
    setupFetch()
    await openEditForm()
    // Anchor on Save changes (only one in DOM); its parent is the form's button row.
    const save = screen.getByRole('button', { name: /^save changes$/i })
    const row = save.parentElement!
    const buttons = Array.from(row.querySelectorAll('button'))
    const labels = buttons.map((b) => b.textContent?.trim().toLowerCase())
    expect(labels).toEqual(['cancel', 'clone', 'save changes'])
  })

  it('POSTs current form fields to /api/transactions/clone when Clone clicked', async () => {
    const fetchMock = setupFetch()
    await openEditForm()
    fireEvent.click(screen.getByRole('button', { name: /^clone$/i }))
    await waitFor(() => {
      const cloneCall = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes('/api/transactions/clone')
      )
      expect(cloneCall).toBeTruthy()
      const init = cloneCall![1] as RequestInit
      expect(init.method).toBe('POST')
      const body = JSON.parse(init.body as string)
      expect(body.type).toBe('expense')
      expect(body.amount).toBe(12.5)
      expect(body.currency).toBe('SGD')
      expect(body.account_id).toBe('acc1')
      expect(body.payee).toBe('Hawker')
      expect(body.note).toBe('lunch')
      expect(body.category_id).toBe('cat1')
      expect(body.datetime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
      expect(Array.isArray(body.tag_ids)).toBe(true)
    })
  })

  it('does NOT call PATCH /api/transactions/[id] when Clone is clicked', async () => {
    const fetchMock = setupFetch()
    await openEditForm()
    fireEvent.click(screen.getByRole('button', { name: /^clone$/i }))
    await waitFor(() => {
      expect(fetchMock.mock.calls.find((c) =>
        String(c[0]).includes('/api/transactions/clone')
      )).toBeTruthy()
    })
    const patchCall = fetchMock.mock.calls.find((c) => {
      const init = c[1] as RequestInit | undefined
      return init?.method === 'PATCH' && String(c[0]).includes('/api/transactions/tx1')
    })
    expect(patchCall).toBeUndefined()
  })

  it('shows a success toast with a "View drafts" action on success', async () => {
    setupFetch()
    await openEditForm()
    fireEvent.click(screen.getByRole('button', { name: /^clone$/i }))
    await waitFor(() => {
      const calls = showToastMock.mock.calls
      const success = calls.find((c) => c[1] === 'success')
      expect(success).toBeTruthy()
      expect(String(success![0]).toLowerCase()).toContain('draft')
      expect(success![2]).toBeTruthy()
      expect(success![2].label.toLowerCase()).toContain('draft')
      expect(typeof success![2].onClick).toBe('function')
    })
  })

  it('shows an error toast and leaves the form open on failure', async () => {
    setupFetch((url) => {
      if (url.includes('/api/transactions/clone')) {
        return { ok: false, status: 500, json: async () => ({ error: 'fail' }) } as Response
      }
      return undefined
    })
    await openEditForm()
    fireEvent.click(screen.getByRole('button', { name: /^clone$/i }))
    await waitFor(() => {
      const calls = showToastMock.mock.calls
      expect(calls.find((c) => c[1] === 'error')).toBeTruthy()
    })
    // edit form is still open
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument()
  })

  it('keeps the edit form open after a successful clone', async () => {
    setupFetch()
    await openEditForm()
    fireEvent.click(screen.getByRole('button', { name: /^clone$/i }))
    await waitFor(() => {
      const calls = showToastMock.mock.calls
      expect(calls.find((c) => c[1] === 'success')).toBeTruthy()
    })
    // Form is still open: Save changes still in DOM (unique), and its row contains all three buttons.
    const save = screen.getByRole('button', { name: /save changes/i })
    expect(save).toBeInTheDocument()
    const labels = Array.from(save.parentElement!.querySelectorAll('button'))
      .map((b) => b.textContent?.trim().toLowerCase())
    expect(labels).toEqual(['cancel', 'clone', 'save changes'])
  })
})
