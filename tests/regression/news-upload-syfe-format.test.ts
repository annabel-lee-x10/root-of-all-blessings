// @vitest-environment node
// Regression test for BUG-011: extractTickers drops Syfe-format "TICKER GEOLABEL" cells
// ("MU US", "Z74 SG", "ABBV US DIV 15 May") — only the base ticker should be extracted.
import { describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'

function makeUploadReq(html: string): NextRequest {
  const form = new FormData()
  form.append('file', new File([html], 'portfolio.html', { type: 'text/html' }))
  return new NextRequest('http://localhost/api/news/upload', { method: 'POST', body: form })
}

describe('POST /api/news/upload – BUG-011 Syfe TICKER+GEOLABEL format', () => {
  it('extracts base ticker when cell contains "TICKER GEOLABEL" (e.g. "MU US")', async () => {
    const { POST } = await import('@/app/api/news/upload/route')
    const html = `<table>
      <tr><th>Stock</th><th>Value</th></tr>
      <tr><td>MU US</td><td>1600.00</td></tr>
    </table>`
    const res = await POST(makeUploadReq(html))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.tickers).toContain('MU')
    expect(data.tickers).not.toContain('US')
  })

  it('extracts base ticker from SG-listed stocks ("Z74 SG", "D05 SG")', async () => {
    const { POST } = await import('@/app/api/news/upload/route')
    const html = `<table>
      <tr><th>Stock</th><th>Value</th></tr>
      <tr><td>Z74 SG</td><td>500.00</td></tr>
      <tr><td>D05 SG</td><td>800.00</td></tr>
    </table>`
    const res = await POST(makeUploadReq(html))
    const data = await res.json()
    expect(data.tickers).toContain('Z74')
    expect(data.tickers).toContain('D05')
  })

  it('extracts ticker from Syfe verbose format ("ABBV US DIV 15 May")', async () => {
    const { POST } = await import('@/app/api/news/upload/route')
    const html = `<table>
      <tr><td>ABBV US DIV 15 May</td><td>640.00</td></tr>
    </table>`
    const res = await POST(makeUploadReq(html))
    const data = await res.json()
    expect(data.tickers).toContain('ABBV')
  })

  it('handles a realistic mixed Syfe portfolio HTML snapshot', async () => {
    const { POST } = await import('@/app/api/news/upload/route')
    const html = `<html><body><table>
      <tr><th>Instrument</th><th>Market Value</th><th>Unrealised P&L</th></tr>
      <tr><td>MU US</td><td>1,600.00</td><td>-50.00</td></tr>
      <tr><td>ABBV US</td><td>640.00</td><td>20.00</td></tr>
      <tr><td>Z74 SG</td><td>500.00</td><td>-5.00</td></tr>
      <tr><td>NVDA US SELL</td><td>2,000.00</td><td>300.00</td></tr>
    </table></body></html>`
    const res = await POST(makeUploadReq(html))
    const data = await res.json()
    expect(data.tickers).toContain('MU')
    expect(data.tickers).toContain('ABBV')
    expect(data.tickers).toContain('Z74')
    expect(data.tickers).toContain('NVDA')
    expect(data.tickers).not.toContain('US')
    expect(data.tickers).not.toContain('SG')
  })
})
