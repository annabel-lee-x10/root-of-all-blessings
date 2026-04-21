'use client'

import { useState, useEffect, useCallback } from 'react'
import type { TransactionRow, Account, Category, Tag, TxType } from '@/lib/types'
import { useToast } from './toast'

interface EditForm {
  type: TxType
  amount: string
  currency: string
  account_id: string
  category_id: string
  payee: string
  note: string
  payment_method: string
  datetime: string
  tag_ids: string[]
}

const CURRENCIES = ['SGD', 'USD', 'EUR', 'GBP', 'JPY', 'MYR', 'IDR', 'THB', 'AUD', 'HKD']

const BTN: React.CSSProperties = {
  border: 'none', borderRadius: '6px', cursor: 'pointer',
  fontSize: '12px', fontWeight: 500, padding: '6px 12px',
}
const BTN_PRI: React.CSSProperties = { ...BTN, background: 'var(--accent)', color: '#fff' }
const BTN_SEC: React.CSSProperties = { ...BTN, background: 'var(--bg-dim)', color: 'var(--text)', border: '1px solid var(--border)' }
const BTN_DNG: React.CSSProperties = { ...BTN, background: 'transparent', color: 'var(--red)', border: '1px solid var(--red-muted)' }
const BTN_GRN: React.CSSProperties = { ...BTN, background: 'var(--green-faint)', color: 'var(--green)', border: '1px solid var(--green-muted)' }

const INPUT: React.CSSProperties = {
  background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px',
  color: 'var(--text)', fontSize: '13px', padding: '6px 10px', outline: 'none', width: '100%',
}
const SELECT: React.CSSProperties = { ...INPUT, cursor: 'pointer' }

