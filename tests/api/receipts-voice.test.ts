// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import { verifySession } from '@/lib/session'
import {
  initTestDb, clearTestDb, resetTestDb, req,
  seedAccount, seedCategory,
} from '../helpers'

vi.mock('@/lib/session', () => ({
  verifySession: vi.fn().mockResolvedValue(true),
  verifySessionToken: vi.fn().mockResolvedValue(true),
}))

const MOCK_CLAUDE_RESPONSE = {
  content: [{
    type: 'text',
    text: [
      'Amount: 5.50',
      'Currency: SGD',
      'Merchant/Payee: Kopitiam',
      'Date: 2026-04-19',
      'Category: Food',
      'Tags: lunch, hawker, local',
      'Description: Quick lunch at the hawker centre.',
    ].join('\n'),
  }],
}

beforeAll(() => initTestDb())
afterAll(() => clearTestDb())

beforeEach(() => {
  resetTestDb()
  seedAccount('acc1', 'DBS', 'bank')
  seedCategory('cat1', 'Food', 'expense')
  process.env.ANTHROPIC_API_KEY = 'test-key'
  vi.mocked(verifySession).mockResolvedValue(true)
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => MOCK_CLAUDE_RESPONSE,
  } as Response))
})

afterEach(() => {
  vi.restoreAllMocks()
  delete process.env.ANTHROPIC_API_KEY
})

