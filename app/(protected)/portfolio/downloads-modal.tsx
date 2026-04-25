'use client'
import { useEffect, useState, useCallback } from 'react'

const DARK = {
  bg: '#0E1117', card: '#161C27', border: '#242C3A', pale: '#C8D0DC',
  mid: '#6B7A92', inset: '#0A0D14', orange: '#E8520A', green: '#3DD68C',
}

interface SnapEntry {
  id: string
  snap_label: string | null
  snapshot_date: string
  total_value: number
}

export function DownloadsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [snaps, setSnaps] = useState<SnapEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [downloading, setDownloading] = useState<string | null>(null)

  const downloadExcel = useCallback(async (id: string, label: string) => {
    setDownloading(id)
    try {
      const res = await fetch(`/api/portfolio/download/excel/${id}`)
      if (!res.ok) return
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `portfolio-${label.replace(/[^a-z0-9-]/gi, '-')}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } finally {
      setDownloading(null)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    setLoading(true)
    fetch('/api/portfolio/history')
      .then(r => r.json())
      .then((data: SnapEntry[]) => {
        const sorted = [...data].sort(
          (a, b) => new Date(b.snapshot_date).getTime() - new Date(a.snapshot_date).getTime()
        )
        setSnaps(sorted.slice(0, 5))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [open])

  if (!open) return null

  const LINK: React.CSSProperties = {
    display: 'inline-block', padding: '4px 12px', borderRadius: 5,
    fontSize: '0.75rem', fontWeight: 600, textDecoration: 'none',
    border: `1px solid ${DARK.border}`, color: DARK.pale, background: DARK.inset,
  }

  return (
    <div
      data-testid="downloads-backdrop"
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
          padding: '20px 24px', width: 360, maxWidth: '90vw',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontWeight: 700, color: DARK.pale }}>Downloads</div>
          <button
            aria-label="close"
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: DARK.mid, cursor: 'pointer', fontSize: '1.2rem' }}
          >×</button>
        </div>

        {loading && <div style={{ color: DARK.mid, fontSize: '0.85rem' }}>Loading…</div>}

        {!loading && snaps.length === 0 && (
          <div style={{ color: DARK.mid, fontSize: '0.85rem' }}>No snapshots yet.</div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {snaps.map(s => {
            const label = s.snap_label ?? s.snapshot_date.slice(0, 10)
            const date = s.snapshot_date.slice(0, 10)
            return (
              <div key={s.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 12px', background: DARK.inset, borderRadius: 8,
                border: `1px solid ${DARK.border}`,
              }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.88rem', color: DARK.pale }}>{label}</div>
                  <div style={{ fontSize: '0.72rem', color: DARK.mid }}>{date}</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <a
                    href={`/api/portfolio/download/html/${s.id}`}
                    download
                    style={LINK}
                    aria-label="HTML"
                  >HTML</a>
                  <button
                    onClick={() => downloadExcel(s.id, label)}
                    disabled={downloading === s.id}
                    style={{ ...LINK, color: DARK.green, borderColor: DARK.green + '40', cursor: downloading === s.id ? 'wait' : 'pointer' }}
                    aria-label="Excel"
                  >{downloading === s.id ? '…' : 'Excel'}</button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