function toInputDt(iso: string) {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

function fromInputDt(val: string) {
  return `${val}:00.000+08:00`
}

function txToForm(tx: TransactionRow): EditForm {
  return {
    type: tx.type,
    amount: String(tx.amount),
    currency: tx.currency,
    account_id: tx.account_id,
    category_id: tx.category_id ?? '',
    payee: tx.payee ?? '',
    note: tx.note ?? '',
    payment_method: tx.payment_method ?? '',
    datetime: toInputDt(tx.datetime),
    tag_ids: tx.tags.map((t) => t.id),
  }
}

export function DraftsCard() {
  const { showToast } = useToast()
  const [open, setOpen] = useState(false)
  const [drafts, setDrafts] = useState<TransactionRow[]>([])
  const [loading, setLoading] = useState(false)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [tags, setTags] = useState<Tag[]>([])

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<EditForm | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const [approvingAll, setApprovingAll] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const loadDrafts = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/transactions?status=draft&limit=100')
      const data = await res.json()
      setDrafts(data.data ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    Promise.all([
      fetch('/api/accounts').then((r) => r.json()),
      fetch('/api/categories').then((r) => r.json()),
      fetch('/api/tags').then((r) => r.json()),
    ]).then(([accts, cats, tgs]) => {
      setAccounts(accts)
      setCategories(cats)
      setTags(tgs)
    })
    loadDrafts()
  }, [loadDrafts])

  useEffect(() => {
    const handler = () => loadDrafts()
    window.addEventListener('drafts-updated', handler)
    return () => window.removeEventListener('drafts-updated', handler)
  }, [loadDrafts])

  function ef(key: keyof EditForm, value: string | string[]) {
    setEditForm((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  async function saveEdit(id: string) {
    if (!editForm) return
    setSavingId(id)
    try {
      const amt = parseFloat(editForm.amount)
      const body = {
        type: editForm.type,
        amount: amt,
        currency: editForm.currency,
        account_id: editForm.account_id,
        category_id: editForm.category_id || null,
        payee: editForm.payee || null,
        note: editForm.note || null,
        payment_method: editForm.payment_method || null,
        datetime: fromInputDt(editForm.datetime),
        tag_ids: editForm.tag_ids,
      }
      const res = await fetch(`/api/transactions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        showToast('Draft updated', 'success')
        setEditingId(null)
        setEditForm(null)
        loadDrafts()
      } else {
        showToast('Failed to save', 'error')
      }
    } finally {
      setSavingId(null)
    }
  }

  async function approveDraft(id: string) {
    setApprovingId(id)
    try {
      const res = await fetch(`/api/transactions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved' }),
      })
      if (res.ok) {
        showToast('Transaction approved', 'success')
        setDrafts((prev) => prev.filter((d) => d.id !== id))
        if (editingId === id) { setEditingId(null); setEditForm(null) }
        window.dispatchEvent(new Event('transaction-saved'))
      } else {
        showToast('Failed to approve', 'error')
      }
    } finally {
      setApprovingId(null)
    }
  }

  async function approveAll() {
    if (drafts.length === 0) return
    setApprovingAll(true)
    try {
      const results = await Promise.all(
        drafts.map((d) =>
          fetch(`/api/transactions/${d.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'approved' }),
          })
        )
      )
      const allOk = results.every((r) => r.ok)
      if (allOk) {
        showToast(`${drafts.length} transactions approved`, 'success')
        setDrafts([])
        setEditingId(null)
        setEditForm(null)
        window.dispatchEvent(new Event('transaction-saved'))
      } else {
        showToast('Some approvals failed — refresh to check', 'error')
        loadDrafts()
      }
    } finally {
      setApprovingAll(false)
    }
  }

  async function deleteDraft(id: string) {
    if (!confirm('Delete this draft?')) return
    setDeletingId(id)
    try {
      const res = await fetch(`/api/transactions/${id}`, { method: 'DELETE' })
      if (res.ok) {
        showToast('Draft deleted', 'success')
        setDrafts((prev) => prev.filter((d) => d.id !== id))
        if (editingId === id) { setEditingId(null); setEditForm(null) }
      } else {
        showToast('Failed to delete', 'error')
      }
    } finally {
      setDeletingId(null)
    }
  }

  const activeAccounts = accounts.filter((a) => a.is_active === 1)
  // BUG-029: exclude tags whose names match any category name (same guard as WheresMyMoney)
  const categoryNameSet = new Set(categories.map((c) => c.name.toLowerCase()))
  const visibleTags = tags.filter((t) => !categoryNameSet.has(t.name.toLowerCase()))

  return (
    <section style={{ marginBottom: '2rem' }}>
      <div
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          overflow: 'hidden',
        }}
      >
        {/* Collapsible header */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '1rem 1.5rem',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h2 style={{ color: 'var(--text)', fontSize: '15px', fontWeight: 600, margin: 0 }}>
              Drafts
            </h2>
            {drafts.length > 0 && (
              <span
                style={{
                  background: '#f0b42920',
                  border: '1px solid #f0b42960',
                  borderRadius: '12px',
                  padding: '1px 8px',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#f0b429',
                }}
              >
                {loading ? '…' : drafts.length}
              </span>
            )}
            {!open && drafts.length === 0 && !loading && (
              <span style={{ color: 'var(--text-dim)', fontSize: '12px' }}>No pending drafts</span>
            )}
          </div>
          <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{open ? '▲' : '▼'}</span>
        </button>

        {/* Expanded body */}
        {open && (
          <div style={{ borderTop: '1px solid var(--border)' }}>
            {/* Bulk approve bar */}
            {drafts.length > 1 && (
              <div
                style={{
                  padding: '10px 1.5rem',
                  borderBottom: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '8px',
                }}
              >
                <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                  {drafts.length} drafts pending review
                </span>
                <button
                  type="button"
                  onClick={approveAll}
                  disabled={approvingAll}
                  style={{ ...BTN_GRN, opacity: approvingAll ? 0.6 : 1 }}
                >
                  {approvingAll ? 'Approving...' : `Approve all ${drafts.length}`}
                </button>
              </div>
            )}

            {/* Empty state */}
            {!loading && drafts.length === 0 && (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px' }}>
                No drafts pending review.
              </div>
            )}

            {/* Draft list */}
            {drafts.map((tx, i) => (
              <div key={tx.id}>
                {/* Row */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '10px 1.5rem',
                    borderBottom: i < drafts.length - 1 || editingId === tx.id ? '1px solid var(--border)' : 'none',
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: 'var(--text)', fontSize: '13px', fontWeight: 500 }}>
                      {tx.payee ?? tx.category_name ?? '(unnamed)'}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '2px', flexWrap: 'wrap' }}>
                      <span style={{ color: 'var(--text-dim)', fontSize: '12px' }}>
                        {new Date(tx.datetime).toLocaleDateString('en-SG', { month: 'short', day: 'numeric' })}
                      </span>
                      {tx.category_name && (
                        <span style={{ color: 'var(--text-dim)', fontSize: '12px' }}>{tx.category_name}</span>
                      )}
                      {tx.tags.length > 0 && (
                        <span style={{ color: 'var(--text-dim)', fontSize: '11px' }}>
                          {tx.tags.map((t) => `#${t.name}`).join(' ')}
                        </span>
                      )}
                    </div>
                  </div>
                  <span style={{
                    color: tx.type === 'income' ? 'var(--green)' : 'var(--red)',
                    fontSize: '13px', fontWeight: 600, flexShrink: 0,
                  }}>
                    {tx.type === 'income' ? '+' : '-'}{tx.currency} {(tx.amount as number).toFixed(2)}
                  </span>
                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '4px', flexShrink: 0, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => {
                        if (editingId === tx.id) { setEditingId(null); setEditForm(null) }
                        else { setEditingId(tx.id); setEditForm(txToForm(tx)) }
                      }}
                      style={BTN_SEC}
                    >
                      {editingId === tx.id ? 'Cancel' : 'Edit'}
                    </button>
                    <button
                      type="button"
                      onClick={() => approveDraft(tx.id)}
                      disabled={approvingId === tx.id}
                      style={{ ...BTN_GRN, opacity: approvingId === tx.id ? 0.6 : 1 }}
                    >
                      {approvingId === tx.id ? '...' : 'Approve'}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteDraft(tx.id)}
                      disabled={deletingId === tx.id}
                      style={BTN_DNG}
                    >
                      {deletingId === tx.id ? '...' : '×'}
                    </button>
                  </div>
                </div>

                {/* Inline edit form */}
                {editingId === tx.id && editForm && (
                  <div
                    style={{
                      padding: '1rem 1.5rem',
                      background: 'var(--bg-subtle)',
                      borderBottom: i < drafts.length - 1 ? '1px solid var(--border)' : 'none',
                    }}
                  >
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                        gap: '8px',
                        marginBottom: '8px',
                      }}
                    >
                      <div>
                        <label htmlFor={`edit-type-${tx.id}`} style={{ color: 'var(--text-muted)', fontSize: '11px', display: 'block', marginBottom: '3px' }}>Type</label>
                        <select
                          id={`edit-type-${tx.id}`}
                          style={SELECT}
                          value={editForm.type}
                          onChange={(e) => ef('type', e.target.value as TxType)}
                        >
                          <option value="expense">Expense</option>
                          <option value="income">Income</option>
                          <option value="transfer">Transfer</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ color: 'var(--text-muted)', fontSize: '11px', display: 'block', marginBottom: '3px' }}>Amount</label>
                        <input type="number" step="0.01" style={INPUT} value={editForm.amount} onChange={(e) => ef('amount', e.target.value)} />
                      </div>
                      <div>
                        <label style={{ color: 'var(--text-muted)', fontSize: '11px', display: 'block', marginBottom: '3px' }}>Currency</label>
                        <select style={SELECT} value={editForm.currency} onChange={(e) => ef('currency', e.target.value)}>
                          {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={{ color: 'var(--text-muted)', fontSize: '11px', display: 'block', marginBottom: '3px' }}>Account</label>
                        <select style={SELECT} value={editForm.account_id} onChange={(e) => ef('account_id', e.target.value)}>
                          {activeAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={{ color: 'var(--text-muted)', fontSize: '11px', display: 'block', marginBottom: '3px' }}>Category</label>
                        <select style={SELECT} value={editForm.category_id} onChange={(e) => ef('category_id', e.target.value)}>
                          <option value="">None</option>
                          {categories.filter((c) => c.type === editForm.type).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={{ color: 'var(--text-muted)', fontSize: '11px', display: 'block', marginBottom: '3px' }}>Payee</label>
                        <input style={INPUT} value={editForm.payee} onChange={(e) => ef('payee', e.target.value)} placeholder="Payee" />
                      </div>
                      <div>
                        <label style={{ color: 'var(--text-muted)', fontSize: '11px', display: 'block', marginBottom: '3px' }}>Payment Method</label>
                        <select style={SELECT} value={editForm.payment_method} onChange={(e) => ef('payment_method', e.target.value)}>
                          <option value="">None</option>
                          <option value="cash">Cash</option>
                          <option value="credit card">Credit card</option>
                          <option value="debit card">Debit card</option>
                          <option value="e-wallet">E-wallet</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ color: 'var(--text-muted)', fontSize: '11px', display: 'block', marginBottom: '3px' }}>Date / Time</label>
                        <input type="datetime-local" style={INPUT} value={editForm.datetime} onChange={(e) => ef('datetime', e.target.value)} />
                      </div>
                    </div>

                    <div style={{ marginBottom: '8px' }}>
                      <label style={{ color: 'var(--text-muted)', fontSize: '11px', display: 'block', marginBottom: '3px' }}>Note</label>
                      <textarea
                        style={{ ...INPUT, resize: 'vertical', minHeight: '52px', fontFamily: 'inherit' }}
                        value={editForm.note}
                        onChange={(e) => ef('note', e.target.value)}
                        placeholder="Note"
                      />
                    </div>

                    {visibleTags.length > 0 && (
                      <div style={{ marginBottom: '10px' }}>
                        <label style={{ color: 'var(--text-muted)', fontSize: '11px', display: 'block', marginBottom: '6px' }}>Tags</label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {visibleTags.map((tag) => {
                            const selected = editForm.tag_ids.includes(tag.id)
                            return (
                              <button
                                key={tag.id}
                                type="button"
                                onClick={() =>
                                  ef('tag_ids', selected
                                    ? editForm.tag_ids.filter((id) => id !== tag.id)
                                    : [...editForm.tag_ids, tag.id])
                                }
                                style={{
                                  ...BTN, padding: '3px 10px', fontSize: '12px',
                                  background: selected ? '#f0b42920' : 'var(--bg-dim)',
                                  color: selected ? '#f0b429' : 'var(--text-muted)',
                                  border: `1px solid ${selected ? '#f0b42960' : 'var(--border)'}`,
                                }}
                              >
                                {tag.name}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => saveEdit(tx.id)}
                        disabled={savingId === tx.id}
                        style={{ ...BTN_PRI, flex: 1, minWidth: '100px', padding: '10px', opacity: savingId === tx.id ? 0.6 : 1 }}
                      >
                        {savingId === tx.id ? 'Saving...' : 'Save changes'}
                      </button>
                      <button
                        type="button"
                        onClick={() => approveDraft(tx.id)}
                        disabled={approvingId === tx.id}
                        style={{ ...BTN_GRN, flex: 1, minWidth: '100px', padding: '10px', opacity: approvingId === tx.id ? 0.6 : 1 }}
                      >
                        {approvingId === tx.id ? 'Approving...' : 'Approve'}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setEditingId(null); setEditForm(null) }}
                        style={{ ...BTN_SEC, padding: '10px' }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
