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

  it('does not render an Upload Portfolio button in the sub-nav (BUG-040)', async () => {
    const { NewsClient } = await import('@/app/(protected)/news/news-client')
    const { queryByRole } = render(<NewsClient sharedTickers={[]} />)
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled())
    expect(queryByRole('button', { name: /upload portfolio/i })).not.toBeInTheDocument()
  })
})
