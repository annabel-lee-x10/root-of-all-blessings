'use client'
import { useState, useEffect, useCallback } from 'react'
import type { TransactionRow, Account, Category, Tag, TxType } from '@/lib/types'
import { useToast } from '../components/toast'


const LIMIT = 20

interface Filters {
  start: string; end: string
  accountId: string; categoryId: string
  type: '' | TxType; tagId: string
}

interface EditForm {
  type: TxType; amount: string; currency: string
  fx_rate: string; fx_date: string
  account_id: string; to_account_id: string
  category_id: string; payee: string; note: string
  datetime: string; tag_ids: string[]
}

function typeColor(type: string) {
  if (type === 'expense') return '#f85149'
  if (type === 'income') return '#3fb884'
  return '#58a6ff'
}

function formatAmt(tx: TransactionRow) {
  const sign = tx.type === 'expense' ? '-' : tx.type === 'income' ? '+' : ''
  if (tx.currency !== 'SGD' && tx.sgd_equivalent != null) {
    return `${sign}${tx.currency} ${(tx.amount as number).toFixed(2)} (SGD ${(tx.sgd_equivalent as number).toFixed(2)})`
  }
  return `${sign}SGD ${(tx.amount as number).toFixed(2)}`
}

function formatDt(iso: string) {
  return new Date(iso).toLocaleString('en-SG', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

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
    fx_rate: tx.fx_rate != null ? String(tx.fx_rate) : '',
    fx_date: tx.fx_date ?? '',
    account_id: tx.account_id,
    to_account_id: tx.to_account_id ?? '',
    category_id: tx.category_id ?? '',
    payee: tx.payee ?? '',
    note: tx.note ?? '',
    datetime: toInputDt(tx.datetime),
    tag_ids: tx.tags.map((t) => t.id),
  }
}

const BTN: React.CSSProperties = {
  border: 'none', borderRadius: '6px', cursor: 'pointer',
  fontSize: '12px', fontWeight: 500, padding: '5px 10px',
}
const BTN_PRI: React.CSSProperties = { ...BTN, background: 'var(--accent)', color: 'var(--bg)' }
const BTN_SEC: React.CSSProperties = { ...BTN, background: '#21262d', color: 'var(--text)', border: '1px solid var(--border)' }
const BTN_DNG: React.CSSProperties = { ...BTN, background: 'transparent', color: '#f85149', border: '1px solid #f8514940' }

const INPUT: React.CSSProperties = {
  background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px',
  color: 'var(--text)', fontSize: '13px', padding: '6px 10px', outline: 'none',
}
const SELECT: React.CSSProperties = { ...INPUT, cursor: 'pointer' }

