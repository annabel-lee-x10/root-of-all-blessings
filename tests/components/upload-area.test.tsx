// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import React from 'react'

vi.mock('../../app/(protected)/components/toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

afterEach(() => { vi.unstubAllGlobals() })

async function importUploadArea() {
  const mod = await import('@/app/(protected)/portfolio/upload-area')
  return mod.UploadArea
}

describe('UploadArea', () => {
  it('renders a drop zone', async () => {
    const UploadArea = await importUploadArea()
    render(<UploadArea onUploaded={vi.fn()} />)
    const matches = screen.getAllByText(/drop|drag|screenshot/i)
    expect(matches.length).toBeGreaterThan(0)
  })

  it('shows file count after selecting images', async () => {
    const UploadArea = await importUploadArea()
    render(<UploadArea onUploaded={vi.fn()} />)

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['fake'], 'screenshot.jpg', { type: 'image/jpeg' })
    fireEvent.change(input, { target: { files: [file] } })

    expect((await screen.findAllByText(/1 screenshot|1 image/i)).length).toBeGreaterThan(0)
  })

  it('rejects non-image files', async () => {
    const UploadArea = await importUploadArea()
    render(<UploadArea onUploaded={vi.fn()} />)

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['<html></html>'], 'export.html', { type: 'text/html' })
    fireEvent.change(input, { target: { files: [file] } })

    expect(screen.queryByText(/1 screenshot|1 image/i)).not.toBeInTheDocument()
  })

  it('shows loading state during upload', async () => {
    const UploadArea = await importUploadArea()
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {}))) // never resolves

    render(<UploadArea onUploaded={vi.fn()} />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['x'], 'a.jpg', { type: 'image/jpeg' })] } })

    const btn = screen.getByRole('button', { name: /scan/i })
    fireEvent.click(btn)

    expect((await screen.findAllByText(/scanning|processing/i)).length).toBeGreaterThan(0)
  })

  it('shows results after successful upload', async () => {
    const UploadArea = await importUploadArea()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ snapshot_id: 's1', holdings_count: 3, transactions_count: 0, updated: false }),
    }))

    const onUploaded = vi.fn()
    render(<UploadArea onUploaded={onUploaded} />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['x'], 'a.jpg', { type: 'image/jpeg' })] } })
    fireEvent.click(screen.getByRole('button', { name: /scan/i }))

    expect(await screen.findByText(/3 holding/i)).toBeInTheDocument()
    expect(onUploaded).toHaveBeenCalled()
  })

  it('shows error message on failed upload', async () => {
    const UploadArea = await importUploadArea()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'OCR failed' }),
    }))

    render(<UploadArea onUploaded={vi.fn()} />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['x'], 'a.jpg', { type: 'image/jpeg' })] } })
    fireEvent.click(screen.getByRole('button', { name: /scan/i }))

    expect(await screen.findByText(/OCR failed|error/i)).toBeInTheDocument()
  })

  it('scan button is disabled when no files selected', async () => {
    const UploadArea = await importUploadArea()
    render(<UploadArea onUploaded={vi.fn()} />)
    const btn = screen.getByRole('button', { name: /scan/i })
    expect(btn).toBeDisabled()
  })
})
