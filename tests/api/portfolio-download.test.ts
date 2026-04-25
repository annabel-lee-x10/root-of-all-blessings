// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import * as XLSX from 'xlsx'
import {
  initTestDb, clearTestDb, resetTestDb,
  seedPortfolioSnapshotV2, seedPortfolioHolding, seedPortfolioRealised, seedPortfolioOrder,
} from '../helpers'

vi.mock('@/lib/session', () => ({
  verifySession: vi.fn().mockResolvedValue({ userId: 'u1' }),
}))

beforeAll(() => initTestDb())
afterAll(() => clearTestDb())
beforeEach(() => { resetTestDb(); vi.resetModules(); vi.restoreAllMocks() })

function htmlReq(id: string) {
  const { NextRequest } = require('next/server')
  return new NextRequest(`http://localhost/api/portfolio/download/html/${id}`)
}
function excelReq(id: string) {
  const { NextRequest } = require('next/server')
  return new NextRequest(`http://localhost/api/portfolio/download/excel/${id}`)
}

describe('GET /api/portfolio/download/html/[id]', () => {
  it('returns 401 without auth', async () => {
    const { verifySession } = await import('@/lib/session')
    vi.mocked(verifySession).mockResolvedValueOnce(null)
    const { GET } = await import('@/app/api/portfolio/download/html/[id]/route')
    const res = await GET(htmlReq('x'), { params: Promise.resolve({ id: 'x' }) })
    expect(res.status).toBe(401)
  })

  it('returns 404 for unknown snapshot id', async () => {
    const { GET } = await import('@/app/api/portfolio/download/html/[id]/route')
    const res = await GET(htmlReq('does-not-exist'), { params: Promise.resolve({ id: 'does-not-exist' }) })
    expect(res.status).toBe(404)
  })

  it('returns 200 with text/html Content-Type for valid snapshot', async () => {
    seedPortfolioSnapshotV2('s1', { snap_label: 'Snap 29', total_value: 15000 })
    seedPortfolioHolding('s1', { ticker: 'MU', name: 'Micron', value: 2437, price: 487, change_1d: 8.48, geo: 'US', sector: 'Technology' })
    const { GET } = await import('@/app/api/portfolio/download/html/[id]/route')
    const res = await GET(htmlReq('s1'), { params: Promise.resolve({ id: 's1' }) })
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('text/html')
  })

  it('sets Content-Disposition: attachment header', async () => {
    seedPortfolioSnapshotV2('s2', { snap_label: 'Snap 29', total_value: 15000 })
    const { GET } = await import('@/app/api/portfolio/download/html/[id]/route')
    const res = await GET(htmlReq('s2'), { params: Promise.resolve({ id: 's2' }) })
    expect(res.headers.get('Content-Disposition')).toMatch(/^attachment/)
  })

  it('response body is valid HTML containing snap label', async () => {
    seedPortfolioSnapshotV2('s3', { snap_label: 'Snap 42', total_value: 20000 })
    const { GET } = await import('@/app/api/portfolio/download/html/[id]/route')
    const res = await GET(htmlReq('s3'), { params: Promise.resolve({ id: 's3' }) })
    const body = await res.text()
    expect(body).toContain('<!DOCTYPE html>')
    expect(body).toContain('Snap 42')
  })
})

describe('BUG-060 – Excel response body must be Uint8Array, not raw Buffer', () => {
  it('passes new Uint8Array(buf) to the Response constructor body (not a raw Buffer cast)', async () => {
    seedPortfolioSnapshotV2('b60', { snap_label: 'Apr 2026', total_value: 7000 })
    seedPortfolioHolding('b60', { ticker: 'MU', name: 'Micron', value: 2437 })

    // Intercept every `new Response(body, init)` call in the route.
    // With the bug (buf as unknown as BodyInit), body.constructor.name === 'Buffer'.
    // With the fix (new Uint8Array(buf)),   body.constructor.name === 'Uint8Array'.
    // Vercel's serverless runtime treats Buffer differently from Uint8Array, stripping
    // Content-Disposition and never completing the body — producing UUID .txt downloads.
    const capturedBodies: unknown[] = []
    const OrigResponse = global.Response
    global.Response = class extends OrigResponse {
      constructor(body: BodyInit | null, init?: ResponseInit) {
        capturedBodies.push(body)
        super(body as BodyInit, init)
      }
    } as unknown as typeof Response

    try {
      const { GET } = await import('@/app/api/portfolio/download/excel/[id]/route')
      const res = await GET(excelReq('b60'), { params: Promise.resolve({ id: 'b60' }) })
      expect(res.status).toBe(200)

      // Find the binary body (xlsx data) — filter out string bodies from Response.json() calls.
      const binaryBody = capturedBodies.find(
        (b) => b != null && typeof b === 'object' && (b instanceof Uint8Array || Buffer.isBuffer(b))
      )
      expect(binaryBody).toBeDefined()
      // Must be exactly Uint8Array, NOT the Buffer subclass.
      expect((binaryBody as Uint8Array).constructor.name).toBe('Uint8Array')
    } finally {
      global.Response = OrigResponse
    }
  })
})

describe('GET /api/portfolio/download/excel/[id]', () => {
  it('returns 401 without auth', async () => {
    const { verifySession } = await import('@/lib/session')
    vi.mocked(verifySession).mockResolvedValueOnce(null)
    const { GET } = await import('@/app/api/portfolio/download/excel/[id]/route')
    const res = await GET(excelReq('x'), { params: Promise.resolve({ id: 'x' }) })
    expect(res.status).toBe(401)
  })

  it('returns 404 for unknown snapshot id', async () => {
    const { GET } = await import('@/app/api/portfolio/download/excel/[id]/route')
    const res = await GET(excelReq('no-snap'), { params: Promise.resolve({ id: 'no-snap' }) })
    expect(res.status).toBe(404)
  })

  it('returns 200 with xlsx Content-Type', async () => {
    seedPortfolioSnapshotV2('e1', { snap_label: 'Snap 29', total_value: 15000 })
    seedPortfolioHolding('e1', { ticker: 'MU', name: 'Micron', value: 2437 })
    const { GET } = await import('@/app/api/portfolio/download/excel/[id]/route')
    const res = await GET(excelReq('e1'), { params: Promise.resolve({ id: 'e1' }) })
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('spreadsheetml')
  })

  it('sets Content-Disposition: attachment header', async () => {
    seedPortfolioSnapshotV2('e2', { snap_label: 'Snap 29', total_value: 15000 })
    const { GET } = await import('@/app/api/portfolio/download/excel/[id]/route')
    const res = await GET(excelReq('e2'), { params: Promise.resolve({ id: 'e2' }) })
    expect(res.headers.get('Content-Disposition')).toMatch(/^attachment/)
  })

  it('response body is a valid xlsx workbook with Holdings History sheet', async () => {
    seedPortfolioSnapshotV2('e3', { snap_label: 'Snap 29', total_value: 15000 })
    seedPortfolioHolding('e3', { ticker: 'MU', name: 'Micron', value: 2437 })
    const { GET } = await import('@/app/api/portfolio/download/excel/[id]/route')
    const res = await GET(excelReq('e3'), { params: Promise.resolve({ id: 'e3' }) })
    const ab = await res.arrayBuffer()
    const wb = XLSX.read(Buffer.from(ab), { type: 'buffer' })
    expect(wb.SheetNames).toContain('Holdings History')
  })
})
