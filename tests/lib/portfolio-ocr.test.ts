// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import { buildOcrMessages, parseOcrResponse } from '@/lib/portfolio/ocr'

describe('buildOcrMessages', () => {
  it('builds messages array with one user message', () => {
    const images = [{ base64: 'abc123', mediaType: 'image/jpeg' }]
    const messages = buildOcrMessages(images)
    expect(messages).toHaveLength(1)
    expect(messages[0].role).toBe('user')
  })

  it('includes one image block per image plus one text block', () => {
    const images = [
      { base64: 'abc123', mediaType: 'image/jpeg' },
      { base64: 'def456', mediaType: 'image/png' },
    ]
    const messages = buildOcrMessages(images)
    const content = messages[0].content
    expect(content).toHaveLength(3) // 2 images + 1 text
    expect(content[0].type).toBe('image')
    expect(content[1].type).toBe('image')
    expect(content[2].type).toBe('text')
  })

  it('sets correct base64 source on image blocks', () => {
    const images = [{ base64: 'abc123', mediaType: 'image/jpeg' }]
    const messages = buildOcrMessages(images)
    const imgBlock = messages[0].content[0]
    expect(imgBlock.source.type).toBe('base64')
    expect(imgBlock.source.media_type).toBe('image/jpeg')
    expect(imgBlock.source.data).toBe('abc123')
  })

  it('prompt identifies Syfe brokerage app', () => {
    const images = [{ base64: 'abc', mediaType: 'image/jpeg' }]
    const messages = buildOcrMessages(images)
    const textBlock = messages[0].content.find((c: { type: string }) => c.type === 'text')
    expect(textBlock?.text).toContain('Syfe brokerage app')
  })

  it('prompt text includes all known screenshot types', () => {
    const images = [{ base64: 'abc', mediaType: 'image/jpeg' }]
    const messages = buildOcrMessages(images)
    const text = messages[0].content.find((c: { type: string }) => c.type === 'text')?.text ?? ''
    expect(text).toContain('holdings')
    expect(text).toContain('summary')
    expect(text).toContain('orders')
    expect(text).toContain('stock_detail')
  })

  it('prompt describes Holdings tab geo badge and currency rules', () => {
    const images = [{ base64: 'abc', mediaType: 'image/jpeg' }]
    const messages = buildOcrMessages(images)
    const text = messages[0].content.find((c: { type: string }) => c.type === 'text')?.text ?? ''
    expect(text).toContain('USD for US')
    expect(text).toContain('SGD for SG')
    expect(text).toContain('GBP for UK')
  })

  it('prompt mentions ~APPROX for unclear values', () => {
    const images = [{ base64: 'abc', mediaType: 'image/jpeg' }]
    const messages = buildOcrMessages(images)
    const text = messages[0].content.find((c: { type: string }) => c.type === 'text')?.text ?? ''
    expect(text).toContain('~APPROX')
  })
})

