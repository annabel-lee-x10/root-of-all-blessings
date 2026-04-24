// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { initTestDb, clearTestDb, resetTestDb, seedPortfolioSnapshot } from '../helpers'
import { db } from '@/lib/db'

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

function mockClaudeOcr(responseText: string) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ content: [{ text: responseText }] }),
  }))
}

describe('POST /api/portfolio/scan', () => {
  it('returns 401 without auth', async () => {
    const { verifySession } = await import('@/lib/session')
    vi.mocked(verifySession).mockResolvedValueOnce(null)
    const { POST } = await import('@/app/api/portfolio/scan/route')
    const res = await POST(makeFormRequest([makeImageFile()]))
    expect(res.status).toBe(401)
  })

  it('returns 503 without ANTHROPIC_API_KEY', async () => {
    delete process.env.ANTHROPIC_API_KEY
    const { POST } = await import('@/app/api/portfolio/scan/route')
    const res = await POST(makeFormRequest([makeImageFile()]))
    expect(res.status).toBe(503)
  })

  it('returns 400 with no image files', async () => {
    const { POST } = await import('@/app/api/portfolio/scan/route')
    const emptyForm = new NextRequest('http://localhost/api/portfolio/scan', {
      method: 'POST',
      body: new FormData(),
    })
    const res = await POST(emptyForm)
    expect(res.status).toBe(400)
  })

  it('creates a new snapshot when none exists for today', async () => {
    mockClaudeOcr(JSON.stringify([
      { type: 'summary', data: { total_value: 50000, unrealised_pnl: 1500, cash: 3000 } },
      {
        type: 'holdings',
        data: {
          holdings: [
            { ticker: 'AAPL', name: 'Apple Inc', geo: 'US', price: 175, change_1d: 1.2, value: 3500, pnl: 200, qty: 20 },
          ],
        },
      },
    ]))

    const { POST } = await import('@/app/api/portfolio/scan/route')
    const res = await POST(makeFormRequest([makeImageFile()]))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.snapshot_id).toBeTruthy()
    expect(data.holdings_count).toBe(1)
    expect(data.updated).toBe(false)
  })

  it('stores summary fields on the snapshot', async () => {
    mockClaudeOcr(JSON.stringify([
      { type: 'summary', data: { total_value: 55000, unrealised_pnl: 2000, realised_pnl: 300, cash: 4500 } },
    ]))

    const { POST } = await import('@/app/api/portfolio/scan/route')
    const res = await POST(makeFormRequest([makeImageFile()]))
    const { snapshot_id } = await res.json()

    const snap = (await db.execute({
      sql: 'SELECT * FROM portfolio_snapshots WHERE id = ?',
      args: [snapshot_id],
    })).rows[0]

    expect(snap.total_value).toBe(55000)
    expect(snap.unrealised_pnl).toBe(2000)
    expect(snap.realised_pnl).toBe(300)
    expect(snap.cash).toBe(4500)
    expect(snap.source).toBe('screenshot')
  })

  it('stores holdings in portfolio_holdings table', async () => {
    mockClaudeOcr(JSON.stringify([
      {
        type: 'holdings',
        data: {
          holdings: [
            { ticker: 'NVDA', name: 'Nvidia', geo: 'US', price: 800, change_1d: 2.5, value: 4000, pnl: 500, qty: 5 },
            { ticker: 'MU', name: 'Micron', geo: 'US', price: 100, change_1d: -0.5, value: 500, pnl: -50, qty: 5 },
          ],
        },
      },
    ]))

    const { POST } = await import('@/app/api/portfolio/scan/route')
    const res = await POST(makeFormRequest([makeImageFile()]))
    const { snapshot_id } = await res.json()

    const holdings = (await db.execute({
      sql: 'SELECT * FROM portfolio_holdings WHERE snapshot_id = ? ORDER BY ticker',
      args: [snapshot_id],
    })).rows

    expect(holdings).toHaveLength(2)
    expect(holdings[0].ticker).toBe('MU')
    expect(holdings[1].ticker).toBe('NVDA')
    expect(holdings[1].price).toBe(800)
  })

  it('stores transactions in portfolio_transactions table', async () => {
    mockClaudeOcr(JSON.stringify([
      { type: 'summary', data: { total_value: 50000 } },
      {
        type: 'transactions',
        data: {
          transactions: [
            { type: 'deposit', amount: 5000, currency: 'SGD', date: '20 Apr 2026' },
            { type: 'deposit', amount: 3000, currency: 'SGD', date: '15 Apr 2026' },
          ],
        },
      },
    ]))

    const { POST } = await import('@/app/api/portfolio/scan/route')
    const res = await POST(makeFormRequest([makeImageFile()]))
    const { snapshot_id } = await res.json()

    const txns = (await db.execute({
      sql: 'SELECT * FROM portfolio_transactions WHERE snapshot_id = ?',
      args: [snapshot_id],
    })).rows

    expect(txns).toHaveLength(2)
    expect(txns[0].type).toBe('deposit')
    expect(txns[0].amount).toBe(5000)
  })

  it('updates existing snapshot when one already exists for today (SGT)', async () => {
    const todaySgt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore' }).format(new Date())
    const todayMidnightSgt = new Date(`${todaySgt}T00:00:00+08:00`).toISOString()
    seedPortfolioSnapshot('snap-today', [], {
      snapshot_date: todayMidnightSgt,
      total_value: 40000,
      source: 'screenshot',
    })

    mockClaudeOcr(JSON.stringify([
      { type: 'summary', data: { total_value: 60000, unrealised_pnl: 3000, cash: 5000 } },
    ]))

    const { POST } = await import('@/app/api/portfolio/scan/route')
    const res = await POST(makeFormRequest([makeImageFile()]))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.snapshot_id).toBe('snap-today')
    expect(data.updated).toBe(true)

    const snap = (await db.execute({
      sql: 'SELECT total_value FROM portfolio_snapshots WHERE id = ?',
      args: ['snap-today'],
    })).rows[0]
    expect(snap.total_value).toBe(60000)
  })

  it('calls Claude API with the correct anthropic-version header', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ content: [{ text: JSON.stringify([
        { type: 'summary', data: { total_value: 1000 } }
      ]) }] }),
    })
    vi.stubGlobal('fetch', fetchSpy)

    const { POST } = await import('@/app/api/portfolio/scan/route')
    await POST(makeFormRequest([makeImageFile()]))

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('anthropic.com'),
      expect.objectContaining({
        headers: expect.objectContaining({
          'anthropic-version': '2023-06-01',
          'x-api-key': 'test-api-key',
        }),
      })
    )
  })

  it('returns 500 when Claude API fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))

    const { POST } = await import('@/app/api/portfolio/scan/route')
    const res = await POST(makeFormRequest([makeImageFile()]))
    expect(res.status).toBe(500)
  })

  it('BUG-051 – raw_html stored as empty string not NULL', async () => {
    mockClaudeOcr(JSON.stringify([
      { type: 'summary', data: { total_value: 10000 } },
    ]))

    const { POST } = await import('@/app/api/portfolio/scan/route')
    const res = await POST(makeFormRequest([makeImageFile()]))
    const { snapshot_id } = await res.json()

    const snap = (await db.execute({
      sql: 'SELECT raw_html FROM portfolio_snapshots WHERE id = ?',
      args: [snapshot_id],
    })).rows[0]

    expect(snap.raw_html).toBe('')
  })
})
