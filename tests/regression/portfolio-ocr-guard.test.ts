// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { initTestDb, clearTestDb, resetTestDb } from '../helpers'

vi.mock('@/lib/session', () => ({
  verifySession: vi.fn().mockResolvedValue({ userId: 'u1' }),
}))

beforeAll(() => initTestDb())
afterAll(() => clearTestDb())
beforeEach(() => {
  resetTestDb()
  vi.resetModules()
  vi.restoreAllMocks()
  process.env.ANTHROPIC_API_KEY = 'test-api-key'
})

function makeFormRequest(files: File[]): NextRequest {
  const formData = new FormData()
  for (const f of files) formData.append('images', f)
  return new NextRequest('http://localhost/api/portfolio/scan', {
    method: 'POST',
    body: formData,
  })
}

function makeImageFile(name = 'screenshot.jpg'): File {
  return new File([Buffer.from('fake-image-data')], name, { type: 'image/jpeg' })
}

describe('BUG-055 – scan returns 422 when OCR extracts 0 holdings and no summary', () => {
  it('returns 422 when OCR returns an empty array', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ content: [{ text: '[]' }] }),
    }))

    const { POST } = await import('@/app/api/portfolio/scan/route')
    const res = await POST(makeFormRequest([makeImageFile()]))
    expect(res.status).toBe(422)
    const data = await res.json()
    expect(data.error).toContain('OCR could not extract')
  })

  it('returns 422 when OCR returns only orders (no holdings, no summary)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ content: [{ text: JSON.stringify([
        { type: 'orders', data: { orders: [{ ticker: 'AAPL', type: 'BUY LIMIT', price: 100, qty: 1 }] } },
      ]) }] }),
    }))

    const { POST } = await import('@/app/api/portfolio/scan/route')
    const res = await POST(makeFormRequest([makeImageFile()]))
    expect(res.status).toBe(422)
    const data = await res.json()
    expect(data.error).toContain('OCR could not extract')
  })

  it('does NOT return 422 when summary data is present even with 0 holdings', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ content: [{ text: JSON.stringify([
        { type: 'summary', data: { total_value: 15000, unrealised_pnl: 500, cash: 200 } },
      ]) }] }),
    }))

    const { POST } = await import('@/app/api/portfolio/scan/route')
    const res = await POST(makeFormRequest([makeImageFile()]))
    expect(res.status).toBe(200)
  })

  it('does NOT return 422 when holdings are present even without summary', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ content: [{ text: JSON.stringify([
        { type: 'holdings', data: { holdings: [
          { ticker: 'MU', name: 'Micron', geo: 'US', currency: 'USD', price: 487, change_1d: 1.2, value: 2437, pnl: 751, qty: 5 },
        ] } },
      ]) }] }),
    }))

    const { POST } = await import('@/app/api/portfolio/scan/route')
    const res = await POST(makeFormRequest([makeImageFile()]))
    expect(res.status).toBe(200)
  })

  it('error message directs user to upload Holdings tab screenshots', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ content: [{ text: '[]' }] }),
    }))

    const { POST } = await import('@/app/api/portfolio/scan/route')
    const res = await POST(makeFormRequest([makeImageFile()]))
    const data = await res.json()
    expect(data.error).toContain('Holdings tab')
  })
})
