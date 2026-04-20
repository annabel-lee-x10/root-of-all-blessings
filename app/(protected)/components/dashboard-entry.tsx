'use client'

import { useState } from 'react'
import { WheresMyMoney } from './wheres-my-money'
import { ReceiptDropzone } from './receipt-dropzone'

export function DashboardEntry() {
  const [open, setOpen] = useState(false)

  if (open) {
    return (
      <>
        <WheresMyMoney onCollapse={() => setOpen(false)} />
        <ReceiptDropzone />
      </>
    )
  }

  return (
    <section style={{ marginBottom: '2rem' }}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '1rem 1.25rem',
          cursor: 'pointer',
          minHeight: '52px',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text)', fontSize: '15px', fontWeight: 600 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add Transaction / Receipt
        </span>
        <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>▼</span>
      </button>
    </section>
  )
}
