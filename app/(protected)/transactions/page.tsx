'use client'
import { useState, useEffect, useCallback } from 'react'
import type { TransactionRow, Account, Category, Tag, TxType } from '@/lib/types'
import { useToast } from '../components/toast'
import { ConfirmDialog } from '../components/confirm-dialog'


const LIMIT = 50

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
  if (type === 'expense') return 'var(--red)'
  if (type === 'income') return 'var(--green)'
  return 'var(--blue)'
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
  minHeight: '44px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
}
const BTN_PRI: React.CSSProperties = { ...BTN, background: 'var(--accent)', color: 'var(--bg)' }
const BTN_SEC: React.CSSProperties = { ...BTN, background: 'var(--bg-dim)', color: 'var(--text)', border: '1px solid var(--border)' }
const BTN_DNG: React.CSSProperties = { ...BTN, background: 'transparent', color: 'var(--red)', border: '1px solid var(--red-muted)' }

const INPUT: React.CSSProperties = {
  background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px',
  color: 'var(--text)', fontSize: '13px', padding: '6px 10px', outline: 'none',
}
const SELECT: React.CSSProperties = { ...INPUT, cursor: 'pointer', maxWidth: '100%' }

const ACCOUNT_TYPE_ORDER = ['bank', 'wallet', 'cash', 'fund'] as const
const ACCOUNT_TYPE_LABELS: Record<string, string> = { bank: 'Bank', wallet: 'Wallet', cash: 'Cash', fund: 'Fund' }

