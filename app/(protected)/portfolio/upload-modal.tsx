'use client'

import { UploadArea } from './upload-area'

const DARK = {
  card: '#161C27', border: '#242C3A', pale: '#C8D0DC', mid: '#6B7A92',
}

export function UploadModal({ open, onClose, onUploaded }: {
  open: boolean
  onClose: () => void
  onUploaded: () => void
}) {
  if (!open) return null

  return (
    <div
      data-testid="upload-backdrop"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: DARK.card, border: `1px solid ${DARK.border}`, borderRadius: 12,
          padding: '20px 24px', width: 400, maxWidth: '90vw',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontWeight: 700, color: DARK.pale }}>Upload Screenshots</div>
          <button
            aria-label="close"
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: DARK.mid, cursor: 'pointer', fontSize: '1.2rem' }}
          >×</button>
        </div>
        <UploadArea onUploaded={() => { onUploaded(); onClose() }} />
      </div>
    </div>
  )
}
