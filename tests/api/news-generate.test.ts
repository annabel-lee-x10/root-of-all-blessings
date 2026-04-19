// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

function makeReq(body: object): NextRequest {
  return new NextRequest('http://localhost/api/news/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const MOCK_RESPONSE = {
  id: 'msg_123',
  stop_reason: 'end_turn',
  content: [{ type: 'text', text: '[{"id":"w1","headline":"Test","sentiment":"neutral","category":"News","catalyst":"","summary":"Test.","keyPoints":[],"source":"Reuters","url":"","timestamp":""}]' }],
}

describe('POST /api/news/generate', () => {
  const originalEnv = process.env.ANTHROPIC_API_KEY

  afterEach(() => {
    process.env.ANTHROPIC_API_KEY = originalEnv
    vi.restoreAllMocks()
  })

  it('returns 503 when ANTHROPIC_API_KEY is not set', async () => {
    delete process.env.ANTHROPIC_API_KEY
    const { POST } = await import('@/app/api/news/generate/route')
    const res = await POST(makeReq({ model: 'claude-sonnet-4-20250514', messages: [] }))
    expect(res.status).toBe(503)
    const data = await res.json()
    expect(data.error).toMatch(/not configured/i)
  })

  it('proxies to Anthropic and returns the response', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => MOCK_RESPONSE,
    })
    vi.stubGlobal('fetch', mockFetch)

    const { POST } = await import('@/app/api/news/generate/route')
    const res = await POST(makeReq({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{ role: 'user', content: 'hello' }],
    }))

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.id).toBe('msg_123')
    expect(data.stop_reason).toBe('end_turn')
  })

  it('adds the x-api-key header from server env (not from client)', async () => {
    process.env.ANTHROPIC_API_KEY = 'secret-server-key'
    let capturedHeaders: Record<string, string> = {}
    const mockFetch = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      capturedHeaders = Object.fromEntries(
        Object.entries(init.headers as Record<string, string>)
      )
      return Promise.resolve({ ok: true, status: 200, json: async () => MOCK_RESPONSE })
    })
    vi.stubGlobal('fetch', mockFetch)

    const { POST } = await import('@/app/api/news/generate/route')
    await POST(makeReq({ model: 'claude-sonnet-4-20250514', messages: [] }))

    expect(capturedHeaders['x-api-key']).toBe('secret-server-key')
    // The client body should NOT contain the API key
    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body as string)
    expect(JSON.stringify(callBody)).not.toContain('secret-server-key')
  })

  it('passes through non-200 status from Anthropic', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: { type: 'invalid_request_error', message: 'bad model' } }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const { POST } = await import('@/app/api/news/generate/route')
    const res = await POST(makeReq({ model: 'bad-model', messages: [] }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid JSON body', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    const { POST } = await import('@/app/api/news/generate/route')
    const badReq = new NextRequest('http://localhost/api/news/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    })
    const res = await POST(badReq)
    expect(res.status).toBe(400)
  })

  it('forwards anthropic-version header to upstream', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    let capturedHeaders: Record<string, string> = {}
    const mockFetch = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      capturedHeaders = Object.fromEntries(Object.entries(init.headers as Record<string, string>))
      return Promise.resolve({ ok: true, status: 200, json: async () => MOCK_RESPONSE })
    })
    vi.stubGlobal('fetch', mockFetch)

    const { POST } = await import('@/app/api/news/generate/route')
    await POST(makeReq({ model: 'claude-sonnet-4-20250514', messages: [] }))

    expect(capturedHeaders['anthropic-version']).toBe('2023-06-01')
  })
})
