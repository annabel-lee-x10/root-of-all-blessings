// @vitest-environment jsdom
// Regression test for BUG-031: savings gauge overflows on real Android phones.
// SVG approach failed 4 attempts (#64, #65, #66, #67). Replaced with div progress bar.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

const loadedData = {
  total_spend: 800,
  total_income: 5000,
  daily_average: 40,
  category_breakdown: [],
  days_in_range: 20,
  budget_remaining: null,
  range: '1m',
  start_date: '2026-04-01T00:00:00+08:00',
  end_date: '2026-04-22T23:59:59+08:00',
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => loadedData,
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('BUG-031 · SavingsGauge div progress bar (SVG removed)', () => {
  it('must NOT render any SVG element — SVG approach failed on real Android', async () => {
    const { ExpenseDashboard } = await import('@/app/(protected)/components/expense-dashboard')
    const { container } = render(<ExpenseDashboard />)
    const svg = container.querySelector('svg')
    expect(svg).toBeNull()
  })

  it('renders a horizontal bar div with overflow:hidden to contain the fill', async () => {
    const { ExpenseDashboard } = await import('@/app/(protected)/components/expense-dashboard')
    const { container } = render(<ExpenseDashboard />)
    // Find the track div: must have overflow:hidden so the fill bar is clipped
    const bars = Array.from(container.querySelectorAll('div')).filter(
      d => d.style.overflow === 'hidden' && d.style.borderRadius !== ''
    )
    expect(bars.length).toBeGreaterThan(0)
  })

  it('shows the savings percentage label text when income > expense', async () => {
    const { ExpenseDashboard } = await import('@/app/(protected)/components/expense-dashboard')
    const { container } = render(<ExpenseDashboard />)
    // income=5000, expense=800 → savings = (5000-800)/5000 = 84% saved
    await waitFor(() => expect(container.textContent).toMatch(/84.*saved|saved.*84/))
  })

  it('shows "deficit" label when expense > income', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ...loadedData, total_spend: 6000, total_income: 5000 }),
    }))
    const mod = await import('@/app/(protected)/components/expense-dashboard')
    const { container } = render(<mod.ExpenseDashboard />)
    await waitFor(() => expect(container.textContent).toMatch(/deficit/))
  })
})
