'use client'
import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

type ToastType = 'success' | 'error'
interface ToastAction { label: string; onClick: () => void }
interface Toast { id: number; message: string; type: ToastType; action?: ToastAction }
interface ToastContextValue { showToast: (message: string, type?: ToastType, action?: ToastAction) => void }

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} })

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const showToast = useCallback((message: string, type: ToastType = 'success', action?: ToastAction) => {
    const id = Date.now()
    const duration = action ? 5500 : 3500
    setToasts((prev) => [...prev, { id, message, type, action }])
    setTimeout(() => dismiss(id), duration)
  }, [dismiss])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        style={{
          position: 'fixed', bottom: '80px', right: '16px',
          display: 'flex', flexDirection: 'column', gap: '8px', zIndex: 9999,
          maxWidth: 'calc(100vw - 32px)',
        }}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            style={{
              padding: '10px 14px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 500,
              boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
              background: t.type === 'success' ? 'var(--bg-success)' : 'var(--bg-error)',
              color: t.type === 'success' ? 'var(--green)' : 'var(--red)',
              border: `1px solid ${t.type === 'success' ? 'var(--border-success)' : 'var(--border-error)'}`,
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <span style={{ flex: 1 }}>{t.message}</span>
            {t.action && (
              <button
                onClick={() => { t.action!.onClick(); dismiss(t.id) }}
                style={{
                  background: 'none',
                  border: '1px solid currentColor',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  color: 'inherit',
                  fontSize: '12px',
                  fontWeight: 700,
                  padding: '2px 10px',
                  flexShrink: 0,
                  minHeight: '28px',
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