describe('POST /api/receipts/voice', () => {
  it('returns 401 when no session', async () => {
    vi.mocked(verifySession).mockResolvedValueOnce(false)
    const { POST } = await import('@/app/api/receipts/voice/route')
    const res = await POST(req('/api/receipts/voice', 'POST', {
      text: 'lunch at kopitiam 5.50',
      accountId: 'acc1',
    }))
    expect(res.status).toBe(401)
  })

  it('returns 503 when ANTHROPIC_API_KEY is not set', async () => {
    delete process.env.ANTHROPIC_API_KEY
    const { POST } = await import('@/app/api/receipts/voice/route')
    const res = await POST(req('/api/receipts/voice', 'POST', {
      text: 'lunch 5.50',
      accountId: 'acc1',
    }))
    expect(res.status).toBe(503)
  })

  it('returns 400 when text is missing', async () => {
    const { POST } = await import('@/app/api/receipts/voice/route')
    const res = await POST(req('/api/receipts/voice', 'POST', { accountId: 'acc1' }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toMatch(/text/i)
  })

  it('returns 400 when text is empty string', async () => {
    const { POST } = await import('@/app/api/receipts/voice/route')
    const res = await POST(req('/api/receipts/voice', 'POST', { text: '   ', accountId: 'acc1' }))
    expect(res.status).toBe(400)
  })

  it('creates a draft transaction from voice transcript', async () => {
    const { POST } = await import('@/app/api/receipts/voice/route')
    const res = await POST(req('/api/receipts/voice', 'POST', {
      text: 'lunch at kopitiam 5.50',
      accountId: 'acc1',
    }))
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.draft).toBeDefined()
    expect(data.draft.status).toBe('draft')
    expect(data.draft.amount).toBe(5.5)
    expect(data.draft.payee).toBe('Kopitiam')
    expect(data.draft.account_id).toBe('acc1')
  })

  it('returns 422 when Claude cannot extract amount', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ type: 'text', text: 'Merchant/Payee: Kopitiam\nCategory: Food' }],
      }),
    } as Response))
    const { POST } = await import('@/app/api/receipts/voice/route')
    const res = await POST(req('/api/receipts/voice', 'POST', {
      text: 'lunch at kopitiam',
      accountId: 'acc1',
    }))
    expect(res.status).toBe(422)
  })

  it('falls back to first active account when accountId not provided', async () => {
    const { POST } = await import('@/app/api/receipts/voice/route')
    const res = await POST(req('/api/receipts/voice', 'POST', {
      text: 'coffee 4 bucks',
    }))
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.draft.account_id).toBe('acc1')
  })

  it('BUG-063: populates category_id when DB category name differs from old hard-coded prompt list', async () => {
    // Same fix as the OCR route: the voice route hard-coded a category list in
    // its prompt. If the DB uses different names ('Food and Drink' vs 'Food'),
    // the LLM picks something that doesn't exist and category_id stays null.
    // The fix injects the actual DB names into the prompt.
    resetTestDb()
    seedAccount('acc1', 'DBS', 'bank')
    seedCategory('cat-food-drink', 'Food and Drink', 'expense')

    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      const reqBody = JSON.parse(init.body as string)
      const promptText: string = reqBody.messages[0].content ?? ''
      const picked = promptText.includes('Food and Drink') ? 'Food and Drink' : 'Other'
      return Promise.resolve({
        ok: true,
        json: async () => ({
          content: [{ type: 'text', text: `Amount: 5.00\nMerchant/Payee: Test\nCategory: ${picked}` }],
        }),
      } as Response)
    }))

    const { POST } = await import('@/app/api/receipts/voice/route')
    const res = await POST(req('/api/receipts/voice', 'POST', {
      text: 'lunch 5 bucks',
      accountId: 'acc1',
    }))
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.draft.category_id).toBe('cat-food-drink')
  })

  it('BUG-064: prompt structures categories as Parent > Subcategories list with disambiguation rules', async () => {
    resetTestDb()
    seedAccount('acc1', 'DBS', 'bank')
    seedCategory('cat-food', 'Food', 'expense')
    seedCategory('cat-meals', 'Meals', 'expense', 'cat-food')
    seedCategory('cat-lifestyle', 'Lifestyle', 'expense')
    seedCategory('cat-delivery', 'Delivery', 'expense', 'cat-lifestyle')

    let capturedPrompt = ''
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      const reqBody = JSON.parse(init.body as string)
      capturedPrompt = reqBody.messages[0].content ?? ''
      return Promise.resolve({
        ok: true,
        json: async () => ({
          content: [{ type: 'text', text: 'Amount: 5\nCategory: Food > Meals' }],
        }),
      } as Response)
    }))

    const { POST } = await import('@/app/api/receipts/voice/route')
    await POST(req('/api/receipts/voice', 'POST', {
      text: 'foodpanda dinner 5 bucks',
      accountId: 'acc1',
    }))

    expect(capturedPrompt).toMatch(/Food\s*>\s*[^\n]*Meals/)
    expect(capturedPrompt).toMatch(/Lifestyle\s*>\s*[^\n]*Delivery/)
    expect(capturedPrompt).toMatch(/Parent\s*>\s*Subcategory/i)
    expect(capturedPrompt.toLowerCase()).toContain('grabfood')
    expect(capturedPrompt.toLowerCase()).toContain('foodpanda')
  })

  it('BUG-064: GrabFood food-delivery transcript resolves to Food > Meals', async () => {
    resetTestDb()
    seedAccount('acc1', 'DBS', 'bank')
    seedCategory('cat-food', 'Food', 'expense')
    seedCategory('cat-meals', 'Meals', 'expense', 'cat-food')
    seedCategory('cat-lifestyle', 'Lifestyle', 'expense')
    seedCategory('cat-delivery', 'Delivery', 'expense', 'cat-lifestyle')

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ type: 'text', text: 'Amount: 12.00\nMerchant/Payee: GrabFood\nCategory: Food > Meals' }],
      }),
    } as Response))

    const { POST } = await import('@/app/api/receipts/voice/route')
    const res = await POST(req('/api/receipts/voice', 'POST', {
      text: 'grabfood pizza 12 bucks',
      accountId: 'acc1',
    }))
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.draft.category_id).toBe('cat-meals')
  })

  it('BUG-064: Grab ride transcript resolves to Travel > Taxi', async () => {
    resetTestDb()
    seedAccount('acc1', 'DBS', 'bank')
    seedCategory('cat-travel', 'Travel', 'expense')
    seedCategory('cat-taxi', 'Taxi', 'expense', 'cat-travel')

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ type: 'text', text: 'Amount: 14.20\nMerchant/Payee: Grab\nCategory: Travel > Taxi' }],
      }),
    } as Response))

    const { POST } = await import('@/app/api/receipts/voice/route')
    const res = await POST(req('/api/receipts/voice', 'POST', {
      text: 'grab ride home 14.20',
      accountId: 'acc1',
    }))
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.draft.category_id).toBe('cat-taxi')
  })

  it('BUG-064: falls back to parent when LLM returns Parent > UnknownChild', async () => {
    resetTestDb()
    seedAccount('acc1', 'DBS', 'bank')
    seedCategory('cat-food', 'Food', 'expense')
    seedCategory('cat-meals', 'Meals', 'expense', 'cat-food')

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ type: 'text', text: 'Amount: 7.00\nCategory: Food > Banquet' }],
      }),
    } as Response))

    const { POST } = await import('@/app/api/receipts/voice/route')
    const res = await POST(req('/api/receipts/voice', 'POST', {
      text: 'food 7 bucks',
      accountId: 'acc1',
    }))
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.draft.category_id).toBe('cat-food')
  })
})
