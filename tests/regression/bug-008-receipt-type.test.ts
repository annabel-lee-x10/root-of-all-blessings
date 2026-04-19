// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { initTestDb, clearTestDb, resetTestDb, req, seedAccount, seedCategory } from '../helpers'

vi.mock('@/lib/session', () => ({ verifySession: vi.fn().mockResolvedValue(true) }))

beforeAll(() => initTestDb())
afterAll(() => clearTestDb())
beforeEach(() => {
  resetTestDb()
  seedAccount('acc1', 'DBS', 'bank')
  seedCategory('cat1', 'Food', 'expense')
  seedCategory('cat2', 'Salary', 'income')
})

function mockAnthropicResponse(text: string) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ content: [{ text }] }),
  }))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('POST /api/receipts/process — type field (BUG-008)', () => {
  it('creates income draft when OCR returns Type: income', async () => {
    mockAnthropicResponse('Type: income\nAmount: 760\nMerchant/Payee: Mission Control\nDate: 2026-04-19\nCategory: Salary')
    process.env.ANTHROPIC_API_KEY = 'test-key'
    const { POST } = await import('@/app/api/receipts/process/route')
    const res = await POST(req('/api/receipts/process', 'POST', {
      imageBase64: Buffer.from('fake').toString('base64'),
      mediaType: 'image/jpeg',
      accountId: 'acc1',
    }))
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.draft.type).toBe('income')
  })

  it('creates expense draft by default when no Type line', async () => {
    mockAnthropicResponse('Amount: 23.50\nMerchant/Payee: NTUC\nDate: 2026-04-19\nCategory: Food')
    process.env.ANTHROPIC_API_KEY = 'test-key'
    const { POST } = await import('@/app/api/receipts/process/route')
    const res = await POST(req('/api/receipts/process', 'POST', {
      imageBase64: Buffer.from('fake').toString('base64'),
      mediaType: 'image/jpeg',
      accountId: 'acc1',
    }))
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.draft.type).toBe('expense')
  })

  it('matches income category when type is income', async () => {
    mockAnthropicResponse('Type: income\nAmount: 5000\nMerchant/Payee: Employer\nDate: 2026-04-19\nCategory: Salary')
    process.env.ANTHROPIC_API_KEY = 'test-key'
    const { POST } = await import('@/app/api/receipts/process/route')
    const res = await POST(req('/api/receipts/process', 'POST', {
      imageBase64: Buffer.from('fake').toString('base64'),
      mediaType: 'image/jpeg',
      accountId: 'acc1',
    }))
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.draft.category_name).toBe('Salary')
  })

  it('does not match expense category for income type', async () => {
    mockAnthropicResponse('Type: income\nAmount: 760\nMerchant/Payee: Mission Control\nDate: 2026-04-19\nCategory: Food')
    process.env.ANTHROPIC_API_KEY = 'test-key'
    const { POST } = await import('@/app/api/receipts/process/route')
    const res = await POST(req('/api/receipts/process', 'POST', {
      imageBase64: Buffer.from('fake').toString('base64'),
      mediaType: 'image/jpeg',
      accountId: 'acc1',
    }))
    expect(res.status).toBe(201)
    const data = await res.json()
    // Food is expense category — should not match for income type
    expect(data.draft.category_name).toBeNull()
  })
})