describe('parseOcrResponse', () => {
  it('parses a holdings screenshot result', () => {
    const raw = JSON.stringify([
      {
        type: 'holdings',
        data: {
          holdings: [
            { ticker: 'AAPL', name: 'Apple Inc', geo: 'US', price: 175.5, change_1d: 1.2, value: 3510, pnl: 200, qty: 20 },
          ],
        },
      },
    ])
    const result = parseOcrResponse(raw)
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('holdings')
    expect(result[0].data.holdings[0].ticker).toBe('AAPL')
    expect(result[0].data.holdings[0].price).toBe(175.5)
  })

  it('parses a summary screenshot result', () => {
    const raw = JSON.stringify([
      {
        type: 'summary',
        data: { total_value: 50000, unrealised_pnl: 1500, realised_pnl: 200, cash: 3000, pending: 100 },
      },
    ])
    const result = parseOcrResponse(raw)
    expect(result[0].type).toBe('summary')
    expect(result[0].data.total_value).toBe(50000)
    expect(result[0].data.cash).toBe(3000)
  })

  it('parses an orders screenshot result', () => {
    const raw = JSON.stringify([
      {
        type: 'orders',
        data: {
          orders: [
            { ticker: 'MU', type: 'SELL LIMIT', price: 500, qty: 5, placed_date: '21 Apr 2026' },
          ],
        },
      },
    ])
    const result = parseOcrResponse(raw)
    expect(result[0].type).toBe('orders')
    expect(result[0].data.orders[0].ticker).toBe('MU')
    expect(result[0].data.orders[0].price).toBe(500)
  })

  it('parses a transactions screenshot result', () => {
    const raw = JSON.stringify([
      {
        type: 'transactions',
        data: {
          transactions: [
            { type: 'deposit', amount: 5000, currency: 'SGD', date: '20 Apr 2026' },
          ],
        },
      },
    ])
    const result = parseOcrResponse(raw)
    expect(result[0].type).toBe('transactions')
    expect(result[0].data.transactions[0].amount).toBe(5000)
  })

  it('parses a stock_detail screenshot result', () => {
    const raw = JSON.stringify([
      {
        type: 'stock_detail',
        data: { ticker: 'MU', day_high: 510, day_low: 490, prev_close: 498, avg_cost: 400, qty: 5 },
      },
    ])
    const result = parseOcrResponse(raw)
    expect(result[0].type).toBe('stock_detail')
    expect(result[0].data.ticker).toBe('MU')
    expect(result[0].data.day_high).toBe(510)
  })

  it('preserves ~APPROX string values', () => {
    const raw = JSON.stringify([
      {
        type: 'summary',
        data: { total_value: '~APPROX', unrealised_pnl: 1500 },
      },
    ])
    const result = parseOcrResponse(raw)
    expect(result[0].data.total_value).toBe('~APPROX')
  })

  it('strips markdown code fences and parses JSON inside', () => {
    const inner = JSON.stringify([{ type: 'summary', data: { total_value: 100 } }])
    const raw = '```json\n' + inner + '\n```'
    const result = parseOcrResponse(raw)
    expect(result).toHaveLength(1)
    expect(result[0].data.total_value).toBe(100)
  })

  it('returns empty array for malformed JSON', () => {
    expect(parseOcrResponse('not valid json at all')).toEqual([])
  })

  it('returns empty array for empty string', () => {
    expect(parseOcrResponse('')).toEqual([])
  })

  it('handles multiple images in one response', () => {
    const raw = JSON.stringify([
      { type: 'summary', data: { total_value: 50000 } },
      { type: 'holdings', data: { holdings: [{ ticker: 'MSFT', value: 1000 }] } },
    ])
    const result = parseOcrResponse(raw)
    expect(result).toHaveLength(2)
    expect(result[0].type).toBe('summary')
    expect(result[1].type).toBe('holdings')
  })

  it('logs error to console.error when JSON parse fails', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    parseOcrResponse('definitely not json {{{')
    expect(spy).toHaveBeenCalledWith(
      '[portfolio-ocr] JSON parse failed. Raw text:',
      expect.any(String)
    )
    spy.mockRestore()
  })

  it('logs raw text info to console.log at start of parsing', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    parseOcrResponse(JSON.stringify([{ type: 'summary', data: { total_value: 1000 } }]))
    expect(spy).toHaveBeenCalledWith(
      '[portfolio-ocr] raw length:',
      expect.any(Number),
      'first 200:',
      expect.any(String)
    )
    spy.mockRestore()
  })

  it('parses valid Syfe Holdings-tab format with currency and geo', () => {
    const raw = JSON.stringify([{
      type: 'holdings',
      data: {
        holdings: [
          { ticker: 'MU', name: 'Micron Technology', geo: 'US', currency: 'USD', price: 487.48, change_1d: 8.48, value: 2437.40, pnl: 751.40, qty: 5 },
          { ticker: 'Z74', name: 'Singtel', geo: 'SG', currency: 'SGD', price: 2.91, change_1d: -0.34, value: 291.00, pnl: -7.00, qty: 100 },
          { ticker: 'WISE', name: 'Wise PLC', geo: 'UK', currency: 'GBP', price: 9.12, change_1d: 1.23, value: 91.20, pnl: 1.70, qty: 10 },
        ],
      },
    }])
    const result = parseOcrResponse(raw)
    expect(result).toHaveLength(1)
    expect(result[0].data.holdings[0].currency).toBe('USD')
    expect(result[0].data.holdings[1].currency).toBe('SGD')
    expect(result[0].data.holdings[2].currency).toBe('GBP')
    expect(result[0].data.holdings[0].change_1d).toBe(8.48)
    expect(result[0].data.holdings[0].pnl).toBe(751.40)
  })
})
