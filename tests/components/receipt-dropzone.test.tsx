// @vitest-environment jsdom
// Regression tests for BUG-006: ReceiptDropzone shows "Network error" even when
// the server returned a 500 with a JSON or HTML body. The catch block ran because
// res.json() threw on a non-JSON response (HTML error page), masking the real cause.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

function makeFile(name = 'receipt.jpg'): File {
  return new File(['fake-image-bytes'], name, { type: 'image/jpeg' })
}

async function dropFile(file: File) {
  const { ReceiptDropzone } = await import('@/app/(protected)/components/receipt-dropzone')
  render(<ReceiptDropzone />)
  const dropzone = screen.getByRole('button', { name: /drop receipt/i })
  fireEvent.drop(dropzone, {
    dataTransfer: { files: [file], types: ['Files'] },
  })
  await waitFor(() => expect(screen.getByText(file.name)).toBeInTheDocument())
}

describe('ReceiptDropzone - error handling (BUG-006)', () => {
  it('shows the server error message when API returns 500 with JSON body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'status column missing' }),
    }))
    vi.spyOn(FileReader.prototype, 'readAsDataURL').mockImplementation(function (this: FileReader) {
      Object.defineProperty(this, 'result', { value: 'data:image/jpeg;base64,abc123' })
      this.onload?.({ target: this } as ProgressEvent<FileReader>)
    })

    await dropFile(makeFile())
    fireEvent.click(screen.getByRole('button', { name: /process/i }))

    await waitFor(() => {
      expect(screen.getByText('status column missing')).toBeInTheDocument()
    })
    expect(screen.queryByText('Network error')).not.toBeInTheDocument()
  })

  it('shows "Processing failed" when API returns 500 with non-JSON body (HTML error page)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => { throw new SyntaxError('Unexpected token') },
    }))
    vi.spyOn(FileReader.prototype, 'readAsDataURL').mockImplementation(function (this: FileReader) {
      Object.defineProperty(this, 'result', { value: 'data:image/jpeg;base64,abc123' })
      this.onload?.({ target: this } as ProgressEvent<FileReader>)
    })

    await dropFile(makeFile('receipt2.jpg'))
    fireEvent.click(screen.getByRole('button', { name: /process/i }))

    await waitFor(() => {
      expect(screen.getByText('Processing failed')).toBeInTheDocument()
    })
    expect(screen.queryByText('Network error')).not.toBeInTheDocument()
  })

  it('shows "Network error" only when fetch itself throws (no response at all)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    vi.spyOn(FileReader.prototype, 'readAsDataURL').mockImplementation(function (this: FileReader) {
      Object.defineProperty(this, 'result', { value: 'data:image/jpeg;base64,abc123' })
      this.onload?.({ target: this } as ProgressEvent<FileReader>)
    })

    await dropFile(makeFile('receipt3.jpg'))
    fireEvent.click(screen.getByRole('button', { name: /process/i }))

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument()
    })
  })
})
