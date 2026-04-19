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
    expect(data.draft.payment_method).toBe('credit card')
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
})
