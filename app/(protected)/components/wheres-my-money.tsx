'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useToast } from './toast'
import type { Account, Tag, TxType } from '@/lib/types'
import { PAYMENT_METHOD_TO_ACCOUNT_TYPE } from '@/lib/account-types'
import { parseBlessThis } from '@/lib/parse-bless-this'
import { PaymentTypePicker } from './payment-type-picker'
import { CategoryPicker } from './category-picker'
import { filterVisibleTags } from './tag-selector'

const CURRENCIES = ['SGD', 'USD', 'EUR', 'GBP', 'JPY', 'MYR', 'IDR', 'THB', 'AUD', 'HKD']

function sgtNow() {
  const sgt = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Singapore' }))
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${sgt.getFullYear()}-${pad(sgt.getMonth() + 1)}-${pad(sgt.getDate())}T${pad(sgt.getHours())}:${pad(sgt.getMinutes())}`
}

function toISOWithSGTOffset(localDatetime: string): string {
  const [datePart, timePart] = localDatetime.split('T')
  return `${datePart}T${timePart}:00+08:00`
}

const inputStyle: React.CSSProperties = {
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  color: 'var(--text)',
  padding: '8px 12px',
  fontSize: '14px',
  width: '100%',
  outline: 'none',
  boxSizing: 'border-box',
}

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
}

export function WheresMyMoney({ collapsed = false, onToggle }: { collapsed?: boolean; onToggle?: () => void } = {}) {
  const { showToast } = useToast()

  const [type, setType] = useState<TxType>('expense')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState('SGD')
  const [fxRate, setFxRate] = useState('')
  const [fxDate, setFxDate] = useState('')
  const [paymentTypeFilter, setPaymentTypeFilter] = useState<import('@/lib/types').AccountType | ''>('')
  const [accountId, setAccountId] = useState('')
  const [toAccountId, setToAccountId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [payee, setPayee] = useState('')
  const [note, setNote] = useState('')
  const [datetime, setDatetime] = useState(sgtNow)
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const [tagSearch, setTagSearch] = useState('')
  const [showNoteField, setShowNoteField] = useState(false)
  const [saving, setSaving] = useState(false)
  const [parentCategoryId, setParentCategoryId] = useState('')

  const [accounts, setAccounts] = useState<Account[]>([])
  const [categories, setCategories] = useState<import('@/lib/types').Category[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [payees, setPayees] = useState<string[]>([])

  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [pasteApplied, setPasteApplied] = useState(false)

  const [listening, setListening] = useState(false)
  const [voiceError, setVoiceError] = useState<string | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)

  const amountRef = useRef<HTMLInputElement>(null)
  const tagDropdownRef = useRef<HTMLDivElement>(null)
  const pasteRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/accounts').then((r) => r.json()),
      fetch('/api/categories').then((r) => r.json()),
      fetch('/api/tags').then((r) => r.json()),
      fetch('/api/transactions/payees').then((r) => r.json()),
    ]).then(([accts, cats, tgs, pvs]) => {
      setAccounts(accts)
      setCategories(cats)
      setTags(tgs)
      setPayees(pvs)
      const saved = localStorage.getItem('wmm_last_account')
      const activeAccts = (accts as Account[]).filter((a) => a.is_active === 1)
      if (saved && activeAccts.find((a) => a.id === saved)) {
        setAccountId(saved)
      } else if (activeAccts.length > 0) {
        setAccountId(activeAccts[0].id)
      }
    })
  }, [])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (tagDropdownRef.current && !tagDropdownRef.current.contains(e.target as Node)) {
        setTagSearch('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const activeAccounts = accounts.filter((a) => a.is_active === 1)

  // BUG-029: exclude tags whose names match any category name
  const visibleTagsList = filterVisibleTags(tags, categories)
  const filteredTagSuggestions = visibleTagsList.filter(
    (t) =>
      t.name.toLowerCase().includes(tagSearch.toLowerCase()) &&
      !selectedTagIds.includes(t.id)
  )

  function toggleTag(id: string) {
    setSelectedTagIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  async function createAndAddTag(name: string) {
    try {
      const res = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (res.ok) {
        const newTag: Tag = await res.json()
        setTags((prev) => [...prev, newTag].sort((a, b) => a.name.localeCompare(b.name)))
        setSelectedTagIds((prev) => [...prev, newTag.id])
        setTagSearch('')
      }
    } catch {
      showToast('Failed to create tag', 'error')
    }
  }

  const applyPasteData = useCallback(async (text: string) => {
    const data = parseBlessThis(text)
    if (!data.amount && !data.payee && !data.category) {
      showToast('Could not parse any fields - check the format', 'error')
      return
    }

    if (data.type) setType(data.type)
    if (data.amount) setAmount(String(data.amount))
    if (data.currency) setCurrency(data.currency)
    if (data.payee) setPayee(data.payee)
    if (data.notes) { setNote(data.notes); setShowNoteField(true) }

    if (data.date || data.time) {
      const currentDt = sgtNow()
      const datePart = data.date ?? currentDt.split('T')[0]
      const timePart = data.time ?? currentDt.split('T')[1]
      setDatetime(`${datePart}T${timePart}`)
    }

    // Category: match by name; set both parent and child for two-step picker
    if (data.category) {
      const match = categories.find(
        (c) => c.name.toLowerCase() === data.category!.toLowerCase()
      )
      if (match) {
        if (match.parent_id) {
          setParentCategoryId(match.parent_id)
          setCategoryId(match.id)
        } else {
          setParentCategoryId(match.id)
          const hasChildren = categories.some((c) => c.parent_id === match.id)
          if (!hasChildren) setCategoryId(match.id)
        }
      }
    }

    // Account: match by name → also set payment type filter from account type
    let accountMatched = false
    if (data.account) {
      const match = accounts.find(
        (a) => a.name.toLowerCase() === data.account!.toLowerCase() && a.is_active === 1
      )
      if (match) {
        setAccountId(match.id)
        setPaymentTypeFilter(match.type)
        accountMatched = true
      }
    }
    // No account match: infer payment type filter from Claude's payment_method guess
    if (!accountMatched && data.payment_method) {
      const typeFilter = PAYMENT_METHOD_TO_ACCOUNT_TYPE[data.payment_method.toLowerCase()]
      if (typeFilter) setPaymentTypeFilter(typeFilter)
    }

    // Tags: match existing or create new
    if (data.tags && data.tags.length > 0) {
      const resolvedIds: string[] = []
      for (const tagName of data.tags) {
        const existing = tags.find((t) => t.name.toLowerCase() === tagName.toLowerCase())
        if (existing) {
          resolvedIds.push(existing.id)
        } else {
          try {
            const res = await fetch('/api/tags', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: tagName }),
            })
            if (res.ok) {
              const newTag: Tag = await res.json()
              setTags((prev) => [...prev, newTag].sort((a, b) => a.name.localeCompare(b.name)))
              resolvedIds.push(newTag.id)
            }
          } catch { /* skip */ }
        }
      }
      if (resolvedIds.length > 0) setSelectedTagIds(resolvedIds)
    }

    setPasteApplied(true)
    setPasteOpen(false)
    setPasteText('')
    showToast('Form pre-filled from receipt - review and save', 'success')
    setTimeout(() => amountRef.current?.focus(), 100)
    setTimeout(() => setPasteApplied(false), 4000)
  }, [accounts, categories, tags, showToast])

  function startVoice() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = typeof window !== 'undefined' ? (window as any) : null
    const SR = w?.SpeechRecognition || w?.webkitSpeechRecognition

    if (!SR) {
      setVoiceError('Voice input is not supported in your browser. Try Chrome on Android or Safari on iOS.')
      return
    }

    if (listening) {
      recognitionRef.current?.stop()
      return
    }

    setVoiceError(null)
    const recognition = new SR()
    recognitionRef.current = recognition
    recognition.lang = 'en-US'
    recognition.interimResults = false
    recognition.maxAlternatives = 1

    recognition.onstart = () => setListening(true)
    recognition.onend = () => setListening(false)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onerror = (e: any) => {
      setListening(false)
      if (e.error === 'not-allowed') {
        setVoiceError('Microphone permission denied. Allow microphone access in your browser settings and try again.')
      } else if (e.error === 'no-speech') {
        setVoiceError('No speech detected. Tap the mic and speak clearly.')
      } else {
        setVoiceError(`Voice input error: ${e.error}`)
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript
      applyPasteData(transcript)
    }

    recognition.start()
  }

  function reset() {
    setAmount('')
    setCurrency('SGD')
    setFxRate('')
    setFxDate('')
    setCategoryId('')
    setParentCategoryId('')
    setPayee('')
    setNote('')
    setPaymentTypeFilter('')
    setDatetime(sgtNow())
    setSelectedTagIds([])
    setTagSearch('')
    setShowNoteField(false)
    setPasteApplied(false)
    setTimeout(() => amountRef.current?.focus(), 50)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!amount || !accountId) return
    setSaving(true)

    const amountNum = parseFloat(amount)
    const selectedAccount = accounts.find((a) => a.id === accountId)
    const derivedPaymentMethod = selectedAccount?.type ?? null

    const payload: Record<string, unknown> = {
      type,
      amount: amountNum,
      currency,
      account_id: accountId,
      datetime: toISOWithSGTOffset(datetime),
      tag_ids: selectedTagIds,
    }

    if (type === 'transfer') payload.to_account_id = toAccountId
    if (type !== 'transfer' && categoryId) payload.category_id = categoryId
    if (payee) payload.payee = payee
    if (note) payload.note = note
    if (derivedPaymentMethod) payload.payment_method = derivedPaymentMethod
    if (currency !== 'SGD') {
      if (fxRate) payload.fx_rate = parseFloat(fxRate)
      if (fxDate) payload.fx_date = fxDate
      if (fxRate) payload.sgd_equivalent = amountNum * parseFloat(fxRate)
    }

    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        localStorage.setItem('wmm_last_account', accountId)
        showToast('Transaction saved', 'success')
        reset()
        window.dispatchEvent(new Event('transaction-saved'))
      } else {
        const data = await res.json()
        showToast(data.error ?? 'Failed to save', 'error')
      }
    } catch {
      showToast('Network error - please try again', 'error')
    } finally {
      setSaving(false)
    }
  }

  function txTypeColor(t: TxType) {
    if (t === 'expense') return 'var(--red)'
    if (t === 'income') return 'var(--green)'
    return 'var(--text-muted)'
  }

  function txTypeBg(t: TxType) {
    if (t === 'expense') return 'var(--red-muted)'
    if (t === 'income') return 'var(--green-muted)'
    return 'rgba(139,148,158,0.15)'
  }

  function pillBtn(active: boolean, t: TxType): React.CSSProperties {
    return {
      padding: '6px 16px',
      borderRadius: '20px',
      fontSize: '13px',
      fontWeight: 500,
      cursor: 'pointer',
      border: active ? `1px solid ${txTypeColor(t)}` : '1px solid var(--border)',
      background: active ? txTypeBg(t) : 'transparent',
      color: active ? txTypeColor(t) : 'var(--text-muted)',
      transition: 'all 0.15s',
    }
  }

  const canSubmit = !saving && !!amount && !!accountId && (type !== 'transfer' || !!toAccountId)

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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: collapsed ? 0 : pasteOpen ? '1rem' : voiceError ? '0.75rem' : '1.25rem' }}>
          <h2 style={{ color: collapsed ? 'var(--text-muted)' : 'var(--text)', fontSize: '15px', fontWeight: 600, margin: 0 }}>
            Where's My Money
          </h2>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {onToggle && (
              <span style={{ color: 'var(--text-muted)', fontSize: '12px', marginRight: '4px' }}>
                {collapsed ? '▼' : '▲'}
              </span>
            )}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); startVoice() }}
              aria-label={listening ? 'Stop listening' : 'Tap mic to log an expense by voice'}
              style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border)',
                background: listening ? 'var(--accent-faint)' : 'transparent',
                color: listening ? 'var(--accent)' : 'var(--text-muted)',
                fontSize: '13px', fontWeight: 500, cursor: 'pointer',
                minHeight: '36px',
                animation: listening ? 'micPulse 1.2s ease-in-out infinite' : 'none',
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                <line x1="12" y1="19" x2="12" y2="23"/>
                <line x1="8" y1="23" x2="16" y2="23"/>
              </svg>
              {listening ? 'Listening…' : 'Voice'}
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setPasteOpen(v => !v); setPasteText(''); if (!pasteOpen) setTimeout(() => pasteRef.current?.focus(), 80) }}
              style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border)',
                background: pasteOpen ? 'var(--accent-faint)' : 'transparent',
                color: pasteOpen ? 'var(--accent)' : 'var(--text-muted)',
                fontSize: '13px', fontWeight: 500, cursor: 'pointer',
                minHeight: '36px',
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="2" width="10" height="4" rx="1"/>
                <path d="M4 6h16v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6z"/>
              </svg>
              {pasteOpen ? 'Cancel' : 'Paste Receipt'}
            </button>
          </div>
        </div>

        {!collapsed && <>

        {/* Voice error banner */}
        {voiceError && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
            background: 'var(--red-faint)', border: '1px solid var(--red-muted)',
            borderRadius: '8px', padding: '8px 12px', marginBottom: '1rem',
            fontSize: '13px', color: 'var(--red)',
          }}>
            <span>{voiceError}</span>
            <button
              type="button"
              onClick={() => setVoiceError(null)}
              style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', padding: 0, fontSize: '16px', lineHeight: 1, flexShrink: 0 }}
              aria-label="Dismiss voice error"
            >×</button>
          </div>
        )}

        {/* Paste panel */}
        {pasteOpen && (
          <div style={{
            background: 'var(--bg)', border: '1px solid var(--accent-muted)',
            borderRadius: '10px', padding: '1rem', marginBottom: '1.25rem',
          }}>
            <textarea
              ref={pasteRef}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              onPaste={(e) => {
                const pasted = e.clipboardData.getData('text')
                if (pasted) setTimeout(() => applyPasteData(pasted), 300)
              }}
              placeholder={'Paste the "bless this" output here...\n\nAmount: 23.50\nCurrency: SGD\nMerchant/Payee: NTUC FairPrice\n...'}
              rows={6}
              style={{
                ...inputStyle,
                resize: 'none',
                fontFamily: 'monospace',
                fontSize: '13px',
                lineHeight: 1.6,
                marginBottom: '0.75rem',
              }}
            />
            <button
              type="button"
              onClick={() => applyPasteData(pasteText)}
              disabled={!pasteText.trim()}
              style={{
                width: '100%', padding: '10px', borderRadius: '8px', border: 'none',
                fontSize: '14px', fontWeight: 600, cursor: pasteText.trim() ? 'pointer' : 'not-allowed',
                background: pasteText.trim() ? 'var(--accent)' : 'var(--bg-dim)',
                color: pasteText.trim() ? 'var(--bg)' : 'var(--text-dim)',
              }}
            >
              Fill Form
            </button>
          </div>
        )}

        {/* Pre-filled indicator */}
        {pasteApplied && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            background: 'rgba(63,184,132,0.1)', border: '1px solid rgba(63,184,132,0.25)',
            borderRadius: '8px', padding: '8px 12px', marginBottom: '1rem',
            fontSize: '13px', color: 'var(--green)',
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            Pre-filled from receipt - review and save
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Type toggle */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '1rem', flexWrap: 'wrap' }}>
            {(['expense', 'income', 'transfer'] as TxType[]).map((t) => (
              <button key={t} type="button" onClick={() => setType(t)} style={pillBtn(type === t, t)}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          {/* Payment type filter pills + account select */}
          <div style={{ marginBottom: '12px' }}>
            <PaymentTypePicker
              accounts={activeAccounts}
              filterValue={paymentTypeFilter}
              accountId={accountId}
              onFilterChange={setPaymentTypeFilter}
              onAccountChange={setAccountId}
              selectStyle={selectStyle}
              accountSelectRequired
              pillsContainerStyle={{ marginBottom: '10px' }}
            />
          </div>

          {/* To Account (transfer only) */}
          {type === 'transfer' && (
            <div style={{ marginBottom: '12px' }}>
              <select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)} required style={selectStyle}>
                <option value="">To Account</option>
                {activeAccounts.filter((a) => a.id !== accountId).map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Amount + Currency */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', alignItems: 'center' }}>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px' }}>
              {type !== 'transfer' && (
                <span style={{
                  fontSize: '22px', fontWeight: 700, color: txTypeColor(type),
                  lineHeight: 1, flexShrink: 0, width: '16px', textAlign: 'center',
                }}>
                  {type === 'income' ? '+' : '−'}
                </span>
              )}
              <input
                ref={amountRef}
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                autoFocus
                style={{
                  ...inputStyle,
                  fontSize: '24px',
                  fontWeight: 600,
                  padding: '10px 14px',
                  letterSpacing: '-0.5px',
                  flex: 1,
                }}
              />
            </div>
            <div style={{ width: '100px' }}>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} style={selectStyle}>
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* FX fields */}
          {currency !== 'SGD' && (
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <input
                  type="number" step="0.0001" placeholder="FX Rate"
                  value={fxRate} onChange={(e) => setFxRate(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div style={{ flex: 1 }}>
                <input
                  type="date" placeholder="FX Date"
                  value={fxDate} onChange={(e) => setFxDate(e.target.value)}
                  style={inputStyle}
                />
              </div>
              {fxRate && amount && (
                <span style={{ color: 'var(--text-muted)', fontSize: '13px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  = SGD {(parseFloat(amount) * parseFloat(fxRate)).toFixed(2)}
                </span>
              )}
            </div>
          )}

          {/* Category — BUG-028: two-step parent → subcategory picker */}
          {type !== 'transfer' && (
            <div style={{ marginBottom: '12px' }}>
              <CategoryPicker
                categories={categories}
                txType={type}
                parentId={parentCategoryId}
                categoryId={categoryId}
                onParentChange={setParentCategoryId}
                onCategoryChange={setCategoryId}
                selectStyle={selectStyle}
              />
            </div>
          )}

          {/* Payee */}
          <div style={{ marginBottom: '12px' }}>
            <input
              type="text" placeholder="Payee (optional)" value={payee}
              onChange={(e) => setPayee(e.target.value)}
              list="wmm-payees" autoComplete="off"
              style={inputStyle}
            />
            <datalist id="wmm-payees">
              {payees.map((p) => <option key={p} value={p} />)}
            </datalist>
          </div>

          {/* DateTime */}
          <div style={{ marginBottom: '12px' }}>
            <input
              type="datetime-local" value={datetime}
              onChange={(e) => setDatetime(e.target.value)}
              style={inputStyle}
            />
          </div>

          {/* Note */}
          {!showNoteField ? (
            <button
              type="button"
              onClick={() => setShowNoteField(true)}
              style={{
                background: 'none', border: 'none', color: 'var(--text-muted)',
                fontSize: '13px', cursor: 'pointer', marginBottom: '12px', padding: 0,
              }}
            >
              + Add note
            </button>
          ) : (
            <div style={{ marginBottom: '12px' }}>
              <textarea
                placeholder="Note (optional)" value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2} autoFocus
                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
              />
            </div>
          )}

          {/* Tags */}
          <div style={{ marginBottom: '1.25rem' }}>
            {selectedTagIds.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                {selectedTagIds.map((tid) => {
                  const tag = tags.find((t) => t.id === tid)
                  if (!tag) return null
                  return (
                    <span
                      key={tid}
                      onClick={() => toggleTag(tid)}
                      style={{
                        background: 'var(--accent-faint)', border: '1px solid var(--accent-soft)',
                        borderRadius: '12px', padding: '2px 10px', fontSize: '12px',
                        color: 'var(--accent)', cursor: 'pointer', userSelect: 'none',
                      }}
                    >
                      {tag.name} ×
                    </span>
                  )
                })}
              </div>
            )}
            <div ref={tagDropdownRef} style={{ position: 'relative' }}>
              <input
                type="text" placeholder="Add tags..." value={tagSearch}
                onChange={(e) => setTagSearch(e.target.value)}
                style={inputStyle}
              />
              {tagSearch && (
                <div
                  style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                    background: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: '8px',
                    marginTop: '4px', maxHeight: '180px', overflowY: 'auto',
                  }}
                >
                  {filteredTagSuggestions.slice(0, 8).map((t) => (
                    <div
                      key={t.id}
                      onMouseDown={(e) => { e.preventDefault(); toggleTag(t.id); setTagSearch('') }}
                      style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '13px', color: 'var(--text)' }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--border)' }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                    >
                      {t.name}
                    </div>
                  ))}
                  {!filteredTagSuggestions.some((t) => t.name.toLowerCase() === tagSearch.toLowerCase()) && (
                    <div
                      onMouseDown={(e) => { e.preventDefault(); createAndAddTag(tagSearch) }}
                      style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '13px', color: 'var(--accent)' }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--border)' }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                    >
                      + Create "{tagSearch}"
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={!canSubmit}
            style={{
              width: '100%',
              padding: '10px',
              borderRadius: '8px',
              border: 'none',
              fontSize: '14px',
              fontWeight: 600,
              cursor: canSubmit ? 'pointer' : 'not-allowed',
              background: canSubmit ? 'var(--accent)' : 'var(--bg-dim)',
              color: canSubmit ? 'var(--bg)' : 'var(--text-dim)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.15s',
            }}
          >
            {saving ? (
              <>
                <svg style={{ animation: 'spin 1s linear infinite' }} width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25"/>
                  <path d="M12 2a10 10 0 0110 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
                </svg>
                Saving...
              </>
            ) : 'Save transaction'}
          </button>
        </form>
        </>}
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes micPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        input[type="number"]::-webkit-outer-spin-button,
        input[type="number"]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        input[type="number"] { -moz-appearance: textfield; }
        input::placeholder, textarea::placeholder { color: var(--text-dim); }
        select option { background: var(--bg-card); color: var(--text); }
        input[type="datetime-local"]::-webkit-calendar-picker-indicator { filter: invert(0.5); cursor: pointer; }
        input[type="date"]::-webkit-calendar-picker-indicator { filter: invert(0.5); cursor: pointer; }
      `}</style>
    </section>
  )
}
