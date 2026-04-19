// @vitest-environment jsdom
// Regression: mic button on Where's My Money was silently broken —
// feature never implemented + Permissions-Policy blocked microphone.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import '@testing-library/jest-dom'

// Minimal fetch mock — WheresMyMoney fetches accounts/categories/tags/payees on mount
function mockEmptyFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    })
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// ── Speech Recognition mock factory ───────────────────────────────────────

type Handler = ((e: unknown) => void) | null

function makeSRMock() {
  const handlers: Record<string, Handler> = {
    onstart: null,
    onend: null,
    onerror: null,
    onresult: null,
  }

  const mockStart = vi.fn(function () { handlers.onstart?.(undefined) })
  const mockStop = vi.fn(function () { handlers.onend?.(undefined) })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function MockSR(this: any) {
    this.lang = 'en-US'
    this.interimResults = false
    this.maxAlternatives = 1
    this.start = mockStart
    this.stop = mockStop
  }

  for (const name of ['onstart', 'onend', 'onerror', 'onresult']) {
    Object.defineProperty(MockSR.prototype, name, {
      configurable: true,
      set(fn: Handler) { handlers[name] = fn },
      get() { return handlers[name] },
    })
  }

  function fireEvent_sr(event: string, payload?: unknown) {
    handlers[event]?.(payload)
  }

  return { MockSR, mockStart, mockStop, fire: fireEvent_sr }
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('Voice input regression', () => {
  beforeEach(() => {
    mockEmptyFetch()
  })

  it('renders a mic/voice button with accessible label', async () => {
    const { WheresMyMoney } = await import('@/app/(protected)/components/wheres-my-money')
    render(<WheresMyMoney />)
    const micBtn = screen.getByRole('button', { name: /tap mic to log an expense by voice/i })
    expect(micBtn).toBeInTheDocument()
  })

  it('shows "Voice" as button text when idle', async () => {
    const { WheresMyMoney } = await import('@/app/(protected)/components/wheres-my-money')
    render(<WheresMyMoney />)
    expect(screen.getByRole('button', { name: /tap mic/i })).toHaveTextContent('Voice')
  })

  it('shows unsupported error when SpeechRecognition is unavailable', async () => {
    const win = window as unknown as Record<string, unknown>
    delete win.SpeechRecognition
    delete win.webkitSpeechRecognition

    const { WheresMyMoney } = await import('@/app/(protected)/components/wheres-my-money')
    render(<WheresMyMoney />)

    fireEvent.click(screen.getByRole('button', { name: /tap mic/i }))

    expect(
      await screen.findByText(/voice input is not supported/i)
    ).toBeInTheDocument()
  })

  it('shows Listening… and changes aria-label while active', async () => {
    const { MockSR, mockStart } = makeSRMock()
    const win = window as unknown as Record<string, unknown>
    win.SpeechRecognition = MockSR

    const { WheresMyMoney } = await import('@/app/(protected)/components/wheres-my-money')
    render(<WheresMyMoney />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /tap mic/i }))
    })

    expect(mockStart).toHaveBeenCalled()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /stop listening/i })).toHaveTextContent('Listening…')
    })

    delete win.SpeechRecognition
  })

  it('stops recognition when mic button is tapped while listening', async () => {
    const { MockSR, mockStop } = makeSRMock()
    const win = window as unknown as Record<string, unknown>
    win.SpeechRecognition = MockSR

    const { WheresMyMoney } = await import('@/app/(protected)/components/wheres-my-money')
    render(<WheresMyMoney />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /tap mic/i }))
    })
    await waitFor(() => screen.getByRole('button', { name: /stop listening/i }))

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /stop listening/i }))
    })
    expect(mockStop).toHaveBeenCalled()

    delete win.SpeechRecognition
  })

  it('shows permission-denied error message on not-allowed onerror', async () => {
    const { MockSR, fire } = makeSRMock()
    const win = window as unknown as Record<string, unknown>
    win.SpeechRecognition = MockSR

    const { WheresMyMoney } = await import('@/app/(protected)/components/wheres-my-money')
    render(<WheresMyMoney />)

    // Click mic (onstart fires synchronously inside mockStart)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /tap mic/i }))
    })

    // Now fire the error
    await act(async () => {
      fire('onerror', { error: 'not-allowed' })
    })

    expect(await screen.findByText(/microphone permission denied/i)).toBeInTheDocument()

    delete win.SpeechRecognition
  })

  it('error banner can be dismissed with ×', async () => {
    const win = window as unknown as Record<string, unknown>
    delete win.SpeechRecognition
    delete win.webkitSpeechRecognition

    const { WheresMyMoney } = await import('@/app/(protected)/components/wheres-my-money')
    render(<WheresMyMoney />)

    fireEvent.click(screen.getByRole('button', { name: /tap mic/i }))
    await screen.findByText(/voice input is not supported/i)

    fireEvent.click(screen.getByRole('button', { name: /dismiss voice error/i }))
    expect(screen.queryByText(/voice input is not supported/i)).not.toBeInTheDocument()
  })
})

describe('next.config Permissions-Policy regression', () => {
  it('allows microphone for self — not blocked by microphone=()', async () => {
    const nextConfig = await import('@/next.config')
    const config = nextConfig.default
    const headersFn = config.headers
    if (!headersFn) throw new Error('next.config.ts must export headers')

    const rules = await headersFn()
    const allHeaders = rules.flatMap((r) => r.headers)
    const pp = allHeaders.find((h) => h.key === 'Permissions-Policy')
    expect(pp).toBeDefined()
    expect(pp!.value).not.toContain('microphone=()')
    expect(pp!.value).toContain('microphone=(self)')
  })
})
