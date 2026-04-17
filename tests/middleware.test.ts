// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'
import { middleware } from '@/middleware'
import { SignJWT } from 'jose'

async function makeToken(expired = false) {
  const key = new TextEncoder().encode(process.env.SESSION_SECRET)
  const builder = new SignJWT({ sub: 'owner' }).setProtectedHeader({ alg: 'HS256' })
  if (expired) {
    builder
      .setIssuedAt(Math.floor(Date.now() / 1000) - 86401)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 1)
  } else {
    builder.setExpirationTime('24h')
  }
  return builder.sign(key)
}

function makeReq(path: string, token?: string) {
  const url = new URL(path, 'http://localhost:3000')
  const headers: Record<string, string> = {}
  if (token) headers['Cookie'] = `session=${token}`
  return new NextRequest(url, { headers })
}

describe('middleware', () => {
  it('allows /login without a token', async () => {
    const res = await middleware(makeReq('/login'))
    expect(res.status).not.toBe(307)
  })

  it('allows /api/auth/login without a token', async () => {
    const res = await middleware(makeReq('/api/auth/login'))
    expect(res.status).not.toBe(307)
  })

  it('redirects / to /login with no token', async () => {
    const res = await middleware(makeReq('/'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/login')
  })

  it('redirects /api/accounts to /login with no token', async () => {
    const res = await middleware(makeReq('/api/accounts'))
    expect(res.status).toBe(307)
  })

  it('passes through with a valid token', async () => {
    const token = await makeToken()
    const res = await middleware(makeReq('/', token))
    expect(res.status).not.toBe(307)
  })

  it('redirects with an expired token and deletes cookie', async () => {
    const token = await makeToken(true)
    const res = await middleware(makeReq('/', token))
    expect(res.status).toBe(307)
    const setCookie = res.headers.get('set-cookie') ?? ''
    expect(setCookie).toContain('session=')
  })

  it('redirects with garbage token', async () => {
    const res = await middleware(makeReq('/', 'garbage.token.here'))
    expect(res.status).toBe(307)
  })

  it('preserves ?from= redirect param', async () => {
    const res = await middleware(makeReq('/some/protected'))
    const location = res.headers.get('location') ?? ''
    expect(location).toContain('from=')
  })
})
