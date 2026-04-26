// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import { verifySession } from '@/lib/session'
import {
  initTestDb, clearTestDb, resetTestDb, req,
  seedAccount, seedCategory, seedTag,
} from '../helpers'

vi.mock('@/lib/session', () => ({
  verifySession: vi.fn().mockResolvedValue(true),
  verifySessionToken: vi.fn().mockResolvedValue(true),
}))

// Minimal valid 1×1 PNG in base64 (~68 bytes decoded — well within 5 MB limit)
const VALID_IMAGE_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

const MOCK_CLAUDE_RESPONSE = {
  content: [{
    type: 'text',
    text: [
      'Amount: 23.50',
      'Currency: SGD',
      'Merchant/Payee: NTUC FairPrice',
      'Date: 2026-04-19',
      'Category: Food',
      'Tags: groceries, essentials, supermarket',
      'Description: Weekly groceries run.',
      'Payment Method: credit card',
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

describe('POST /api/receipts/process', () => {
  it('returns 401 when no session', async () => {
    vi.mocked(verifySession).mockResolvedValueOnce(false)
    const { POST } = await import('@/app/api/receipts/process/route')
    const res = await POST(req('/api/receipts/process', 'POST', {
      imageBase64: VALID_IMAGE_BASE64,
      mediaType: 'image/png',
      accountId: 'acc1',
    }))
    expect(res.status).toBe(401)
  })

  it('returns 503 when ANTHROPIC_API_KEY is not set', async () => {
    delete process.env.ANTHROPIC_API_KEY
    const { POST } = await import('@/app/api/receipts/process/route')
    const res = await POST(req('/api/receipts/process', 'POST', {
      imageBase64: VALID_IMAGE_BASE64,
      mediaType: 'image/png',
      accountId: 'acc1',
    }))
    expect(res.status).toBe(503)
  })

  it('returns 400 when imageBase64 is missing', async () => {
    const { POST } = await import('@/app/api/receipts/process/route')
    const res = await POST(req('/api/receipts/process', 'POST', {
      mediaType: 'image/jpeg',
      accountId: 'acc1',
    }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toMatch(/imageBase64/i)
  })

  it('returns 400 when mediaType is not an image', async () => {
    const { POST } = await import('@/app/api/receipts/process/route')
    const res = await POST(req('/api/receipts/process', 'POST', {
      imageBase64: VALID_IMAGE_BASE64,
      mediaType: 'application/pdf',
      accountId: 'acc1',
    }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toMatch(/mediaType/i)
  })

  it('creates a draft transaction with parsed fields', async () => {
    const { POST } = await import('@/app/api/receipts/process/route')
    const res = await POST(req('/api/receipts/process', 'POST', {
      imageBase64: VALID_IMAGE_BASE64,
      mediaType: 'image/png',
      accountId: 'acc1',
    }))
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.draft).toBeDefined()
    expect(data.draft.status).toBe('draft')
    expect(data.draft.amount).toBe(23.5)
    expect(data.draft.payee).toBe('NTUC FairPrice')
    expect(data.draft.category_name).toBe('Food')
    expect(data.draft.payment_method).toBe('bank') // derived from account type, not Claude's guess
    expect(data.draft.account_id).toBe('acc1')
  })

  it('auto-creates tags from Claude output', async () => {
    const { POST } = await import('@/app/api/receipts/process/route')
    await POST(req('/api/receipts/process', 'POST', {
      imageBase64: VALID_IMAGE_BASE64,
      mediaType: 'image/png',
      accountId: 'acc1',
    }))
    const { GET } = await import('@/app/api/tags/route')
    const tagsRes = await GET(req('/api/tags'))
    const tags = (await tagsRes.json()) as Array<{ name: string }>
    expect(tags.map((t) => t.name)).toEqual(
      expect.arrayContaining(['groceries', 'essentials', 'supermarket'])
    )
  })

  it('reuses existing tags instead of creating duplicates', async () => {
    seedTag('tag-existing', 'groceries')
    const { POST } = await import('@/app/api/receipts/process/route')
    await POST(req('/api/receipts/process', 'POST', {
      imageBase64: VALID_IMAGE_BASE64,
      mediaType: 'image/png',
      accountId: 'acc1',
    }))
    const { GET } = await import('@/app/api/tags/route')
    const tagsRes = await GET(req('/api/tags'))
    const tags = (await tagsRes.json()) as Array<{ name: string }>
    expect(tags.filter((t) => t.name === 'groceries')).toHaveLength(1)
  })

  it('leaves category_id null when no category match', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ type: 'text', text: 'Amount: 10\nMerchant/Payee: GameShop\nCategory: Electronics' }],
      }),
    } as Response))
    const { POST } = await import('@/app/api/receipts/process/route')
    const res = await POST(req('/api/receipts/process', 'POST', {
      imageBase64: VALID_IMAGE_BASE64,
      mediaType: 'image/png',
      accountId: 'acc1',
    }))
    const data = await res.json()
    expect(data.draft.category_id).toBeNull()
  })

  it('falls back to first active account when accountId not provided', async () => {
    const { POST } = await import('@/app/api/receipts/process/route')
    const res = await POST(req('/api/receipts/process', 'POST', {
      imageBase64: VALID_IMAGE_BASE64,
      mediaType: 'image/png',
    }))
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.draft.account_id).toBe('acc1')
  })

  it('BUG-021: falls back to first active account when accountId is stale/not found', async () => {
    const { POST } = await import('@/app/api/receipts/process/route')
    const res = await POST(req('/api/receipts/process', 'POST', {
      imageBase64: VALID_IMAGE_BASE64,
      mediaType: 'image/png',
      accountId: 'stale-account-id-that-doesnt-exist',
    }))
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.draft.account_id).toBe('acc1')
  })

  it('returns 422 when Claude cannot extract amount', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ type: 'text', text: 'Merchant/Payee: Cafe\nCategory: Food' }],
      }),
    } as Response))
    const { POST } = await import('@/app/api/receipts/process/route')
    const res = await POST(req('/api/receipts/process', 'POST', {
      imageBase64: VALID_IMAGE_BASE64,
      mediaType: 'image/png',
      accountId: 'acc1',
    }))
    expect(res.status).toBe(422)
  })

  it('BUG-030: uses Claude-extracted date when present', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ type: 'text', text: 'Amount: 12.00\nDate: 2026-03-15\nTime: 09:30' }],
      }),
    } as Response))
    const { POST } = await import('@/app/api/receipts/process/route')
    const res = await POST(req('/api/receipts/process', 'POST', {
      imageBase64: VALID_IMAGE_BASE64,
      mediaType: 'image/png',
      accountId: 'acc1',
    }))
    expect(res.status).toBe(201)
    const data = await res.json()
    // Stored datetime should be 2026-03-15T09:30 SGT → 2026-03-15T01:30:00.000Z
    expect(data.draft.datetime).toBe('2026-03-15T01:30:00.000Z')
  })

  it('BUG-062: defaults datetime to current timestamp (not epoch) when Claude omits Date', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ type: 'text', text: 'Amount: 12.00\nMerchant/Payee: Cafe' }],
      }),
    } as Response))
    const before = Date.now()
    const { POST } = await import('@/app/api/receipts/process/route')
    const res = await POST(req('/api/receipts/process', 'POST', {
      imageBase64: VALID_IMAGE_BASE64,
      mediaType: 'image/png',
      accountId: 'acc1',
    }))
    const after = Date.now()
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.draft.datetime).not.toBe('1970-01-01T00:00:00.000Z')
    const stored = new Date(data.draft.datetime).getTime()
    expect(stored).toBeGreaterThanOrEqual(before)
    expect(stored).toBeLessThanOrEqual(after)
  })

  it('BUG-030: strips trailing time from date and extracts correctly (e.g. "21/04/2026, 15:32")', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ type: 'text', text: 'Amount: 12.00\nDate: 21/04/2026, 15:32' }],
      }),
    } as Response))
    const { POST } = await import('@/app/api/receipts/process/route')
    const res = await POST(req('/api/receipts/process', 'POST', {
      imageBase64: VALID_IMAGE_BASE64,
      mediaType: 'image/png',
      accountId: 'acc1',
    }))
    expect(res.status).toBe(201)
    const data = await res.json()
    // Date extracted and stored as 2026-04-21T00:00 SGT → 2026-04-20T16:00:00.000Z
    expect(data.draft.datetime).toBe('2026-04-20T16:00:00.000Z')
  })

  it('BUG-062: defaults datetime to current timestamp when Claude returns an unrecognised date format', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ type: 'text', text: 'Amount: 12.00\nDate: not-a-date' }],
      }),
    } as Response))
    const before = Date.now()
    const { POST } = await import('@/app/api/receipts/process/route')
    const res = await POST(req('/api/receipts/process', 'POST', {
      imageBase64: VALID_IMAGE_BASE64,
      mediaType: 'image/png',
      accountId: 'acc1',
    }))
    const after = Date.now()
    // Must not 500 — should fall back to current time gracefully (not epoch)
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.draft.datetime).not.toBe('1970-01-01T00:00:00.000Z')
    const stored = new Date(data.draft.datetime).getTime()
    expect(stored).toBeGreaterThanOrEqual(before)
    expect(stored).toBeLessThanOrEqual(after)
  })

  it('returns 500 when Anthropic API call fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'overloaded' }),
    } as Response))
    const { POST } = await import('@/app/api/receipts/process/route')
    const res = await POST(req('/api/receipts/process', 'POST', {
      imageBase64: VALID_IMAGE_BASE64,
      mediaType: 'image/png',
      accountId: 'acc1',
    }))
    expect(res.status).toBe(500)
  })

  it('BUG-063: populates category_id when DB category name differs from old hard-coded prompt list', async () => {
    // The DB has a category called 'Food and Drink' — NOT one of the names that
    // the old hard-coded prompt listed ('Food, Transport, Housing, Bills, Health,
    // Entertainment, Subscriptions, Education, Pet, Other'). The fix queries the
    // categories table first and injects the real names into the prompt, so the
    // LLM picks something that actually exists in the DB.
    resetTestDb()
    seedAccount('acc1', 'DBS', 'bank')
    seedCategory('cat-food-drink', 'Food and Drink', 'expense')

    // Simulate a real LLM: pick the first category name from the prompt's
    // "Category: [one of: ...]" line. This makes the test sensitive to what
    // the route puts INTO the prompt, not just to the static mock response.
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      const reqBody = JSON.parse(init.body as string)
      const promptText: string = reqBody.messages[0].content[1]?.text ?? ''
      const m = promptText.match(/Category:\s*\[(?:one of|pick (?:EXACTLY )?one of):\s*([^\]]+)\]/i)
      const choices = m ? m[1].split(',').map((s: string) => s.trim()) : []
      const picked = choices[0] ?? 'Other'
      return Promise.resolve({
        ok: true,
        json: async () => ({
          content: [{ type: 'text', text: `Amount: 5.00\nMerchant/Payee: Test\nCategory: ${picked}` }],
        }),
      } as Response)
    }))

    const { POST } = await import('@/app/api/receipts/process/route')
    const res = await POST(req('/api/receipts/process', 'POST', {
      imageBase64: VALID_IMAGE_BASE64,
      mediaType: 'image/png',
      accountId: 'acc1',
    }))
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.draft.category_id).toBe('cat-food-drink')
  })
})
