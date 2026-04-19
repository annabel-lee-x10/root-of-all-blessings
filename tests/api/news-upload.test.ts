// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'

function makeUploadReq(file: File | null, extraHeaders?: Record<string, string>): NextRequest {
  if (!file) {
    // Send multipart without a file field
    const form = new FormData()
    form.append('other', 'value')
    return new NextRequest('http://localhost/api/news/upload', {
      method: 'POST',
      body: form,
      headers: extraHeaders,
    })
  }
  const form = new FormData()
  form.append('file', file)
  return new NextRequest('http://localhost/api/news/upload', {
    method: 'POST',
    body: form,
    headers: extraHeaders,
  })
}

function makeHtmlFile(content: string, name = 'portfolio.html', type = 'text/html'): File {
  return new File([content], name, { type })
}

const SAMPLE_HTML = `
<html><body>
<table>
  <tr><th>Ticker</th><th>Sector</th></tr>
  <tr><td>NVDA</td><td>Tech</td></tr>
  <tr><td>MU</td><td>Tech</td></tr>
  <tr><td>D05</td><td>Finance</td></tr>
</table>
</body></html>`

describe('POST /api/news/upload', () => {
  it('returns 400 when no file field is present', async () => {
    const { POST } = await import('@/app/api/news/upload/route')
    const res = await POST(makeUploadReq(null))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBeDefined()
  })

  it('returns 400 for a non-HTML file (by extension)', async () => {
    const { POST } = await import('@/app/api/news/upload/route')
    const file = new File(['some data'], 'report.pdf', { type: 'application/pdf' })
    const res = await POST(makeUploadReq(file))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toMatch(/html/i)
  })

  it('returns 400 for a .txt file', async () => {
    const { POST } = await import('@/app/api/news/upload/route')
    const file = new File(['hello world'], 'notes.txt', { type: 'text/plain' })
    const res = await POST(makeUploadReq(file))
    expect(res.status).toBe(400)
  })

  it('returns 413 when file exceeds 5 MB', async () => {
    const { POST } = await import('@/app/api/news/upload/route')
    const bigContent = 'A'.repeat(5 * 1024 * 1024 + 1)
    const file = makeHtmlFile(bigContent, 'big.html')
    const res = await POST(makeUploadReq(file))
    expect(res.status).toBe(413)
    const data = await res.json()
    expect(data.error).toMatch(/5 mb/i)
  })

  it('returns tickers extracted from a valid portfolio HTML', async () => {
    const { POST } = await import('@/app/api/news/upload/route')
    const file = makeHtmlFile(SAMPLE_HTML)
    const res = await POST(makeUploadReq(file))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(Array.isArray(data.tickers)).toBe(true)
    expect(data.tickers).toContain('NVDA')
    expect(data.tickers).toContain('MU')
    expect(data.tickers).toContain('D05')
  })

  it('returns known tickers before unknown ones', async () => {
    const { POST } = await import('@/app/api/news/upload/route')
    const html = `
      <table>
        <tr><td>ZZZZ</td><td>Unknown</td></tr>
        <tr><td>NVDA</td><td>Tech</td></tr>
      </table>`
    const file = makeHtmlFile(html)
    const res = await POST(makeUploadReq(file))
    const data = await res.json()
    const nvdaIdx = data.tickers.indexOf('NVDA')
    const zzzzIdx = data.tickers.indexOf('ZZZZ')
    expect(nvdaIdx).toBeLessThan(zzzzIdx)
  })

  it('strips order labels (SELL, DIV) from ticker text', async () => {
    const { POST } = await import('@/app/api/news/upload/route')
    const html = `
      <table>
        <tr><td>NVDA SELL</td><td>Tech</td></tr>
        <tr><td>MU DIV</td><td>Tech</td></tr>
      </table>`
    const file = makeHtmlFile(html)
    const res = await POST(makeUploadReq(file))
    const data = await res.json()
    expect(data.tickers).toContain('NVDA')
    expect(data.tickers).toContain('MU')
    expect(data.tickers).not.toContain('NVDA SELL')
    expect(data.tickers).not.toContain('MU DIV')
  })

  it('returns an empty array for HTML with no ticker-shaped content', async () => {
    const { POST } = await import('@/app/api/news/upload/route')
    const html = '<html><body><p>No tickers here</p></body></html>'
    const file = makeHtmlFile(html)
    const res = await POST(makeUploadReq(file))
    const data = await res.json()
    expect(data.tickers).toEqual([])
  })

  it('accepts .htm extension as valid', async () => {
    const { POST } = await import('@/app/api/news/upload/route')
    const file = makeHtmlFile(SAMPLE_HTML, 'portfolio.htm', 'text/html')
    const res = await POST(makeUploadReq(file))
    expect(res.status).toBe(200)
  })

  it('does not return duplicates', async () => {
    const { POST } = await import('@/app/api/news/upload/route')
    const html = `
      <table>
        <tr><td>NVDA</td></tr>
        <tr><td>NVDA</td></tr>
        <tr><td>MU</td></tr>
      </table>`
    const file = makeHtmlFile(html)
    const res = await POST(makeUploadReq(file))
    const data = await res.json()
    const nvdaOccurrences = data.tickers.filter((t: string) => t === 'NVDA').length
    expect(nvdaOccurrences).toBe(1)
  })
})
