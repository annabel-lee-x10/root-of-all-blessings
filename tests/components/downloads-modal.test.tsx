// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import React from 'react'

afterEach(() => { vi.unstubAllGlobals() })

async function importDownloadsModal() {
  const mod = await import('@/app/(protected)/portfolio/downloads-modal')
  return mod.DownloadsModal
}

const MOCK_HISTORY = [
  { id: 's5', snap_label: 'Snap 29', snapshot_date: '2026-04-23T00:00:00.000Z', total_value: 15000 },
  { id: 's4', snap_label: 'Snap 28', snapshot_date: '2026-04-22T00:00:00.000Z', total_value: 14369 },
  { id: 's3', snap_label: 'Snap 27', snapshot_date: '2026-04-21T00:00:00.000Z', total_value: 13800 },
]

function mockFetch() {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(MOCK_HISTORY),
  }))
}

describe('DownloadsModal', () => {
  it('renders nothing when open=false', async () => {
    const DownloadsModal = await importDownloadsModal()
    const { container } = render(<DownloadsModal open={false} onClose={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })

  it('fetches and renders snapshot list when open=true', async () => {
    mockFetch()
    const DownloadsModal = await importDownloadsModal()
    render(<DownloadsModal open={true} onClose={vi.fn()} />)
    expect(await screen.findByText('Snap 29')).toBeInTheDocument()
    expect(await screen.findByText('Snap 28')).toBeInTheDocument()
  })

  it('HTML download link has correct href', async () => {
    mockFetch()
    const DownloadsModal = await importDownloadsModal()
    render(<DownloadsModal open={true} onClose={vi.fn()} />)
    await screen.findByText('Snap 29')
    const htmlLinks = screen.getAllByRole('link', { name: /html/i })
    expect(htmlLinks[0]).toHaveAttribute('href', '/api/portfolio/download/html/s5')
  })

  it('Excel download link has correct href', async () => {
    mockFetch()
    const DownloadsModal = await importDownloadsModal()
    render(<DownloadsModal open={true} onClose={vi.fn()} />)
    await screen.findByText('Snap 29')
    const xlsxLinks = screen.getAllByRole('link', { name: /excel/i })
    expect(xlsxLinks[0]).toHaveAttribute('href', '/api/portfolio/download/excel/s5')
  })

  it('calls onClose when × button is clicked', async () => {
    mockFetch()
    const onClose = vi.fn()
    const DownloadsModal = await importDownloadsModal()
    render(<DownloadsModal open={true} onClose={onClose} />)
    await screen.findByText('Snap 29')
    fireEvent.click(screen.getByRole('button', { name: /close|×/i }))
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onClose when backdrop is clicked', async () => {
    mockFetch()
    const onClose = vi.fn()
    const DownloadsModal = await importDownloadsModal()
    render(<DownloadsModal open={true} onClose={onClose} />)
    await screen.findByText('Snap 29')
    fireEvent.click(screen.getByTestId('downloads-backdrop'))
    expect(onClose).toHaveBeenCalled()
  })

  it('shows last 5 snapshots maximum', async () => {
    const manySnaps = Array.from({ length: 8 }, (_, i) => ({
      id: `s${i}`, snap_label: `Snap ${i}`,
      snapshot_date: `2026-04-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`,
      total_value: 10000,
    }))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(manySnaps),
    }))
    const DownloadsModal = await importDownloadsModal()
    render(<DownloadsModal open={true} onClose={vi.fn()} />)
    await screen.findByText('Snap 7')
    const htmlLinks = screen.getAllByRole('link', { name: /html/i })
    expect(htmlLinks.length).toBe(5)
  })
})
