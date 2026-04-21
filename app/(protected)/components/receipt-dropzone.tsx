'use client'

import { useState, useRef } from 'react'
import { useToast } from './toast'

type FileStatus = 'waiting' | 'uploading' | 'done' | 'error'
interface FileItem {
  id: string
  file: File
  status: FileStatus
  previewUrl: string
  error?: string
}

function getStoredAccountId(): string {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem('wmm_last_account') ?? ''
}

export function ReceiptDropzone({ collapsed = false, onToggle }: { collapsed?: boolean; onToggle?: () => void } = {}) {
  const { showToast } = useToast()
  const [files, setFiles] = useState<FileItem[]>([])
  const [merchantLookup, setMerchantLookup] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function addFiles(newFiles: File[]) {
    const imageFiles = newFiles.filter((f) => f.type.startsWith('image/'))
    const remaining = 10 - files.filter((f) => f.status !== 'error').length
    const toAdd = imageFiles.slice(0, remaining)
    const items: FileItem[] = toAdd.map((f) => ({
      id: crypto.randomUUID(),
      file: f,
      status: 'waiting',
      previewUrl: URL.createObjectURL(f),
    }))
    setFiles((prev) => [...prev, ...items])
  }

  function removeFile(id: string) {
    setFiles((prev) => {
      const item = prev.find((f) => f.id === id)
      if (item) URL.revokeObjectURL(item.previewUrl)
      return prev.filter((f) => f.id !== id)
    })
  }

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve((reader.result as string).split(',')[1])
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  async function processFiles() {
    const pending = files.filter((f) => f.status === 'waiting')
    if (pending.length === 0) return
    setUploading(true)
    const accountId = getStoredAccountId()
    for (const item of pending) {
      setFiles((prev) => prev.map((f) => (f.id === item.id ? { ...f, status: 'uploading' } : f)))
      try {
        const imageBase64 = await fileToBase64(item.file)
        const res = await fetch('/api/receipts/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64, mediaType: item.file.type, merchantLookup, accountId }),
        })
        let data: { draft?: { account_id?: string } | null; date_extracted?: boolean; error?: string } | null = null
        try {
          data = await res.json()
        } catch {
          // Server returned a non-JSON body (HTML error page, empty body, etc.)
        }
        if (res.ok && data?.draft) {
          const msg = data.date_extracted === false
            ? 'Draft created — date not found, please set it manually'
            : 'Draft created'
          setFiles((prev) => prev.map((f) => (f.id === item.id ? { ...f, status: 'done', error: msg } : f)))
          if (data.draft.account_id) localStorage.setItem('wmm_last_account', data.draft.account_id)
          window.dispatchEvent(new CustomEvent('drafts-updated'))
        } else {
          setFiles((prev) =>
            prev.map((f) =>
              f.id === item.id ? { ...f, status: 'error', error: data?.error ?? 'Processing failed' } : f
            )
          )
        }
      } catch {
        setFiles((prev) =>
          prev.map((f) => (f.id === item.id ? { ...f, status: 'error', error: 'Network error' } : f))
        )
      }
    }
    setUploading(false)
  }

  const hasPending = files.some((f) => f.status === 'waiting')
  const allDone = files.length > 0 && files.every((f) => f.status === 'done')
  const pendingCount = files.filter((f) => f.status === 'waiting').length

  return (
    <section style={{ marginBottom: '2rem' }}>
      <div
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: collapsed ? '1rem 1.5rem' : '1.5rem',
          cursor: onToggle ? 'pointer' : undefined,
        }}
        onClick={collapsed ? onToggle : undefined}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: collapsed ? 0 : '1rem',
            flexWrap: 'wrap',
            gap: '8px',
          }}
        >
          <h2 style={{ color: collapsed ? 'var(--text-muted)' : 'var(--text)', fontSize: '15px', fontWeight: 600, margin: 0 }}>
            Upload Receipts
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {!collapsed && (
              <label
                style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', userSelect: 'none' }}
                onClick={e => e.stopPropagation()}
              >
                <input
                  type="checkbox"
                  checked={merchantLookup}
                  onChange={(e) => setMerchantLookup(e.target.checked)}
                  style={{ accentColor: '#CC5500', width: '14px', height: '14px' }}
                />
                <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                  Merchant lookup
                  {merchantLookup && <span style={{ color: 'var(--accent)' }}> (adds ~5s)</span>}
                </span>
              </label>
            )}
            {onToggle && (
              <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                {collapsed ? '▼' : '▲'}
              </span>
            )}
          </div>
        </div>

        {!collapsed && <>

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(Array.from(e.dataTransfer.files)) }}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter') fileInputRef.current?.click() }}
          style={{
            border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border)'}`,
            borderRadius: '10px',
            padding: '2rem 1rem',
            textAlign: 'center',
            cursor: 'pointer',
            background: dragOver ? 'rgba(204,85,0,0.05)' : 'transparent',
            transition: 'all 0.15s',
            minHeight: '120px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            marginBottom: files.length > 0 ? '1rem' : '1rem',
          }}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke={dragOver ? 'var(--accent)' : 'var(--text-muted)'}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
            {files.length === 0
              ? 'Drop receipt photos here or tap to browse'
              : `${files.length}/10 receipts added`}
          </span>
          <span style={{ color: 'var(--text-dim)', fontSize: '11px' }}>
            JPEG · PNG · HEIC · Max 5 MB each
          </span>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => {
              if (e.target.files) addFiles(Array.from(e.target.files))
              e.target.value = ''
            }}
            style={{ display: 'none' }}
          />
        </div>

        {/* File list */}
        {files.length > 0 && (
          <div
            style={{ marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '6px' }}
          >
            {files.map((item) => (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  background: 'var(--bg-subtle)',
                  borderRadius: '8px',
                  padding: '8px 12px',
                  border: '1px solid var(--border)',
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.previewUrl}
                  alt=""
                  style={{
                    width: '36px',
                    height: '36px',
                    objectFit: 'cover',
                    borderRadius: '4px',
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    flex: 1,
                    color: 'var(--text)',
                    fontSize: '12px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {item.file.name}
                </span>
                {item.status === 'waiting' && (
                  <span style={{ color: 'var(--text-dim)', fontSize: '11px', flexShrink: 0 }}>Waiting</span>
                )}
                {item.status === 'uploading' && (
                  <svg
                    style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }}
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle cx="12" cy="12" r="10" stroke="#CC5500" strokeWidth="3" opacity="0.25" />
                    <path
                      d="M12 2a10 10 0 0110 10"
                      stroke="#CC5500"
                      strokeWidth="3"
                      strokeLinecap="round"
                    />
                  </svg>
                )}
                {item.status === 'done' && (
                  <span style={{ color: item.error?.includes('date not found') ? '#f0b429' : '#3fb884', fontSize: '11px', flexShrink: 0 }}>
                    ✓ {item.error ?? 'Draft created'}
                  </span>
                )}
                {item.status === 'error' && (
                  <span style={{ color: '#f85149', fontSize: '11px', flexShrink: 0 }}>
                    {item.error ?? 'Failed'}
                  </span>
                )}
                {(item.status === 'waiting' || item.status === 'error') && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); removeFile(item.id) }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-dim)',
                      cursor: 'pointer',
                      padding: '2px 4px',
                      flexShrink: 0,
                      fontSize: '16px',
                      lineHeight: 1,
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Process button */}
        {files.length > 0 && (
          <button
            type="button"
            onClick={processFiles}
            disabled={!hasPending || uploading}
            style={{
              width: '100%',
              padding: '13px',
              borderRadius: '8px',
              border: 'none',
              fontSize: '14px',
              fontWeight: 600,
              cursor: hasPending && !uploading ? 'pointer' : 'not-allowed',
              background: hasPending && !uploading ? 'var(--accent)' : 'var(--bg-dim)',
              color: hasPending && !uploading ? '#fff' : 'var(--text-dim)',
              transition: 'all 0.15s',
              minHeight: '48px',
            }}
          >
            {uploading
              ? 'Processing...'
              : allDone
              ? 'All processed ✓'
              : `Process ${pendingCount} receipt${pendingCount !== 1 ? 's' : ''}`}
          </button>
        )}
        </>}
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </section>
  )
}
