// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { initTestDb, clearTestDb, resetTestDb, req, seedAccount, seedCategory } from '../helpers'

vi.mock('@/lib/session', () => ({
  verifySession: vi.fn().mockResolvedValue(true),
  verifySessionToken: vi.fn().mockResolvedValue(true),
}))

beforeAll(() => initTestDb())
afterAll(() => clearTestDb())
beforeEach(() => {
  resetTestDb()
  seedAccount('acc1', 'DBS', 'bank')
  seedCategory('cat1', 'Food', 'expense')
})

// Smoke test that all budget API surfaces remain reachable post-kill.
// Each route handler is imported and invoked; we assert it returns a
// non-error HTTP status. This catches accidental damage to budget code.
describe('Budget API smoke — every route handler imports and responds 2xx', () => {
  it('GET /api/transactions', async () => {
    const { GET } = await import('@/app/api/transactions/route')
    const res = await GET(req('/api/transactions'))
    expect(res.status).toBeLessThan(500)
    expect(res.status).toBe(200)
  })

  it('POST /api/transactions creates a transaction', async () => {
    const { POST } = await import('@/app/api/transactions/route')
    const res = await POST(req('/api/transactions', 'POST', {
      type: 'expense',
      amount: 5,
      currency: 'SGD',
      account_id: 'acc1',
      category_id: 'cat1',
      datetime: '2026-04-28T10:00:00.000Z',
    }))
    expect(res.status).toBe(201)
  })

  it('GET /api/accounts', async () => {
    const { GET } = await import('@/app/api/accounts/route')
    const res = await GET()
    expect(res.status).toBe(200)
  })

  it('GET /api/categories', async () => {
    const { GET } = await import('@/app/api/categories/route')
    const res = await GET(req('/api/categories'))
    expect(res.status).toBe(200)
  })

  it('GET /api/categories/frequent', async () => {
    const { GET } = await import('@/app/api/categories/frequent/route')
    const res = await GET(req('/api/categories/frequent'))
    expect(res.status).toBe(200)
  })

  it('GET /api/dashboard?range=daily', async () => {
    const { GET } = await import('@/app/api/dashboard/route')
    const res = await GET(req('/api/dashboard?range=daily'))
    expect(res.status).toBe(200)
  })

  it('GET /api/tags', async () => {
    const { GET } = await import('@/app/api/tags/route')
    const res = await GET()
    expect(res.status).toBe(200)
  })

  it('GET /api/transactions/payees', async () => {
    const { GET } = await import('@/app/api/transactions/payees/route')
    const res = await GET()
    expect(res.status).toBe(200)
  })

  it('POST /api/migrate is idempotent', async () => {
    const { POST } = await import('@/app/api/migrate/route')
    const r1 = await POST()
    expect(r1.status).toBe(200)
    const r2 = await POST()
    expect(r2.status).toBe(200)
  })
})

// Verify the budget page route files still exist on disk.
// Catches accidental deletion of any budget UI page during the kill.
describe('Budget page modules exist on disk', () => {
  it.each([
    'app/(protected)/dashboard/page.tsx',
    'app/(protected)/add/page.tsx',
    'app/(protected)/transactions/page.tsx',
    'app/(protected)/categories/page.tsx',
    'app/(protected)/accounts/page.tsx',
    'app/(protected)/tags/page.tsx',
    'app/(protected)/tax/page.tsx',
    'app/(protected)/settings/page.tsx',
  ])('%s exists', async (relPath) => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const repoRoot = path.resolve(__dirname, '..', '..')
    expect(fs.existsSync(path.join(repoRoot, relPath))).toBe(true)
  })
})