export default function TransactionsPage() {
  const { showToast } = useToast()
  const [transactions, setTransactions] = useState<TransactionRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState<Filters>({ start: '', end: '', accountId: '', categoryId: '', type: '', tagId: '' })
  const [draftDates, setDraftDates] = useState({ start: '', end: '' })
  const [showFilters, setShowFilters] = useState(false)

  const [accounts, setAccounts] = useState<Account[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [tags, setTags] = useState<Tag[]>([])

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<EditForm | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

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
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const p = new URLSearchParams({ page: String(page), limit: String(LIMIT) })
      if (filters.start) p.set('start', filters.start + 'T00:00:00.000+08:00')
      if (filters.end) p.set('end', filters.end + 'T23:59:59.999+08:00')
      if (filters.accountId) p.set('account_id', filters.accountId)
      if (filters.categoryId) p.set('category_id', filters.categoryId)
      if (filters.type) p.set('type', filters.type)
      if (filters.tagId) p.set('tag_id', filters.tagId)
      const res = await fetch(`/api/transactions?${p}`)
      const data = await res.json()
      setTransactions(data.data ?? [])
      setTotal(data.total ?? 0)
    } finally {
      setLoading(false)
    }
  }, [page, filters])

  useEffect(() => { load() }, [load])

  function setFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }))
    setPage(1)
  }

  function exportUrl(format: 'csv' | 'xlsx') {
    const p = new URLSearchParams({ format })
    if (filters.start) p.set('start', filters.start + 'T00:00:00.000+08:00')
    if (filters.end) p.set('end', filters.end + 'T23:59:59.999+08:00')
    if (filters.accountId) p.set('account_id', filters.accountId)
    if (filters.categoryId) p.set('category_id', filters.categoryId)
    if (filters.type) p.set('type', filters.type)
    if (filters.tagId) p.set('tag_id', filters.tagId)
    return `/api/transactions/export?${p}`
  }

  function startEdit(tx: TransactionRow) {
    setEditingId(tx.id)
    setEditForm(txToForm(tx))
  }

  function cancelEdit() {
    setEditingId(null)
    setEditForm(null)
  }

  async function saveEdit(id: string) {
    if (!editForm) return
    setSavingId(id)
    try {
      const amt = parseFloat(editForm.amount)
      const rate = editForm.fx_rate ? parseFloat(editForm.fx_rate) : null
      const body = {
        type: editForm.type,
        amount: amt,
        currency: editForm.currency,
        fx_rate: rate,
        fx_date: editForm.fx_date || null,
        sgd_equivalent: editForm.currency !== 'SGD' && rate != null ? amt * rate : null,
        account_id: editForm.account_id,
        to_account_id: editForm.to_account_id || null,
        category_id: editForm.category_id || null,
        payee: editForm.payee || null,
        note: editForm.note || null,
        datetime: fromInputDt(editForm.datetime),
        tag_ids: editForm.tag_ids,
      }
      const res = await fetch(`/api/transactions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        showToast('Transaction updated', 'success')
        setEditingId(null)
        setEditForm(null)
        load()
      } else {
        showToast('Failed to update', 'error')
      }
    } finally {
      setSavingId(null)
    }
  }

  async function deleteTransaction(id: string) {
    if (!confirm('Delete this transaction?')) return
    setDeletingId(id)
    try {
      const res = await fetch(`/api/transactions/${id}`, { method: 'DELETE' })
      if (res.ok) {
        showToast('Transaction deleted', 'success')
        setTransactions((prev) => prev.filter((t) => t.id !== id))
        setTotal((prev) => prev - 1)
      } else {
        showToast('Failed to delete', 'error')
      }
    } finally {
      setDeletingId(null)
    }
  }

  function ef(key: keyof EditForm, value: string | string[]) {
    setEditForm((prev) => prev ? { ...prev, [key]: value } : prev)
  }

  const totalPages = Math.ceil(total / LIMIT)
  const activeAccounts = accounts.filter((a) => a.is_active)
  const expenseCategories = categories.filter((c) => c.type === 'expense')
  const incomeCategories = categories.filter((c) => c.type === 'income')

  return (
    <div style={{ padding: '1.5rem', maxWidth: '960px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '8px' }}>
        <h1 style={{ margin: 0, color: 'var(--text)', fontSize: '18px', fontWeight: 600 }}>Transactions</h1>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <a href={exportUrl('csv')} download style={{ ...BTN_SEC, textDecoration: 'none', display: 'inline-block' }}>
            Export CSV
          </a>
          <a href={exportUrl('xlsx')} download style={{ ...BTN_SEC, textDecoration: 'none', display: 'inline-block' }}>
            Export XLSX
          </a>
          <button onClick={() => setShowFilters(!showFilters)} style={BTN_SEC}>
            {showFilters ? 'Hide Filters' : 'Filters'}
          </button>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px',
          padding: '1rem', marginBottom: '1rem',
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '10px',
        }}>
          <div>
            <label style={{ color: 'var(--text-muted)', fontSize: '11px', display: 'block', marginBottom: '4px' }}>From</label>
            <input
              type="date" style={{ ...INPUT, width: '100%' }}
              value={draftDates.start}
              onChange={(e) => setDraftDates((p) => ({ ...p, start: e.target.value }))}
              onBlur={(e) => setFilter('start', e.target.value)}
            />
          </div>
          <div>
            <label style={{ color: 'var(--text-muted)', fontSize: '11px', display: 'block', marginBottom: '4px' }}>To</label>
            <input
              type="date" style={{ ...INPUT, width: '100%' }}
              value={draftDates.end}
              onChange={(e) => setDraftDates((p) => ({ ...p, end: e.target.value }))}
              onBlur={(e) => setFilter('end', e.target.value)}
            />
          </div>
          <div>
            <label style={{ color: 'var(--text-muted)', fontSize: '11px', display: 'block', marginBottom: '4px' }}>Account</label>
            <select style={{ ...SELECT, width: '100%' }} value={filters.accountId} onChange={(e) => setFilter('accountId', e.target.value)}>
              <option value="">All accounts</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ color: 'var(--text-muted)', fontSize: '11px', display: 'block', marginBottom: '4px' }}>Category</label>
            <select style={{ ...SELECT, width: '100%' }} value={filters.categoryId} onChange={(e) => setFilter('categoryId', e.target.value)}>
              <option value="">All categories</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ color: 'var(--text-muted)', fontSize: '11px', display: 'block', marginBottom: '4px' }}>Type</label>
            <div style={{ display: 'flex', gap: '4px' }}>
              {(['', 'expense', 'income', 'transfer'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setFilter('type', t)}
                  style={{
                    ...BTN, padding: '4px 8px', fontSize: '11px',
                    background: filters.type === t ? 'var(--accent)' : '#21262d',
                    color: filters.type === t ? 'var(--bg)' : 'var(--text-muted)',
                    border: '1px solid var(--border)',
                  }}
                >
                  {t === '' ? 'All' : t.slice(0, 3).toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label style={{ color: 'var(--text-muted)', fontSize: '11px', display: 'block', marginBottom: '4px' }}>Tag</label>
            <select style={{ ...SELECT, width: '100%' }} value={filters.tagId} onChange={(e) => setFilter('tagId', e.target.value)}>
              <option value="">All tags</option>
              {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button
              onClick={() => {
                setFilters({ start: '', end: '', accountId: '', categoryId: '', type: '', tagId: '' })
                setDraftDates({ start: '', end: '' })
                setPage(1)
              }}
              style={{ ...BTN_SEC, width: '100%' }}
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Count */}
      <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginBottom: '12px' }}>
        {loading ? 'Loading...' : `${total} transaction${total !== 1 ? 's' : ''}`}
      </div>

      {/* List */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
        {!loading && transactions.length === 0 && (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px' }}>
            No transactions found.
          </div>
        )}

        {transactions.map((tx, i) => (
          <div key={tx.id}>
            {/* Row */}
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                padding: '10px 16px',
                borderBottom: i < transactions.length - 1 || editingId === tx.id ? '1px solid #21262d' : 'none',
              }}
            >
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: typeColor(tx.type), flexShrink: 0 }} />

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', flexWrap: 'wrap' }}>
                  <span style={{ color: 'var(--text)', fontSize: '13px', fontWeight: 500 }}>
                    {tx.payee ?? tx.category_name ?? tx.account_name}
                  </span>
                  {tx.tags.length > 0 && (
                    <span style={{ color: '#484f58', fontSize: '11px' }}>
                      {tx.tags.map((t) => `#${t.name}`).join(' ')}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '2px', flexWrap: 'wrap' }}>
                  <span style={{ color: '#484f58', fontSize: '12px' }}>{formatDt(tx.datetime)}</span>
                  {tx.type === 'transfer'
                    ? <span style={{ color: '#484f58', fontSize: '12px' }}>{tx.account_name} - {tx.to_account_name}</span>
                    : <>
                        <span style={{ color: '#484f58', fontSize: '12px' }}>{tx.account_name}</span>
                        {tx.category_name && <span style={{ color: '#484f58', fontSize: '12px' }}>{tx.category_name}</span>}
                      </>
                  }
                  {tx.note && (
                    <span style={{ color: '#484f58', fontSize: '12px', fontStyle: 'italic' }}>
                      {(tx.note as string).length > 40 ? (tx.note as string).slice(0, 40) + '...' : tx.note as string}
                    </span>
                  )}
                </div>
              </div>

              <span style={{ fontSize: '13px', fontWeight: 600, color: typeColor(tx.type), flexShrink: 0 }}>
                {formatAmt(tx)}
              </span>

              <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                <button
                  onClick={() => editingId === tx.id ? cancelEdit() : startEdit(tx)}
                  style={{ ...BTN_SEC, padding: '4px 8px', fontSize: '11px' }}
                >
                  {editingId === tx.id ? 'Cancel' : 'Edit'}
                </button>
                <button
                  onClick={() => deleteTransaction(tx.id)}
                  disabled={deletingId === tx.id}
                  style={{ ...BTN_DNG, padding: '4px 8px', fontSize: '11px' }}
                >
                  {deletingId === tx.id ? '...' : '×'}
                </button>
              </div>
            </div>

            {/* Inline edit form */}
            {editingId === tx.id && editForm && (
              <div style={{
                padding: '1rem 1rem 1rem 2.5rem',
                background: 'var(--bg)',
                borderBottom: i < transactions.length - 1 ? '1px solid #21262d' : 'none',
              }}>
                {/* Type */}
                <div style={{ display: 'flex', gap: '4px', marginBottom: '10px' }}>
                  {(['expense', 'income', 'transfer'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => ef('type', t)}
                      style={{
                        ...BTN, padding: '5px 12px',
                        background: editForm.type === t ? typeColor(t) : '#21262d',
                        color: editForm.type === t ? 'var(--bg)' : 'var(--text-muted)',
                        border: `1px solid ${editForm.type === t ? typeColor(t) : 'var(--border)'}`,
                        textTransform: 'capitalize',
                      }}
                    >
                      {t}
                    </button>
                  ))}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '8px', marginBottom: '8px' }}>
                  <div>
                    <label style={{ color: 'var(--text-muted)', fontSize: '11px', display: 'block', marginBottom: '3px' }}>Date / Time</label>
                    <input type="datetime-local" style={{ ...INPUT, width: '100%' }} value={editForm.datetime} onChange={(e) => ef('datetime', e.target.value)} />
                  </div>
                  <div>
                    <label style={{ color: 'var(--text-muted)', fontSize: '11px', display: 'block', marginBottom: '3px' }}>Amount</label>
                    <input type="number" step="0.01" style={{ ...INPUT, width: '100%' }} value={editForm.amount} onChange={(e) => ef('amount', e.target.value)} />
                  </div>
                  <div>
                    <label style={{ color: 'var(--text-muted)', fontSize: '11px', display: 'block', marginBottom: '3px' }}>Currency</label>
                    <input style={{ ...INPUT, width: '100%' }} value={editForm.currency} onChange={(e) => ef('currency', e.target.value.toUpperCase())} maxLength={3} />
                  </div>
                  {editForm.currency !== 'SGD' && (
                    <>
                      <div>
                        <label style={{ color: 'var(--text-muted)', fontSize: '11px', display: 'block', marginBottom: '3px' }}>FX Rate</label>
                        <input type="number" step="0.0001" style={{ ...INPUT, width: '100%' }} value={editForm.fx_rate} onChange={(e) => ef('fx_rate', e.target.value)} />
                      </div>
                      <div>
                        <label style={{ color: 'var(--text-muted)', fontSize: '11px', display: 'block', marginBottom: '3px' }}>FX Date</label>
                        <input type="date" style={{ ...INPUT, width: '100%' }} value={editForm.fx_date} onChange={(e) => ef('fx_date', e.target.value)} />
                      </div>
                    </>
                  )}
                  <div>
                    <label style={{ color: 'var(--text-muted)', fontSize: '11px', display: 'block', marginBottom: '3px' }}>Account</label>
                    <select style={{ ...SELECT, width: '100%' }} value={editForm.account_id} onChange={(e) => ef('account_id', e.target.value)}>
                      {(['bank', 'wallet', 'cash', 'fund'] as const).map((type) => {
                        const accts = activeAccounts.filter((a) => a.type === type)
                        if (!accts.length) return null
                        return (
                          <optgroup key={type} label={type.charAt(0).toUpperCase() + type.slice(1)}>
                            {accts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                          </optgroup>
                        )
                      })}
                    </select>
                  </div>
                  {editForm.type === 'transfer' && (
                    <div>
                      <label style={{ color: 'var(--text-muted)', fontSize: '11px', display: 'block', marginBottom: '3px' }}>To Account</label>
                      <select style={{ ...SELECT, width: '100%' }} value={editForm.to_account_id} onChange={(e) => ef('to_account_id', e.target.value)}>
                        <option value="">Select...</option>
                        {(['bank', 'wallet', 'cash', 'fund'] as const).map((type) => {
                          const accts = activeAccounts.filter((a) => a.type === type && a.id !== editForm.account_id)
                          if (!accts.length) return null
                          return (
                            <optgroup key={type} label={type.charAt(0).toUpperCase() + type.slice(1)}>
                              {accts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                            </optgroup>
                          )
                        })}
                      </select>
                    </div>
                  )}
                  {editForm.type !== 'transfer' && (
                    <div>
                      <label style={{ color: 'var(--text-muted)', fontSize: '11px', display: 'block', marginBottom: '3px' }}>Category</label>
                      <select style={{ ...SELECT, width: '100%' }} value={editForm.category_id} onChange={(e) => ef('category_id', e.target.value)}>
                        <option value="">None</option>
                        {(editForm.type === 'expense' ? expenseCategories : incomeCategories).map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div>
                    <label style={{ color: 'var(--text-muted)', fontSize: '11px', display: 'block', marginBottom: '3px' }}>Payee</label>
                    <input style={{ ...INPUT, width: '100%' }} value={editForm.payee} onChange={(e) => ef('payee', e.target.value)} />
                  </div>
                </div>

                <div style={{ marginBottom: '8px' }}>
                  <label style={{ color: 'var(--text-muted)', fontSize: '11px', display: 'block', marginBottom: '3px' }}>Note</label>
                  <textarea
                    style={{ ...INPUT, width: '100%', resize: 'vertical', minHeight: '56px', fontFamily: 'inherit' }}
                    value={editForm.note}
                    onChange={(e) => ef('note', e.target.value)}
                  />
                </div>

                {tags.length > 0 && (
                  <div style={{ marginBottom: '10px' }}>
                    <label style={{ color: 'var(--text-muted)', fontSize: '11px', display: 'block', marginBottom: '6px' }}>Tags</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {tags.map((tag) => {
                        const selected = editForm.tag_ids.includes(tag.id)
                        return (
                          <button
                            key={tag.id}
                            onClick={() => ef('tag_ids', selected
                              ? editForm.tag_ids.filter((id) => id !== tag.id)
                              : [...editForm.tag_ids, tag.id]
                            )}
                            style={{
                              ...BTN, padding: '3px 10px', fontSize: '12px',
                              background: selected ? '#f0b42920' : '#21262d',
                              color: selected ? 'var(--accent)' : 'var(--text-muted)',
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

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => saveEdit(tx.id)}
                    disabled={savingId === tx.id}
                    style={{ ...BTN_PRI, opacity: savingId === tx.id ? 0.6 : 1 }}
                  >
                    {savingId === tx.id ? 'Saving...' : 'Save changes'}
                  </button>
                  <button onClick={cancelEdit} style={BTN_SEC}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginTop: '1rem' }}>
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} style={BTN_SEC}>
            Prev
          </button>
          <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Page {page} of {totalPages}</span>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={BTN_SEC}>
            Next
          </button>
        </div>
      )}
    </div>
  )
}
