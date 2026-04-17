'use client'

import { useState, useEffect, useRef } from 'react'
import { useToast } from './toast'
import type { Account, Category, Tag, TxType } from '@/lib/types'

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
  background: '#0d1117',
  border: '1px solid #30363d',
  borderRadius: '8px',
  color: '#e6edf3',
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

export function WheresMyMoney() {
  const { showToast } = useToast()

  const [type, setType] = useState<TxType>('expense')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState('SGD')
  const [fxRate, setFxRate] = useState('')
  const [fxDate, setFxDate] = useState('')
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

  const [accounts, setAccounts] = useState<Account[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [payees, setPayees] = useState<string[]>([])

  const amountRef = useRef<HTMLInputElement>(null)
  const tagDropdownRef = useRef<HTMLDivElement>(null)

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
  const filteredCategories = categories.filter(
    (c) => c.type === (type === 'transfer' ? 'expense' : type)
  )
  const filteredTagSuggestions = tags.filter(
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

  function reset() {
    setAmount('')
    setCurrency('SGD')
    setFxRate('')
    setFxDate('')
    setCategoryId('')
    setPayee('')
    setNote('')
    setDatetime(sgtNow())
    setSelectedTagIds([])
    setTagSearch('')
    setShowNoteField(false)
    setTimeout(() => amountRef.current?.focus(), 50)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!amount || !accountId) return
    setSaving(true)

    const amountNum = parseFloat(amount)
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

  function pillBtn(active: boolean): React.CSSProperties {
    return {
      padding: '6px 16px',
      borderRadius: '20px',
      fontSize: '13px',
      fontWeight: 500,
      cursor: 'pointer',
      border: active ? '1px solid #f0b429' : '1px solid #30363d',
      background: active ? '#f0b42920' : 'transparent',
      color: active ? '#f0b429' : '#8b949e',
      transition: 'all 0.15s',
    }
  }

  const canSubmit = !saving && !!amount && !!accountId && (type !== 'transfer' || !!toAccountId)

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
        <h2 style={{ color: '#e6edf3', fontSize: '15px', fontWeight: 600, margin: '0 0 1.25rem' }}>
          Where's My Money
        </h2>

        <form onSubmit={handleSubmit}>
          {/* Type toggle */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
            {(['expense', 'income', 'transfer'] as TxType[]).map((t) => (
              <button key={t} type="button" onClick={() => setType(t)} style={pillBtn(type === t)}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          {/* Amount + Currency */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            <div style={{ flex: 1 }}>
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
                <span style={{ color: '#8b949e', fontSize: '13px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  = SGD {(parseFloat(amount) * parseFloat(fxRate)).toFixed(2)}
                </span>
              )}
            </div>
          )}

          {/* Account / To Account */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            <div style={{ flex: 1 }}>
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)} required style={selectStyle}>
                <option value="">Account</option>
                {activeAccounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
            {type === 'transfer' && (
              <div style={{ flex: 1 }}>
                <select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)} required style={selectStyle}>
                  <option value="">To Account</option>
                  {activeAccounts.filter((a) => a.id !== accountId).map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Category */}
          {type !== 'transfer' && (
            <div style={{ marginBottom: '12px' }}>
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} style={selectStyle}>
                <option value="">Category (optional)</option>
                {filteredCategories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
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

          {/* Tags */}
          <div style={{ marginBottom: '12px' }}>
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
                        background: '#f0b42920', border: '1px solid #f0b42960',
                        borderRadius: '12px', padding: '2px 10px', fontSize: '12px',
                        color: '#f0b429', cursor: 'pointer', userSelect: 'none',
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
                    background: '#1c2128', border: '1px solid #30363d', borderRadius: '8px',
                    marginTop: '4px', maxHeight: '180px', overflowY: 'auto',
                  }}
                >
                  {filteredTagSuggestions.slice(0, 8).map((t) => (
                    <div
                      key={t.id}
                      onMouseDown={(e) => { e.preventDefault(); toggleTag(t.id); setTagSearch('') }}
                      style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '13px', color: '#e6edf3' }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#30363d' }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                    >
                      {t.name}
                    </div>
                  ))}
                  {!filteredTagSuggestions.some((t) => t.name.toLowerCase() === tagSearch.toLowerCase()) && (
                    <div
                      onMouseDown={(e) => { e.preventDefault(); createAndAddTag(tagSearch) }}
                      style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '13px', color: '#f0b429' }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#30363d' }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                    >
                      + Create "{tagSearch}"
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Note */}
          {!showNoteField ? (
            <button
              type="button"
              onClick={() => setShowNoteField(true)}
              style={{
                background: 'none', border: 'none', color: '#8b949e',
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

          {/* DateTime */}
          <div style={{ marginBottom: '1.25rem' }}>
            <input
              type="datetime-local" value={datetime}
              onChange={(e) => setDatetime(e.target.value)}
              style={inputStyle}
            />
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
              background: canSubmit ? '#f0b429' : '#21262d',
              color: canSubmit ? '#0d1117' : '#484f58',
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
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        input[type="number"]::-webkit-outer-spin-button,
        input[type="number"]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        input[type="number"] { -moz-appearance: textfield; }
        input::placeholder, textarea::placeholder { color: #484f58; }
        select option { background: #161b22; color: #e6edf3; }
        input[type="datetime-local"]::-webkit-calendar-picker-indicator { filter: invert(0.5); cursor: pointer; }
        input[type="date"]::-webkit-calendar-picker-indicator { filter: invert(0.5); cursor: pointer; }
      `}</style>
    </section>
  )
}
