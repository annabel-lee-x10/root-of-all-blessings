// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import React from 'react'

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

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

  describe('BUG-061: Excel download uses fetch+blob, not <a href> navigation', () => {
    it('Excel button is not a navigation link (no href)', async () => {
      mockFetch()
      const DownloadsModal = await importDownloadsModal()
      render(<DownloadsModal open={true} onClose={vi.fn()} />)
      await screen.findByText('Snap 29')
      expect(screen.queryAllByRole('link', { name: /excel/i })).toHaveLength(0)
      const btns = screen.getAllByRole('button', { name: /excel/i })
      expect(btns.length).toBeGreaterThan(0)
    })

    it('clicking Excel button calls fetch with the correct API URL', async () => {
      const xlsxBlob = new Blob(['fake-xlsx'], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const fetchMock = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(MOCK_HISTORY) })
        .mockResolvedValueOnce({ ok: true, blob: () => Promise.resolve(xlsxBlob) })
      vi.stubGlobal('fetch', fetchMock)

      const createObjectURL = vi.fn().mockReturnValue('blob:http://localhost/test-abc')
      const revokeObjectURL = vi.fn()
      vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL })

      const DownloadsModal = await importDownloadsModal()
      render(<DownloadsModal open={true} onClose={vi.fn()} />)
      await screen.findByText('Snap 29')

      const excelBtns = screen.getAllByRole('button', { name: /excel/i })
      fireEvent.click(excelBtns[0])

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith('/api/portfolio/download/excel/s5')
        expect(createObjectURL).toHaveBeenCalled()
      })
    })

    it('shows loading state while downloading', async () => {
      let resolveFetch!: (v: unknown) => void
      const fetchMock = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(MOCK_HISTORY) })
        .mockImplementationOnce(() => new Promise(r => { resolveFetch = r }))
      vi.stubGlobal('fetch', fetchMock)
      vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn().mockReturnValue('blob:x'), revokeObjectURL: vi.fn() })

      const DownloadsModal = await importDownloadsModal()
      render(<DownloadsModal open={true} onClose={vi.fn()} />)
      await screen.findByText('Snap 29')

      const excelBtns = screen.getAllByRole('button', { name: /excel/i })
      fireEvent.click(excelBtns[0])

      await waitFor(() => expect(excelBtns[0]).toBeDisabled())

      const xlsxBlob = new Blob(['fake'], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      resolveFetch({ ok: true, blob: () => Promise.resolve(xlsxBlob) })
      await waitFor(() => expect(excelBtns[0]).not.toBeDisabled())
    })
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
