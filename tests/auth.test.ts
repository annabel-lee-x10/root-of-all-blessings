// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('verifyPassword', () => {
  it('returns true for correct password', async () => {
    const { verifyPassword } = await import('@/lib/auth')
    expect(await verifyPassword('password')).toBe(true)
  })

  it('returns false for wrong password', async () => {
    const { verifyPassword } = await import('@/lib/auth')
    expect(await verifyPassword('wrong')).toBe(false)
  })

  it('returns false when HASHED_PASSWORD is not set', async () => {
    const orig = process.env.HASHED_PASSWORD
    delete process.env.HASHED_PASSWORD
    const { verifyPassword } = await import('@/lib/auth')
    expect(await verifyPassword('password')).toBe(false)
    process.env.HASHED_PASSWORD = orig
  })
})

describe('verifySessionToken', () => {
  it('returns true for a valid token', async () => {
    const { SignJWT } = await import('jose')
    const key = new TextEncoder().encode(process.env.SESSION_SECRET)
    const token = await new SignJWT({ sub: 'owner' })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('24h')
      .sign(key)

    const { verifySessionToken } = await import('@/lib/session')
    expect(await verifySessionToken(token)).toBe(true)
  })

  it('returns false for an expired token', async () => {
    const { SignJWT } = await import('jose')
    const key = new TextEncoder().encode(process.env.SESSION_SECRET)
    const token = await new SignJWT({ sub: 'owner' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 86401)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 1)
      .sign(key)

    const { verifySessionToken } = await import('@/lib/session')
    expect(await verifySessionToken(token)).toBe(false)
  })

  it('returns false for garbage input', async () => {
    const { verifySessionToken } = await import('@/lib/session')
    expect(await verifySessionToken('not.a.token')).toBe(false)
    expect(await verifySessionToken('')).toBe(false)
  })
})

describe('checkRateLimit', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('allows requests under the limit', async () => {
    const { checkRateLimit, resetRateLimit } = await import('@/lib/rate-limit')
    resetRateLimit('test-ip-1')
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit('test-ip-1').allowed).toBe(true)
    }
    resetRateLimit('test-ip-1')
  })

  it('blocks the 6th attempt', async () => {
    const { checkRateLimit, resetRateLimit } = await import('@/lib/rate-limit')
    resetRateLimit('test-ip-2')
    for (let i = 0; i < 5; i++) checkRateLimit('test-ip-2')
    const result = checkRateLimit('test-ip-2')
    expect(result.allowed).toBe(false)
    expect(result.retryAfterMs).toBeGreaterThan(0)
    resetRateLimit('test-ip-2')
  })

  it('allows after reset', async () => {
    const { checkRateLimit, resetRateLimit } = await import('@/lib/rate-limit')
    resetRateLimit('test-ip-3')
    for (let i = 0; i < 5; i++) checkRateLimit('test-ip-3')
    resetRateLimit('test-ip-3')
    expect(checkRateLimit('test-ip-3').allowed).toBe(true)
    resetRateLimit('test-ip-3')
  })
})