function useMobile(bp = 640) {
  const [mobile, setMobile] = useState(false)
  useEffect(() => {
    if (!window.matchMedia) return
    const mq = window.matchMedia(`(max-width: ${bp - 1}px)`)
    const update = () => setMobile(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [bp])
  return mobile
}

function AccountOptions({ accounts }: { accounts: Account[] }) {
  const groups: Record<string, Account[]> = { bank: [], wallet: [], cash: [], fund: [] }
  for (const a of accounts) {
    if (groups[a.type]) groups[a.type].push(a)
    else groups[a.type] = [a]
  }
  return (
    <>
      {ACCOUNT_TYPE_ORDER.filter(t => groups[t] && groups[t].length > 0).map(type => (
        <optgroup key={type} label={ACCOUNT_TYPE_LABELS[type]}>
          {groups[type].map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </optgroup>
      ))}
    </>
  )
}

export default function TransactionsPage() {
  const { showToast } = useToast()
  const isMobile = useMobile()
  const [transactions, setTransactions] = useState<TransactionRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState<Filters>(() => {
    if (typeof window === 'undefined') return { start: '', end: '', accountId: '', categoryId: '', type: '', tagId: '' }
    const p = new URLSearchParams(window.location.search)
    return {
      start: p.get('start') ?? '',
      end: p.get('end') ?? '',
      accountId: p.get('account_id') ?? '',
      categoryId: p.get('category_id') ?? '',
      type: (p.get('type') ?? '') as '' | TxType,
      tagId: p.get('tag_id') ?? '',
    }
  })
  const [draftDates, setDraftDates] = useState({ start: '', end: '' })
  const [showFilters, setShowFilters] = useState(() => {
    if (typeof window === 'undefined') return false
    const p = new URLSearchParams(window.location.search)
    return !!(p.get('account_id') || p.get('category_id') || p.get('type') || p.get('tag_id'))
  })

  const [accounts, setAccounts] = useState<Account[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [tags, setTags] = useState<Tag[]>([])

  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('date-desc')

  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkAccountId, setBulkAccountId] = useState('')
  const [bulkCategoryId, setBulkCategoryId] = useState('')
  const [bulkType, setBulkType] = useState<'' | TxType>('')
  const [bulkAddTagId, setBulkAddTagId] = useState('')
  const [bulkRemoveTagId, setBulkRemoveTagId] = useState('')

  const [exportOpen, setExportOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<EditForm | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<TransactionRow | null>(null)
  const [undoStack, setUndoStack] = useState<TransactionRow[]>([])

  useEffect(() => {
    // Read URL search params on mount
    const sp = new URLSearchParams(window.location.search)
    const urlFilters: Partial<Filters> = {}
    const catId = sp.get('category_id')
    const acctId = sp.get('account_id')
    const tagId = sp.get('tag_id')
    const txType = sp.get('type')
    if (catId) urlFilters.categoryId = catId
    if (acctId) urlFilters.accountId = acctId
    if (tagId) urlFilters.tagId = tagId
    if (txType && (['expense', 'income', 'transfer', ''] as string[]).includes(txType)) {
      urlFilters.type = txType as Filters['type']
    }
    if (Object.keys(urlFilters).length > 0) {
      setFilters(prev => ({ ...prev, ...urlFilters }))
      setShowFilters(true)
    }

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
      if (search) p.set('search', search)
      if (sortBy && sortBy !== 'date-desc') p.set('sort', sortBy)
      const res = await fetch(`/api/transactions?${p}`)
      const data = await res.json()
      if (page === 1) {
        setTransactions(data.data ?? [])
      } else {
        setTransactions(prev => [...prev, ...(data.data ?? [])])
      }
      setTotal(data.total ?? 0)
    } finally {
      setLoading(false)
    }
  }, [page, filters, search, sortBy])

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

  async function confirmAndDelete(tx: TransactionRow) {
    setConfirmDelete(tx)
  }

  async function executeDelete(tx: TransactionRow) {
    setConfirmDelete(null)
    setDeletingId(tx.id)
    try {
      const res = await fetch(`/api/transactions/${tx.id}`, { method: 'DELETE' })
      if (res.ok) {
        setTransactions((prev) => prev.filter((t) => t.id !== tx.id))
        setTotal((prev) => prev - 1)
        setUndoStack(prev => [tx, ...prev].slice(0, 5))
        showToast(`Deleted "${tx.payee || 'transaction'}"`, 'success', {
          label: 'Undo',
          onClick: () => undoDelete(tx),
        })
      } else {
        showToast('Failed to delete', 'error')
      }
    } finally {
      setDeletingId(null)
    }
  }

  async function undoDelete(tx: TransactionRow) {
    try {
      const body = {
        id: tx.id, type: tx.type, amount: tx.amount, currency: tx.currency,
        fx_rate: tx.fx_rate, fx_date: tx.fx_date, account_id: tx.account_id,
        to_account_id: tx.to_account_id, category_id: tx.category_id,
        payee: tx.payee, note: tx.note, datetime: tx.datetime,
        tag_ids: tx.tags.map(t => t.id),
      }
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        showToast('Transaction restored', 'success')
        setUndoStack(prev => prev.filter(t => t.id !== tx.id))
        setPage(1)
      } else {
        showToast('Failed to restore', 'error')
      }
    } catch {
      showToast('Failed to restore', 'error')
    }
  }

  function ef(key: keyof EditForm, value: string | string[]) {
    setEditForm((prev) => prev ? { ...prev, [key]: value } : prev)
  }

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    if (selected.size === transactions.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(transactions.map(t => t.id)))
    }
  }

  async function bulkPatch(patch: object) {
    setBulkLoading(true)
    const selectedTxs = transactions.filter(t => selected.has(t.id))
    try {
      await Promise.all(selectedTxs.map(tx =>
        fetch(`/api/transactions/${tx.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        })
      ))
      showToast(`Updated ${selectedTxs.length} transaction${selectedTxs.length !== 1 ? 's' : ''}`, 'success')
      setSelected(new Set())
      load()
    } catch {
      showToast('Some updates failed', 'error')
    } finally {
      setBulkLoading(false)
    }
  }

  async function bulkApplyAddTag() {
    if (!bulkAddTagId) return
    setBulkLoading(true)
    const selectedTxs = transactions.filter(t => selected.has(t.id))
    try {
      await Promise.all(selectedTxs.map(tx => {
        const newTagIds = [...new Set([...tx.tags.map(tg => tg.id), bulkAddTagId])]
        return fetch(`/api/transactions/${tx.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tag_ids: newTagIds }),
        })
      }))
      showToast(`Added tag to ${selectedTxs.length} transaction${selectedTxs.length !== 1 ? 's' : ''}`, 'success')
      setBulkAddTagId('')
      setSelected(new Set())
      load()
    } catch {
      showToast('Some updates failed', 'error')
    } finally {
      setBulkLoading(false)
    }
  }

  async function bulkApplyRemoveTag() {
    if (!bulkRemoveTagId) return
    setBulkLoading(true)
    const selectedTxs = transactions.filter(t => selected.has(t.id))
    try {
      await Promise.all(selectedTxs.map(tx => {
        const newTagIds = tx.tags.map(tg => tg.id).filter(id => id !== bulkRemoveTagId)
        return fetch(`/api/transactions/${tx.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tag_ids: newTagIds }),
        })
      }))
      showToast(`Removed tag from ${selectedTxs.length} transaction${selectedTxs.length !== 1 ? 's' : ''}`, 'success')
      setBulkRemoveTagId('')
      setSelected(new Set())
      load()
    } catch {
      showToast('Some updates failed', 'error')
    } finally {
      setBulkLoading(false)
    }
  }

  const totalPages = Math.ceil(total / LIMIT)
  const activeAccounts = accounts.filter((a) => a.is_active)
  const expenseCategories = categories.filter((c) => c.type === 'expense')
  const incomeCategories = categories.filter((c) => c.type === 'income')

  return (
    <div style={{ padding: '1.5rem', maxWidth: '960px', margin: '0 auto', paddingBottom: selectMode && selected.size > 0 ? '80px' : undefined }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '8px' }}>
        <h1 style={{ margin: 0, color: 'var(--text)', fontSize: '18px', fontWeight: 600 }}>Transactions</h1>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          {/* Export dropdown */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setExportOpen(v => !v)}
              style={{ ...BTN_SEC, gap: '4px' }}
            >
              Export <span style={{ fontSize: '10px', opacity: 0.7 }}>{exportOpen ? '▲' : '▼'}</span>
            </button>
            {exportOpen && (
              <>
                <div onClick={() => setExportOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 49 }} />
                <div style={{
                  position: 'absolute', top: 'calc(100% + 4px)', right: 0,
                  background: 'var(--bg-subtle)', border: '1px solid var(--border)',
                  borderRadius: '8px', zIndex: 50, minWidth: '120px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                }}>
                  <a
                    href={exportUrl('csv')} download
                    onClick={() => setExportOpen(false)}
                    style={{ display: 'block', padding: '10px 14px', color: 'var(--text)', textDecoration: 'none', fontSize: '13px' }}
                  >
                    CSV
                  </a>
                  <a
                    href={exportUrl('xlsx')} download
                    onClick={() => setExportOpen(false)}
                    style={{ display: 'block', padding: '10px 14px', color: 'var(--text)', textDecoration: 'none', fontSize: '13px' }}
                  >
                    Excel (XLSX)
                  </a>
                </div>
              </>
            )}
          </div>
          <button onClick={() => setShowFilters(!showFilters)} style={BTN_SEC}>
            {showFilters ? 'Hide Filters' : 'Filters'}
          </button>
          <button
            onClick={() => { setSelectMode(v => !v); setSelected(new Set()) }}
            style={selectMode ? { ...BTN_SEC, color: 'var(--accent)', borderColor: 'var(--accent)' } : BTN_SEC}
          >
            {selectMode ? 'Cancel' : 'Select'}
          </button>
        </div>
      </div>

      {/* Search + sort bar - always visible */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
        <input
          style={{ ...INPUT, flex: '1 1 200px', minWidth: 0 }}
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          placeholder="Search payee, note, category..."
        />
        <select
          style={{ ...SELECT, flex: '0 0 auto', width: 'auto' }}
          value={sortBy}
          onChange={e => { setSortBy(e.target.value); setPage(1) }}
        >
          <option value="date-desc">Date: newest first</option>
          <option value="date-asc">Date: oldest first</option>
          <option value="amount-desc">Amount: high to low</option>
          <option value="amount-asc">Amount: low to high</option>
          <option value="payee-asc">Payee A-Z</option>
        </select>
      </div>

      {/* Filters */}
      {showFilters && (
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px',
          padding: '1rem', marginBottom: '1rem',
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '10px',
        }}>
          <div>
            <label style={{ color: 'var(--text-muted)', fontSize: '12px', display: 'block', marginBottom: '4px' }}>From</label>
            <input
              type="date" style={{ ...INPUT, width: '100%' }}
              value={draftDates.start}
              onChange={(e) => setDraftDates((p) => ({ ...p, start: e.target.value }))}
              onBlur={(e) => setFilter('start', e.target.value)}
            />
          </div>
          <div>
            <label style={{ color: 'var(--text-muted)', fontSize: '12px', display: 'block', marginBottom: '4px' }}>To</label>
            <input
              type="date" style={{ ...INPUT, width: '100%' }}
              value={draftDates.end}
              onChange={(e) => setDraftDates((p) => ({ ...p, end: e.target.value }))}
              onBlur={(e) => setFilter('end', e.target.value)}
            />
          </div>
          <div>
            <label style={{ color: 'var(--text-muted)', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Account</label>
            <select style={{ ...SELECT, width: '100%' }} value={filters.accountId} onChange={(e) => setFilter('accountId', e.target.value)}>
              <option value="">All accounts</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ color: 'var(--text-muted)', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Category</label>
            <select style={{ ...SELECT, width: '100%' }} value={filters.categoryId} onChange={(e) => setFilter('categoryId', e.target.value)}>
              <option value="">All categories</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ color: 'var(--text-muted)', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Type</label>
            <div style={{ display: 'flex', gap: '4px' }}>
              {(['', 'expense', 'income', 'transfer'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setFilter('type', t)}
                  style={{
                    ...BTN, padding: '4px 8px', fontSize: '12px',
                    background: filters.type === t ? 'var(--accent)' : 'var(--bg-dim)',
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
            <label style={{ color: 'var(--text-muted)', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Tag</label>
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
                setSearch('')
                setSortBy('date-desc')
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

        {selectMode && (
          <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--bg-dim)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="checkbox"
              checked={selected.size === transactions.length && transactions.length > 0}
              onChange={toggleSelectAll}
              style={{ cursor: 'pointer' }}
            />
            <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
              {selected.size > 0 ? `${selected.size} selected` : 'Select all'}
            </span>
          </div>
        )}

        {transactions.map((tx, i) => (
          <div key={tx.id}>
            {/* Row */}
            <div
              style={{
                display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', gap: '8px',
                padding: '10px 16px', flexWrap: isMobile ? 'wrap' : 'nowrap',
                borderBottom: i < transactions.length - 1 || editingId === tx.id ? '1px solid var(--bg-dim)' : 'none',
              }}
            >
              {selectMode && (
                <input
                  type="checkbox"
                  checked={selected.has(tx.id)}
                  onChange={() => toggleSelect(tx.id)}
                  onClick={e => e.stopPropagation()}
                  style={{ cursor: 'pointer', flexShrink: 0 }}
                />
              )}
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: typeColor(tx.type), flexShrink: 0, marginTop: isMobile ? '3px' : 0 }} />

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', flexWrap: 'wrap' }}>
                  <span style={{ color: 'var(--text)', fontSize: '13px', fontWeight: 500 }}>
                    {tx.payee ?? tx.category_name ?? tx.account_name}
                  </span>
                  {tx.tags.length > 0 && (
                    <span style={{ color: 'var(--text-dim)', fontSize: '11px' }}>
                      {tx.tags.map((t) => `#${t.name}`).join(' ')}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '2px', flexWrap: 'wrap' }}>
                  <span style={{ color: 'var(--text-dim)', fontSize: '12px' }}>{formatDt(tx.datetime)}</span>
                  {tx.type === 'transfer'
                    ? <span style={{ color: 'var(--text-dim)', fontSize: '12px' }}>{tx.account_name} - {tx.to_account_name}</span>
                    : <>
                        <span style={{ color: 'var(--text-dim)', fontSize: '12px' }}>{tx.account_name}</span>
                        {tx.category_name && <span style={{ color: 'var(--text-dim)', fontSize: '12px' }}>{tx.category_name}</span>}
                      </>
                  }
                  {tx.note && (
                    <span style={{ color: 'var(--text-dim)', fontSize: '12px', fontStyle: 'italic' }}>
                      {(tx.note as string).length > 40 ? (tx.note as string).slice(0, 40) + '...' : tx.note as string}
                    </span>
                  )}
                </div>
              </div>

              <div style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                ...(isMobile ? { flex: '0 0 100%', justifyContent: 'flex-end' } : { flexShrink: 0 }),
              }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: typeColor(tx.type) }}>
                  {formatAmt(tx)}
                </span>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button
                    onClick={() => editingId === tx.id ? cancelEdit() : startEdit(tx)}
                    style={{ ...BTN_SEC, padding: '4px 8px', fontSize: '12px' }}
                  >
                    {editingId === tx.id ? 'Cancel' : 'Edit'}
                  </button>
                  <button
                    onClick={() => confirmAndDelete(tx)}
                    disabled={deletingId === tx.id}
                    style={{ ...BTN_DNG, padding: '4px 8px', fontSize: '12px' }}
                  >
                    {deletingId === tx.id ? '...' : '×'}
                  </button>
                </div>
              </div>
            </div>

            {/* Inline edit form */}
            {editingId === tx.id && editForm && (
              <div style={{
                padding: isMobile ? '0.75rem 1rem' : '1rem 1rem 1rem 2.5rem',
                background: 'var(--bg)',
                borderBottom: i < transactions.length - 1 ? '1px solid var(--bg-dim)' : 'none',
              }}>
                {/* Type */}
                <div style={{ display: 'flex', gap: '4px', marginBottom: '10px' }}>
                  {(['expense', 'income', 'transfer'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => ef('type', t)}
                      style={{
                        ...BTN, padding: '5px 12px',
                        background: editForm.type === t ? typeColor(t) : 'var(--bg-dim)',
                        color: editForm.type === t ? 'var(--bg)' : 'var(--text-muted)',
                        border: `1px solid ${editForm.type === t ? typeColor(t) : 'var(--border)'}`,
                        textTransform: 'capitalize',
                      }}
                    >
                      {t}
                    </button>
                  ))}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '8px', marginBottom: '8px' }}>
                  <div>
                    <label style={{ color: 'var(--text-muted)', fontSize: '12px', display: 'block', marginBottom: '3px' }}>Date / Time</label>
                    <input type="datetime-local" style={{ ...INPUT, width: '100%' }} value={editForm.datetime} onChange={(e) => ef('datetime', e.target.value)} />
                  </div>
                  <div>
                    <label style={{ color: 'var(--text-muted)', fontSize: '12px', display: 'block', marginBottom: '3px' }}>Amount</label>
                    <input type="number" step="0.01" style={{ ...INPUT, width: '100%' }} value={editForm.amount} onChange={(e) => ef('amount', e.target.value)} />
                  </div>
                  <div>
                    <label style={{ color: 'var(--text-muted)', fontSize: '12px', display: 'block', marginBottom: '3px' }}>Currency</label>
                    <input style={{ ...INPUT, width: '100%' }} value={editForm.currency} onChange={(e) => ef('currency', e.target.value.toUpperCase())} maxLength={3} />
                  </div>
                  {editForm.currency !== 'SGD' && (
                    <>
                      <div>
                        <label style={{ color: 'var(--text-muted)', fontSize: '12px', display: 'block', marginBottom: '3px' }}>FX Rate</label>
                        <input type="number" step="0.0001" style={{ ...INPUT, width: '100%' }} value={editForm.fx_rate} onChange={(e) => ef('fx_rate', e.target.value)} />
                      </div>
                      <div>
                        <label style={{ color: 'var(--text-muted)', fontSize: '12px', display: 'block', marginBottom: '3px' }}>FX Date</label>
                        <input type="date" style={{ ...INPUT, width: '100%' }} value={editForm.fx_date} onChange={(e) => ef('fx_date', e.target.value)} />
                      </div>
                    </>
                  )}
                  <div>
                    <label style={{ color: 'var(--text-muted)', fontSize: '12px', display: 'block', marginBottom: '3px' }}>Account</label>
                    <select style={{ ...SELECT, width: '100%' }} value={editForm.account_id} onChange={(e) => ef('account_id', e.target.value)}>
                      <AccountOptions accounts={activeAccounts} />
                    </select>
                  </div>
                  {editForm.type === 'transfer' && (
                    <div>
                      <label style={{ color: 'var(--text-muted)', fontSize: '12px', display: 'block', marginBottom: '3px' }}>To Account</label>
                      <select style={{ ...SELECT, width: '100%' }} value={editForm.to_account_id} onChange={(e) => ef('to_account_id', e.target.value)}>
                        <option value="">Select...</option>
                        <AccountOptions accounts={activeAccounts.filter((a) => a.id !== editForm.account_id)} />
                      </select>
                    </div>
                  )}
                  {editForm.type !== 'transfer' && (
                    <div>
                      <label style={{ color: 'var(--text-muted)', fontSize: '12px', display: 'block', marginBottom: '3px' }}>Category</label>
                      <select style={{ ...SELECT, width: '100%' }} value={editForm.category_id} onChange={(e) => ef('category_id', e.target.value)}>
                        <option value="">None</option>
                        {(editForm.type === 'expense' ? expenseCategories : incomeCategories).map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div>
                    <label style={{ color: 'var(--text-muted)', fontSize: '12px', display: 'block', marginBottom: '3px' }}>Payee</label>
                    <input style={{ ...INPUT, width: '100%' }} value={editForm.payee} onChange={(e) => ef('payee', e.target.value)} />
                  </div>
                </div>

                <div style={{ marginBottom: '8px' }}>
                  <label style={{ color: 'var(--text-muted)', fontSize: '12px', display: 'block', marginBottom: '3px' }}>Note</label>
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
                              background: selected ? 'var(--accent-faint)' : 'var(--bg-dim)',
                              color: selected ? 'var(--accent)' : 'var(--text-muted)',
                              border: `1px solid ${selected ? 'var(--accent-soft)' : 'var(--border)'}`,
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

      {/* Load more */}
      {transactions.length < total && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1rem' }}>
          <button
            onClick={() => setPage(p => p + 1)}
            disabled={loading}
            style={{ ...BTN_SEC, minWidth: '140px' }}
          >
            {loading ? 'Loading...' : `Load more (${total - transactions.length} remaining)`}
          </button>
        </div>
      )}

      {selectMode && selected.size > 0 && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
          background: 'var(--bg-subtle)', borderTop: '1px solid var(--border)',
          padding: '10px 1.5rem', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap',
        }}>
          <span style={{ color: 'var(--text)', fontSize: '13px', fontWeight: 600, flexShrink: 0 }}>
            {selected.size} selected
          </span>

          {/* Change account */}
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            <select
              style={{ ...SELECT, width: 'auto', fontSize: '12px', padding: '4px 8px' }}
              value={bulkAccountId}
              onChange={e => setBulkAccountId(e.target.value)}
            >
              <option value="">Account...</option>
              <AccountOptions accounts={activeAccounts} />
            </select>
            <button
              style={{ ...BTN_SEC, fontSize: '12px' }}
              onClick={() => { if (bulkAccountId) { bulkPatch({ account_id: bulkAccountId }); setBulkAccountId('') } }}
              disabled={!bulkAccountId || bulkLoading}
            >Apply</button>
          </div>

          {/* Change category */}
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            <select
              style={{ ...SELECT, width: 'auto', fontSize: '12px', padding: '4px 8px' }}
              value={bulkCategoryId}
              onChange={e => setBulkCategoryId(e.target.value)}
            >
              <option value="">Category...</option>
              <optgroup label="Expense">
                {expenseCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </optgroup>
              <optgroup label="Income">
                {incomeCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </optgroup>
            </select>
            <button
              style={{ ...BTN_SEC, fontSize: '12px' }}
              onClick={() => { if (bulkCategoryId) { bulkPatch({ category_id: bulkCategoryId }); setBulkCategoryId('') } }}
              disabled={!bulkCategoryId || bulkLoading}
            >Apply</button>
          </div>

          {/* Change type */}
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            {(['expense', 'income', 'transfer'] as const).map(t => (
              <button
                key={t}
                onClick={() => setBulkType(prev => prev === t ? '' : t)}
                style={{
                  ...BTN, fontSize: '12px', padding: '4px 10px',
                  background: bulkType === t ? typeColor(t) : 'var(--bg-dim)',
                  color: bulkType === t ? 'var(--bg)' : 'var(--text-muted)',
                  border: `1px solid ${bulkType === t ? typeColor(t) : 'var(--border)'}`,
                  textTransform: 'capitalize',
                }}
              >
                {t}
              </button>
            ))}
            {bulkType && (
              <button
                style={{ ...BTN_SEC, fontSize: '12px' }}
                onClick={() => { bulkPatch({ type: bulkType }); setBulkType('') }}
                disabled={bulkLoading}
              >Apply type</button>
            )}
          </div>

          {/* Add/remove tag */}
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            <select
              style={{ ...SELECT, width: 'auto', fontSize: '12px', padding: '4px 8px' }}
              value={bulkAddTagId}
              onChange={e => setBulkAddTagId(e.target.value)}
            >
              <option value="">+Tag...</option>
              {tags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <button style={{ ...BTN_SEC, fontSize: '12px' }} onClick={bulkApplyAddTag} disabled={!bulkAddTagId || bulkLoading}>+Tag</button>
          </div>
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            <select
              style={{ ...SELECT, width: 'auto', fontSize: '12px', padding: '4px 8px' }}
              value={bulkRemoveTagId}
              onChange={e => setBulkRemoveTagId(e.target.value)}
            >
              <option value="">-Tag...</option>
              {tags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <button style={{ ...BTN_DNG, fontSize: '12px' }} onClick={bulkApplyRemoveTag} disabled={!bulkRemoveTagId || bulkLoading}>-Tag</button>
          </div>

          {bulkLoading && <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Updating...</span>}
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete transaction?"
        message={confirmDelete ? `Delete "${confirmDelete.payee || 'this transaction'}" for ${formatAmt(confirmDelete)}? This cannot be undone (but you'll have 5s to undo via the notification).` : ''}
        confirmLabel="Delete"
        onConfirm={() => confirmDelete && executeDelete(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  )
}
