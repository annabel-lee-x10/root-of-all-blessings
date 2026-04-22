// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'

const EMPTY_BRIEF = {
  id: 'b1',
  generated_at: new Date().toISOString(),
  brief_json: JSON.stringify({ world: [], sg: [], prop: [], jobsGlobal: [], jobsSg: [], port: [] }),
  tickers: null,
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => EMPTY_BRIEF,
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('NewsClient — sharedTickers prop', () => {
  it('shows Portfolio News section when sharedTickers has items (no upload needed)', async () => {
    const { NewsClient } = await import('@/app/(protected)/news/news-client')
    render(<NewsClient sharedTickers={['NVDA', 'MU']} />)
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled())
    // Portfolio section visible because tickers are provided via prop
    expect(screen.getByText('Portfolio News')).toBeInTheDocument()
  })

  it('calls onRequestUpload when Upload Portfolio button is clicked with onRequestUpload provided', async () => {
    const onRequestUpload = vi.fn()
    const { NewsClient } = await import('@/app/(protected)/news/news-client')
    render(<NewsClient sharedTickers={[]} onRequestUpload={onRequestUpload} />)
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled())
    const uploadBtn = screen.getByRole('button', { name: /upload portfolio/i })
    uploadBtn.click()
    expect(onRequestUpload).toHaveBeenCalledTimes(1)
  })

  it('shows ticker count in upload button when sharedTickers has items', async () => {
    const { NewsClient } = await import('@/app/(protected)/news/news-client')
    render(<NewsClient sharedTickers={['NVDA', 'MU', 'AAPL']} onRequestUpload={vi.fn()} />)
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled())
    expect(screen.getByRole('button', { name: /portfolio \(3\)/i })).toBeInTheDocument()
  })
})
