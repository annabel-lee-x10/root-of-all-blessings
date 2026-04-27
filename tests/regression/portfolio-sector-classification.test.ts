// @vitest-environment node
//
// BUG-065 — Portfolio Sector tab lumps all holdings under "Other" because the
// OCR upload pipeline never asks the model for a `sector` field, so every row
// in portfolio_holdings ends up with sector = NULL. The Sector tab in
// portfolio-client.tsx falls back to "Other" for any holding without a sector,
// producing a single 100% "Other" bucket.
//
// Regression: when /api/portfolio/scan inserts holdings whose tickers match
// the static TICKER_META taxonomy (the same one /api/portfolio uses to enrich
// HTML uploads), the inserted rows MUST have a non-null `sector` value so the
// Sector tab can render multiple buckets.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { initTestDb, clearTestDb, resetTestDb } from '../helpers'
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

describe('BUG-065 – scan route classifies sector by ticker when OCR omits it', () => {
  it('populates sector for known tickers (US tech, SG financials, ETF) when OCR returns no sector field', async () => {
    // OCR prompt does NOT request sector — model returns holdings without it.
    // Mirrors the actual prompt in lib/portfolio/ocr.ts.
    mockClaudeOcr(JSON.stringify([
      {
        type: 'holdings',
        data: {
          holdings: [
            { ticker: 'NVDA', name: 'Nvidia',  geo: 'US', currency: 'USD', price: 800, value: 4000, pnl: 500, qty: 5 },
            { ticker: 'AAPL', name: 'Apple',   geo: 'US', currency: 'USD', price: 175, value: 3500, pnl: 200, qty: 20 },
            { ticker: 'D05',  name: 'DBS',     geo: 'SG', currency: 'SGD', price: 50,  value: 5000, pnl: 100, qty: 100 },
            { ticker: 'QQQ',  name: 'Invesco QQQ', geo: 'US', currency: 'USD', price: 500, value: 2500, pnl: 200, qty: 5 },
          ],
        },
      },
    ]))

    const { POST } = await import('@/app/api/portfolio/scan/route')
    const res = await POST(makeFormRequest([makeImageFile()]))
    expect(res.status).toBe(200)
    const { snapshot_id } = await res.json()

    const rows = (await db.execute({
      sql: 'SELECT ticker, sector FROM portfolio_holdings WHERE snapshot_id = ? ORDER BY ticker',
      args: [snapshot_id],
    })).rows as Array<{ ticker: string; sector: string | null }>

    expect(rows).toHaveLength(4)

    // Every known ticker must have a non-null sector after the fix.
    const sectorByTicker = Object.fromEntries(rows.map(r => [r.ticker, r.sector]))
    expect(sectorByTicker.NVDA).toBe('Technology')
    expect(sectorByTicker.AAPL).toBe('Technology')
    expect(sectorByTicker.D05).toBe('Financials')
    expect(sectorByTicker.QQQ).toBe('ETF')

    // The Sector tab aggregates by these values — there must be at least 2
    // distinct non-"Other" sectors so the tab is not a single 100% bucket.
    const distinctSectors = new Set(rows.map(r => r.sector).filter(s => s && s !== 'Other'))
    expect(distinctSectors.size).toBeGreaterThanOrEqual(2)
  })

  it('preserves sector value supplied by OCR when present (does not overwrite)', async () => {
    // Forward-compat: if a future OCR prompt does return sector, respect it.
    mockClaudeOcr(JSON.stringify([
      {
        type: 'holdings',
        data: {
          holdings: [
            { ticker: 'XYZ', name: 'XYZ Corp', geo: 'US', currency: 'USD', sector: 'Custom Sector', price: 10, value: 100, pnl: 0, qty: 10 },
          ],
        },
      },
    ]))

    const { POST } = await import('@/app/api/portfolio/scan/route')
    const res = await POST(makeFormRequest([makeImageFile()]))
    expect(res.status).toBe(200)
    const { snapshot_id } = await res.json()

    const row = (await db.execute({
      sql: 'SELECT sector FROM portfolio_holdings WHERE snapshot_id = ?',
      args: [snapshot_id],
    })).rows[0] as { sector: string | null }

    expect(row.sector).toBe('Custom Sector')
  })

  it('leaves sector NULL for unknown tickers (no static fallback exists)', async () => {
    mockClaudeOcr(JSON.stringify([
      {
        type: 'holdings',
        data: {
          holdings: [
            { ticker: 'ZZTOP', name: 'Unknown Stock', geo: 'US', currency: 'USD', price: 1, value: 100, pnl: 0, qty: 100 },
          ],
        },
      },
    ]))

    const { POST } = await import('@/app/api/portfolio/scan/route')
    const res = await POST(makeFormRequest([makeImageFile()]))
    expect(res.status).toBe(200)
    const { snapshot_id } = await res.json()

    const row = (await db.execute({
      sql: 'SELECT sector FROM portfolio_holdings WHERE snapshot_id = ?',
      args: [snapshot_id],
    })).rows[0] as { sector: string | null }

    // No fabricated sector — null/undefined remains so it's clearly "unclassified"
    expect(row.sector).toBeFalsy()
  })
})
