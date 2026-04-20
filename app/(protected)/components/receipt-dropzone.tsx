'use client'

import { useState, useRef, useCallback } from 'react'
import { useToast } from './toast'

type FileStatus = 'waiting' | 'uploading' | 'done' | 'error'
type VoiceStatus = 'idle' | 'recording' | 'processing' | 'done' | 'error'

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

export function ReceiptDropzone() {
  const { showToast } = useToast()
  const [files, setFiles] = useState<FileItem[]>([])
  const [merchantLookup, setMerchantLookup] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>('idle')
  const [voiceTranscript, setVoiceTranscript] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)

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
        let data: { draft?: unknown; error?: string } | null = null
        try {
          data = await res.json()
        } catch {
          // Server returned a non-JSON body (HTML error page, empty body, etc.)
        }
        if (res.ok && data?.draft) {
          setFiles((prev) => prev.map((f) => (f.id === item.id ? { ...f, status: 'done' } : f)))
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

  const processVoice = useCallback(
    async (text: string) => {
      setVoiceStatus('processing')
      const accountId = getStoredAccountId()
      try {
        const res = await fetch('/api/receipts/voice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, accountId }),
        })
        const data = await res.json()
        if (res.ok && data.draft) {
          setVoiceStatus('done')
          window.dispatchEvent(new CustomEvent('drafts-updated'))
          showToast('Voice entry captured as draft', 'success')
          setTimeout(() => {
            setVoiceStatus('idle')
            setVoiceTranscript('')
          }, 2000)
        } else {
          setVoiceStatus('error')
          showToast(data.error ?? 'Processing failed', 'error')
          setTimeout(() => setVoiceStatus('idle'), 2000)
        }
      } catch {
        setVoiceStatus('error')
        showToast('Network error', 'error')
        setTimeout(() => setVoiceStatus('idle'), 2000)
      }
    },
    [showToast]
  )

  function startRecording() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition
    if (!SR) {
      showToast('Voice input not supported in this browser', 'error')
      return
    }
    const recognition = new SR()
    recognition.lang = 'en-SG'
    recognition.interimResults = false
    recognition.maxAlternatives = 1
    let finalTranscript = ''

    recognition.onstart = () => setVoiceStatus('recording')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (e: any) => {
      finalTranscript = e.results[0][0].transcript
      setVoiceTranscript(finalTranscript)
    }
    recognition.onend = () => {
      if (finalTranscript) {
        processVoice(finalTranscript)
      } else {
        setVoiceStatus('idle')
      }
    }
    recognition.onerror = () => {
      setVoiceStatus('error')
      setTimeout(() => setVoiceStatus('idle'), 2000)
    }
    recognitionRef.current = recognition
    recognition.start()
  }

  function stopRecording() {
    recognitionRef.current?.stop()
  }

  const hasPending = files.some((f) => f.status === 'waiting')
  const allDone = files.length > 0 && files.every((f) => f.status === 'done')
  const pendingCount = files.filter((f) => f.status === 'waiting').length

  const voiceBorderColor =
    voiceStatus === 'recording' ? '#f85149' : voiceStatus === 'done' ? '#3fb884' : '#30363d'
  const voiceBg =
    voiceStatus === 'recording' ? 'rgba(248,81,73,0.15)' : 'transparent'
  const voiceColor =
    voiceStatus === 'recording' ? '#f85149' : voiceStatus === 'done' ? '#3fb884' : '#8b949e'

  return (
    <section style={{ marginBottom: '2rem' }}>
      <div
        style={{
          background: '#161b22',
          border: '1px solid #30363d',
          borderRadius: '12px',
          padding: '1.5rem',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '1rem',
            flexWrap: 'wrap',
            gap: '8px',
          }}
        >
          <h2 style={{ color: '#e6edf3', fontSize: '15px', fontWeight: 600, margin: 0 }}>
            Upload Receipts
          </h2>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            <input
              type="checkbox"
              checked={merchantLookup}
              onChange={(e) => setMerchantLookup(e.target.checked)}
              style={{ accentColor: '#CC5500', width: '14px', height: '14px' }}
            />
            <span style={{ color: '#8b949e', fontSize: '12px' }}>
              Merchant lookup
              {merchantLookup && <span style={{ color: '#CC5500' }}> (adds ~5s)</span>}
            </span>
          </label>
        </div>

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
            border: `2px dashed ${dragOver ? '#CC5500' : '#30363d'}`,
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
            stroke={dragOver ? '#CC5500' : '#8b949e'}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <span style={{ color: '#8b949e', fontSize: '13px' }}>
            {files.length === 0
              ? 'Drop receipt photos here or tap to browse'
              : `${files.length}/10 receipts added`}
          </span>
          <span style={{ color: '#484f58', fontSize: '11px' }}>
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
                  background: '#0d1117',
                  borderRadius: '8px',
                  padding: '8px 12px',
                  border: '1px solid #21262d',
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
                    color: '#e6edf3',
                    fontSize: '12px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {item.file.name}
                </span>
                {item.status === 'waiting' && (
                  <span style={{ color: '#484f58', fontSize: '11px', flexShrink: 0 }}>Waiting</span>
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
                  <span style={{ color: '#3fb884', fontSize: '11px', flexShrink: 0 }}>
                    ✓ Draft created
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
                      color: '#484f58',
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

        {/* Bottom action bar */}
        <div
          style={{
            display: 'flex',
            gap: '8px',
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          {/* Voice mic button — always visible */}
          <button
            type="button"
            onClick={voiceStatus === 'recording' ? stopRecording : startRecording}
            disabled={voiceStatus === 'processing' || uploading}
            title={
              voiceStatus === 'recording'
                ? 'Tap to stop recording'
                : 'Tap to log an expense by voice'
            }
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              border: `2px solid ${voiceBorderColor}`,
              background: voiceBg,
              color: voiceColor,
              cursor: voiceStatus === 'processing' || uploading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              transition: 'all 0.15s',
            }}
          >
            {voiceStatus === 'processing' ? (
              <svg
                style={{ animation: 'spin 1s linear infinite' }}
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
                <path
                  d="M12 2a10 10 0 0110 10"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              </svg>
            ) : (
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            )}
          </button>

          {/* Upload button — only when files added */}
          {files.length > 0 ? (
            <button
              type="button"
              onClick={processFiles}
              disabled={!hasPending || uploading}
              style={{
                flex: 1,
                padding: '13px',
                borderRadius: '8px',
                border: 'none',
                fontSize: '14px',
                fontWeight: 600,
                cursor: hasPending && !uploading ? 'pointer' : 'not-allowed',
                background: hasPending && !uploading ? '#CC5500' : '#21262d',
                color: hasPending && !uploading ? '#0d1117' : '#484f58',
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
          ) : (
            <span style={{ color: '#484f58', fontSize: '12px', flex: 1 }}>
              {voiceStatus === 'recording'
                ? '● Recording... tap mic to stop'
                : voiceStatus === 'processing'
                ? 'Processing voice input...'
                : 'Tap mic to log an expense by voice'}
            </span>
          )}
        </div>

        {/* Voice transcript preview */}
        {voiceTranscript && voiceStatus !== 'idle' && (
          <div
            style={{
              marginTop: '8px',
              padding: '8px 12px',
              background: '#0d1117',
              borderRadius: '6px',
              border: '1px solid #30363d',
            }}
          >
            <span style={{ color: '#8b949e', fontSize: '12px', fontStyle: 'italic' }}>
              &ldquo;{voiceTranscript}&rdquo;
            </span>
          </div>
        )}
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </section>
  )
}
