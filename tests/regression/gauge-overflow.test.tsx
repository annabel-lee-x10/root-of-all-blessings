// @vitest-environment jsdom
// Regression test for BUG-031: savings gauge SVG overflows its container on real Android phones.
// Previous fix attempts (#64 overflow:hidden, #65 aspectRatio) still failed on device.
// Root cause: SVG height collapses to ~0 on mobile when only CSS controls width/height.
// Fix (4th attempt): intrinsic HTML width/height attrs + maxWidth:100% + height:auto.
// This prevents height collapse AND allows responsive scaling without layout tricks.
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

  it('SVG has intrinsic width="200" HTML attribute to prevent height collapse on mobile', async () => {
    const { ExpenseDashboard } = await import('@/app/(protected)/components/expense-dashboard')
    const { container } = render(<ExpenseDashboard />)
    const svg = container.querySelector('svg')!
    // HTML width/height attrs give browsers intrinsic dimensions they need to
    // maintain aspect ratio without collapsing height on mobile flex containers.
    expect(svg.getAttribute('width')).toBe('200')
  })

  it('SVG has intrinsic height="120" HTML attribute to prevent height collapse on mobile', async () => {
    const { ExpenseDashboard } = await import('@/app/(protected)/components/expense-dashboard')
    const { container } = render(<ExpenseDashboard />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('height')).toBe('120')
  })

  it('SVG uses maxWidth:100% (not width:100%) to allow responsive shrinking', async () => {
    const { ExpenseDashboard } = await import('@/app/(protected)/components/expense-dashboard')
    const { container } = render(<ExpenseDashboard />)
    const svg = container.querySelector('svg')!
    expect(svg.style.maxWidth).toBe('100%')
    expect(svg.style.width).not.toBe('100%')
  })

  it('SVG uses height:auto to maintain aspect ratio when scaled down', async () => {
    const { ExpenseDashboard } = await import('@/app/(protected)/components/expense-dashboard')
    const { container } = render(<ExpenseDashboard />)
    const svg = container.querySelector('svg')!
    expect(svg.style.height).toBe('auto')
  })
})
