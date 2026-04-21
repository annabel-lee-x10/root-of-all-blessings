// @vitest-environment jsdom
// Regression test for BUG-031: savings gauge SVG overflows / fragments on mobile
// Root cause: SVG height collapses to ~0 in flex containers on mobile browsers;
// overflow:visible then paints arc outside the element (3rd report).
// overflow:hidden without aspectRatio caused visible fragments as the SVG clipped
// a near-zero-height viewport.
// Fix: aspectRatio:'200 / 120' prevents height collapse; overflow:'hidden' contains
// the arc within SVG bounds; wrapper overflow:'hidden' is defense-in-depth.
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

describe('BUG-031 · SavingsGauge SVG overflow containment', () => {
  it('SVG must NOT have overflow:visible — it must be hidden', async () => {
    const { ExpenseDashboard } = await import('@/app/(protected)/components/expense-dashboard')
    const { container } = render(<ExpenseDashboard />)
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg!.style.overflow).toBe('hidden')
  })

  it('SVG wrapper div must clip overflow to prevent arc escaping card', async () => {
    const { ExpenseDashboard } = await import('@/app/(protected)/components/expense-dashboard')
    const { container } = render(<ExpenseDashboard />)
    const svg = container.querySelector('svg')!
    const wrapper = svg.parentElement!
    expect(wrapper.style.overflow).toBe('hidden')
  })

  it('SVG has aspectRatio to prevent height collapsing to zero in mobile flex containers', async () => {
    const { ExpenseDashboard } = await import('@/app/(protected)/components/expense-dashboard')
    const { container } = render(<ExpenseDashboard />)
    const svg = container.querySelector('svg')!
    // Without aspectRatio, Safari/iOS collapses SVG height to ~0 in flex containers.
    // A collapsed SVG + overflow:hidden clips the arc into disconnected fragments.
    expect(svg.style.aspectRatio).toBe('200 / 120')
  })
})
