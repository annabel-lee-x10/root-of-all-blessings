// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'

const EMPTY_BRIEF = {
  id: 'brief-1',
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

describe('NewsClient — FAB upload trigger (BUG-021)', () => {
  it('clicks the hidden file input when news:open-upload event fires', async () => {
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {})
    const { NewsClient } = await import('@/app/(protected)/news/news-client')
    render(<NewsClient />)
    // Wait for initial load
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled())
    // Dispatch the custom event
    window.dispatchEvent(new CustomEvent('news:open-upload'))
    expect(clickSpy).toHaveBeenCalledTimes(1)
    clickSpy.mockRestore()
  })

  it('Portfolio section is hidden when no tickers loaded', async () => {
    const { NewsClient } = await import('@/app/(protected)/news/news-client')
    const { container } = render(<NewsClient />)
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled())
    expect(container.textContent).not.toContain('Portfolio News')
  })

  it('Upload Portfolio button triggers file input click', async () => {
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {})
    const { NewsClient } = await import('@/app/(protected)/news/news-client')
    const { getByRole } = render(<NewsClient />)
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled())
    // The sub-nav upload button should also work
    const uploadBtn = getByRole('button', { name: /upload portfolio/i })
    uploadBtn.click()
    expect(clickSpy).toHaveBeenCalledTimes(1)
    clickSpy.mockRestore()
  })
})
