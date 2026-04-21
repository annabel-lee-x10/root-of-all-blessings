// @vitest-environment jsdom
// Regression test for BUG-031: savings gauge SVG overflows card on mobile
// Root cause: overflow:'visible' on SVG caused arc to paint outside element bounds,
// covering header/pills on mobile when flex container height collapses.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from '@testing-library/react'
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
  end_date: '2026-04-21T23:59:59+08:00',
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

describe('BUG-031 · SavingsGauge SVG overflow containment', () => {
  it('SVG must NOT have overflow:visible — it must be hidden or unset', async () => {
    const { ExpenseDashboard } = await import('@/app/(protected)/components/expense-dashboard')
    const { container } = render(<ExpenseDashboard />)
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    const overflow = svg!.style.overflow
    // overflow:visible lets the arc paint outside the SVG box and cover header/pills
    expect(overflow).not.toBe('visible')
  })

  it('SVG wrapper div must not allow overflow', async () => {
    const { ExpenseDashboard } = await import('@/app/(protected)/components/expense-dashboard')
    const { container } = render(<ExpenseDashboard />)
    const svg = container.querySelector('svg')!
    const wrapper = svg.parentElement!
    // The wrapper must clip or hide overflow so the arc cannot escape the card
    const wrapperOverflow = wrapper.style.overflow
    expect(wrapperOverflow).toBe('hidden')
  })

  it('SVG has height:auto so intrinsic aspect ratio is maintained in flex containers', async () => {
    const { ExpenseDashboard } = await import('@/app/(protected)/components/expense-dashboard')
    const { container } = render(<ExpenseDashboard />)
    const svg = container.querySelector('svg')!
    // Without explicit height:auto, some browsers collapse the SVG height to 0
    // inside flex containers, causing the viewBox to misalign and overflow
    expect(svg.style.height).toBe('auto')
  })
})
