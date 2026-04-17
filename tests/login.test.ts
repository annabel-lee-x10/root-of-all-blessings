// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { req } from './helpers'
import { resetRateLimit } from '@/lib/rate-limit'

vi.mock('@/lib/session', () => ({
  createSession: vi.fn().mockResolvedValue(undefined),
  deleteSession: vi.fn().mockResolvedValue(undefined),
  verifySession: vi.fn().mockResolvedValue(true),
  verifySessionToken: vi.fn().mockResolvedValue(true),
}))

beforeEach(() => {
  resetRateLimit('127.0.0.1')
  vi.clearAllMocks()
})

describe('POST /api/auth/login', () => {
  async function callLogin(body: object, headers?: Record<string, string>) {
    const { POST } = await import('@/app/api/auth/login/route')
    return POST(req('/api/auth/login', 'POST', body, headers))
  }

  it('returns 200 with correct password', async () => {
    const res = await callLogin({ password: 'password' })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
  })

  it('returns 401 with wrong password', async () => {
    const res = await callLogin({ password: 'wrong' })
    expect(res.status).toBe(401)
  })

  it('returns 400 when password is missing', async () => {
    const res = await callLogin({})
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid JSON body', async () => {
    const { POST } = await import('@/app/api/auth/login/route')
    const request = req('/api/auth/login', 'POST')
    const res = await POST(request)
    expect(res.status).toBe(400)
  })

  it('rejects CSRF - origin does not match host', async () => {
    const res = await callLogin(
      { password: 'password' },
      { origin: 'http://evil.com', host: 'localhost:3000' }
    )
    expect(res.status).toBe(403)
  })

  it('accepts request with matching origin and host', async () => {
    const res = await callLogin(
      { password: 'password' },
      { origin: 'http://localhost:3000', host: 'localhost:3000' }
    )
    expect(res.status).toBe(200)
  })

  it('rate limits after 5 failures', async () => {
    resetRateLimit('127.0.0.1')
    for (let i = 0; i < 5; i++) {
      await callLogin({ password: 'wrong' })
    }
    const res = await callLogin({ password: 'password' })
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBeTruthy()
    resetRateLimit('127.0.0.1')
  })
})

describe('POST /api/auth/logout', () => {
  it('redirects to /login', async () => {
    const { POST } = await import('@/app/api/auth/logout/route')
    const res = await POST()
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/login')
  })
})
