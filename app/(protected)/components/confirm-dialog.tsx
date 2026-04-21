'use client'
import React from 'react'

interface ConfirmDialogProps {
  open: boolean
  title?: string
  message: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
  danger?: boolean
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Delete', onConfirm, onCancel, danger = true }: ConfirmDialogProps) {
  if (!open) return null
  return (
    <>
      {/* Backdrop */}
      <div
        role="presentation"
        onClick={onCancel}
        style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(0,0,0,0.55)',
        }}
      />
      {/* Dialog */}
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title ?? 'Confirm'}
        style={{
          position: 'fixed',
          top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 201,
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '1.5rem',
          width: 'min(360px, calc(100vw - 2rem))',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}
      >
        {title && (
          <p style={{ margin: '0 0 0.5rem', fontSize: '15px', fontWeight: 600, color: 'var(--text)' }}>
            {title}
          </p>
        )}
        <p style={{ margin: '0 0 1.25rem', fontSize: '14px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
          {message}
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '8px 16px', borderRadius: '6px', border: '1px solid var(--border)',
              background: 'var(--bg-dim)', color: 'var(--text)', cursor: 'pointer',
              fontSize: '13px', fontWeight: 500, minHeight: '36px',
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: '8px 16px', borderRadius: '6px', border: 'none',
              background: danger ? 'var(--red)' : 'var(--accent)',
              color: 'white', cursor: 'pointer',
              fontSize: '13px', fontWeight: 600, minHeight: '36px',
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </>
  )
}
