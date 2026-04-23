'use client'
import { useRef, useState } from 'react'
import { useToast } from '../components/toast'

const DARK = {
  bg: '#0E1117', card: '#161C27', border: '#242C3A', pale: '#C8D0DC',
  mid: '#6B7A92', inset: '#0A0D14', orange: '#E8520A', green: '#3DD68C',
  red: '#FF5A5A',
}

interface ScanResult {
  snapshot_id: string
  holdings_count: number
  transactions_count: number
  updated: boolean
}

export function UploadArea({ onUploaded }: { onUploaded: () => void }) {
  const { showToast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<File[]>([])
  const [scanning, setScanning] = useState(false)
  const [result, setResult] = useState<ScanResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [drag, setDrag] = useState(false)

  const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp']

  function handleFiles(incoming: FileList | File[]) {
    const valid = Array.from(incoming).filter(f => ACCEPTED.includes(f.type))
    if (valid.length === 0) return
    setFiles(valid)
    setResult(null)
    setError(null)
  }

  async function handleScan() {
    if (files.length === 0) return
    setScanning(true)
    setError(null)
    try {
      const form = new FormData()
      for (const f of files) form.append('images', f)
      const res = await fetch('/api/portfolio/scan', { method: 'POST', body: form })
      let data: Record<string, unknown>
      try { data = await res.json() } catch { data = {} }
      if (!res.ok) {
        setError((data.error as string) ?? 'Scan failed')
        return
      }
      const r = data as unknown as ScanResult
      setResult(r)
      showToast(`Imported ${r.holdings_count} holdings`, 'success')
      onUploaded()
    } catch {
      setError('Network error')
    } finally {
      setScanning(false)
    }
  }

  const BTN: React.CSSProperties = {
    padding: '0.5rem 1.25rem', borderRadius: 6, border: 'none', cursor: 'pointer',
    fontSize: '0.85rem', fontWeight: 600, background: DARK.orange, color: '#fff',
  }
  const BTN_DIS: React.CSSProperties = { ...BTN, opacity: 0.4, cursor: 'default' }

  return (
    <div style={{ padding: '2rem 1.5rem', textAlign: 'center', color: DARK.pale }}>
      <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📷</div>
      <div style={{ fontWeight: 600, fontSize: '1.1rem', marginBottom: 6 }}>
        Upload Syfe Screenshots
      </div>
      <div style={{ color: DARK.mid, fontSize: '0.85rem', marginBottom: 20, lineHeight: 1.6 }}>
        Drop screenshots here or tap to browse · JPG · PNG · WebP
      </div>

      <div
        onClick={() => fileRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); handleFiles(e.dataTransfer.files) }}
        style={{
          border: `2px dashed ${drag ? DARK.orange : DARK.border}`,
          borderRadius: 10, padding: '2rem', cursor: 'pointer', marginBottom: 16,
          background: drag ? 'rgba(232,82,10,0.05)' : 'transparent',
        }}
      >
        <div style={{ color: drag ? DARK.orange : DARK.mid, fontSize: '0.9rem' }}>
          {files.length > 0
            ? `${files.length} screenshot${files.length > 1 ? 's' : ''} selected`
            : 'Drop screenshots here, or click to browse'}
        </div>
        {files.length > 0 && (
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 12, flexWrap: 'wrap' }}>
            {files.map((f, i) => (
              <div key={i} style={{
                fontSize: '0.72rem', color: DARK.mid,
                background: DARK.inset, borderRadius: 4, padding: '2px 8px',
              }}>{f.name}</div>
            ))}
          </div>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        style={{ display: 'none' }}
        onChange={e => { if (e.target.files) handleFiles(e.target.files) }}
      />

      {scanning && (
        <div style={{ color: DARK.mid, fontSize: '0.9rem', marginBottom: 12 }}>
          Scanning {files.length} screenshot{files.length > 1 ? 's' : ''}… processing with OCR
        </div>
      )}

      {error && (
        <div style={{ color: DARK.red, fontSize: '0.85rem', marginBottom: 12 }}>{error}</div>
      )}

      {result && !scanning && (
        <div style={{ color: DARK.green, fontSize: '0.9rem', marginBottom: 12 }}>
          Detected: {result.holdings_count} holding{result.holdings_count !== 1 ? 's' : ''}
          {result.transactions_count > 0 ? `, ${result.transactions_count} transactions` : ''}
          {result.updated ? ' (snapshot updated)' : ' (new snapshot)'}
        </div>
      )}

      <button
        style={files.length === 0 || scanning ? BTN_DIS : BTN}
        disabled={files.length === 0 || scanning}
        onClick={handleScan}
      >
        {scanning ? 'Scanning…' : `Scan ${files.length > 0 ? files.length : ''} screenshots`.trim()}
      </button>
    </div>
  )
}
