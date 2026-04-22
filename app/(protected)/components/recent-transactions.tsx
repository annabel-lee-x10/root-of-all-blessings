'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import type { TransactionRow, Account, Category, Tag, TxType, AccountType } from '@/lib/types'
import { useToast } from './toast'
import { PaymentTypePicker } from './payment-type-picker'
import { CategoryPicker } from './category-picker'
import { TagSelector } from './tag-selector'

function formatAmount(row: TransactionRow) {
  const prefix = row.type === 'expense' ? '-' : row.type === 'income' ? '+' : ''
  if (row.currency !== 'SGD' && row.sgd_equivalent != null) {
    return `${prefix}${row.currency} ${(row.amount as number).toFixed(2)} (SGD ${(row.sgd_equivalent as number).toFixed(2)})`
  }
  return `${prefix}SGD ${(row.amount as number).toFixed(2)}`
}

function typeColor(type: string) {
  if (type === 'expense') return '#f85149'
  if (type === 'income') return '#3fb884'
  return '#8b949e'
}

function formatDatetime(iso: string) {
  return new Date(iso).toLocaleString('en-SG', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
    hour12: false,
  })
}

const pillStyle = (active: boolean, color: string): React.CSSProperties => ({
  padding: '2px 8px',
  borderRadius: '10px',
  fontSize: '11px',
  fontWeight: 500,
  cursor: 'pointer',
  border: active ? `1px solid ${color}` : '1px solid #30363d',
  background: active ? `${color}20` : 'transparent',
  color: active ? color : '#484f58',
  transition: 'all 0.15s',
  lineHeight: '18px',
})

const compactSelect: React.CSSProperties = {
  background: '#0d1117',
  border: '1px solid #30363d',
  borderRadius: '6px',
  color: '#e6edf3',
  padding: '4px 8px',
  fontSize: '12px',
  outline: 'none',
  cursor: 'pointer',
  width: '100%',
}

interface EditRow {
  typeFilter: AccountType | ''
  accountId: string
  toAccountId: string
  categoryId: string
  tagIds: string[]
}

export function RecentTransactions() {
  const { showToast } = useToast()
  const [transactions, setTransactions] = useState<TransactionRow[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editRow, setEditRow] = useState<EditRow | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/transactions?limit=5')
      const data = await res.json()
      setTransactions(data.data ?? [])
    } catch {
      // silently fail - non-critical
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    fetch('/api/accounts').then((r) => r.json()).then(setAccounts).catch(() => {})
    fetch('/api/categories').then((r) => r.json()).then(setCategories).catch(() => {})
    fetch('/api/tags').then((r) => r.json()).then(setTags).catch(() => {})
    const handler = () => load()
    window.addEventListener('transaction-saved', handler)
    return () => window.removeEventListener('transaction-saved', handler)
  }, [load])

  const activeAccounts = accounts.filter((a) => a.is_active === 1)

  function startEdit(tx: TransactionRow) {
    const cat = tx.category_id ? categories.find((c) => c.id === tx.category_id) : null
    const defaultAccountId = tx.type === 'expense'
      ? (activeAccounts.find((a) => a.id === '9773') ?? activeAccounts.find((a) => a.type === 'credit_card'))?.id ?? tx.account_id
      : tx.account_id
    setEditingId(tx.id)
    setEditRow({
      typeFilter: tx.type === 'expense' ? 'credit_card' : (accounts.find((a) => a.id === tx.account_id)?.type ?? ''),
      accountId: defaultAccountId,
      toAccountId: tx.to_account_id ?? '',
      categoryId: tx.category_id ?? '',
      tagIds: tx.tags.map((t) => t.id),
    })
  }

  function cancelEdit() {
    setEditingId(null)
    setEditRow(null)
  }

  async function patchTransaction(id: string, updates: Record<string, unknown>) {
    setSavingId(id)
    try {
      const res = await fetch(`/api/transactions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (res.ok) {
        showToast('Updated', 'success')
        load()
      } else {
        showToast('Failed to update', 'error')
      }
    } catch {
      showToast('Network error', 'error')
    } finally {
      setSavingId(null)
    }
  }

  async function changeType(tx: TransactionRow, newType: TxType) {
    if (newType === tx.type) return
    await patchTransaction(tx.id, { type: newType })
  }

  async function saveEdit(tx: TransactionRow) {
    if (!editRow) return
    const selectedAccount = accounts.find((a) => a.id === editRow.accountId)
    await patchTransaction(tx.id, {
      account_id: editRow.accountId,
      to_account_id: tx.type === 'transfer' ? (editRow.toAccountId || null) : null,
      category_id: tx.type === 'transfer' ? null : (editRow.categoryId || null),
      tag_ids: editRow.tagIds,
      payment_method: selectedAccount?.type ?? null,
    })
    setEditingId(null)
    setEditRow(null)
  }

  async function deleteTransaction(id: string) {
    if (!confirm('Delete this transaction?')) return
    setDeletingId(id)
    try {
      const res = await fetch(`/api/transactions/${id}`, { method: 'DELETE' })
      if (res.ok) {
        showToast('Transaction deleted', 'success')
        setTransactions((prev) => prev.filter((t) => t.id !== id))
      } else {
        showToast('Failed to delete', 'error')
      }
    } catch {
      showToast('Network error', 'error')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <section>
      <h2
        style={{
          color: '#8b949e', fontSize: '11px', fontWeight: 600,
          letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 12px',
        }}
      >
        Recent Transactions
      </h2>
      <div
        style={{
          background: '#161b22',
          border: '1px solid #30363d',
          borderRadius: '12px',
          overflow: 'hidden',
        }}
      >
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#8b949e', fontSize: '14px' }}>
            Loading...
          </div>
        ) : transactions.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#8b949e', fontSize: '14px' }}>
            No transactions yet. Add one above.
          </div>
        ) : (
          <>
            {transactions.map((tx) => {
              const isSaving = savingId === tx.id
              const isEditing = editingId === tx.id
              return (
                <div
                  key={tx.id}
                  data-tx-row
                  style={{
                    borderBottom: '1px solid #21262d',
                    opacity: isSaving ? 0.6 : 1,
                    transition: 'opacity 0.15s',
                  }}
                >
                  {/* Compact row */}
                  <div style={{ padding: '11px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div
                      style={{
                        width: '8px', height: '8px', borderRadius: '50%',
                        background: typeColor(tx.type), flexShrink: 0,
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ color: '#e6edf3', fontSize: '14px', fontWeight: 500 }}>
                          {tx.payee ?? tx.category_name ?? tx.account_name}
                        </span>
                        {tx.tags && tx.tags.length > 0 && (
                          <span style={{ color: '#8b949e', fontSize: '11px' }}>
                            {tx.tags.map((t) => t.name).join(', ')}
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '10px', marginTop: '2px', flexWrap: 'wrap' }}>
                        <span style={{ color: '#484f58', fontSize: '12px' }}>
                          {formatDatetime(tx.datetime)}
                        </span>
                        {tx.payment_method && (
                          <span style={{ color: '#8b949e', fontSize: '12px' }}>
                            {tx.payment_method as string}
                          </span>
                        )}
                        {tx.note && (
                          <span style={{ color: '#8b949e', fontSize: '12px', fontStyle: 'italic' }}>
                            {(tx.note as string).length > 50
                              ? (tx.note as string).slice(0, 50) + '...'
                              : tx.note as string}
                          </span>
                        )}
                      </div>
                    </div>
                    <span
                      style={{
                        fontSize: '14px', fontWeight: 600, flexShrink: 0,
                        color: typeColor(tx.type), textAlign: 'right',
                      }}
                    >
                      {formatAmount(tx)}
                    </span>
                    <button
                      onClick={() => isEditing ? cancelEdit() : startEdit(tx)}
                      disabled={isSaving}
                      style={{
                        background: 'none',
                        border: isEditing ? '1px solid #30363d' : 'none',
                        color: isEditing ? '#8b949e' : '#484f58',
                        cursor: isSaving ? 'not-allowed' : 'pointer',
                        padding: '3px 8px', fontSize: '12px', lineHeight: 1,
                        flexShrink: 0, borderRadius: '4px',
                        transition: 'color 0.1s',
                      }}
                    >
                      {isEditing ? 'Cancel' : 'Edit'}
                    </button>
                    <button
                      onClick={() => deleteTransaction(tx.id)}
                      disabled={deletingId === tx.id}
                      title="Delete transaction"
                      style={{
                        background: 'none', border: 'none',
                        color: '#484f58',
                        cursor: deletingId === tx.id ? 'not-allowed' : 'pointer',
                        padding: '4px 6px', fontSize: '16px', lineHeight: 1,
                        flexShrink: 0, borderRadius: '4px',
                        transition: 'color 0.1s',
                      }}
                      onMouseEnter={(e) => { if (deletingId !== tx.id) (e.currentTarget as HTMLElement).style.color = '#f85149' }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = '#484f58' }}
                    >
                      {deletingId === tx.id ? '...' : '×'}
                    </button>
                  </div>

                  {/* Type pills - always visible */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    paddingBottom: '10px', paddingLeft: '36px', paddingRight: '16px', flexWrap: 'wrap',
                  }}>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {(['expense', 'income', 'transfer'] as TxType[]).map((t) => (
                        <button
                          key={t}
                          type="button"
                          disabled={isSaving}
                          onClick={() => changeType(tx, t)}
                          style={pillStyle(tx.type === t, typeColor(t))}
                        >
                          {t.charAt(0).toUpperCase() + t.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Expanded edit form */}
                  {isEditing && editRow && (
                    <div style={{
                      padding: '12px 16px 12px 36px',
                      borderTop: '1px solid #21262d',
                      display: 'flex', flexDirection: 'column', gap: '8px',
                    }}>
                      <PaymentTypePicker
                        accounts={activeAccounts}
                        filterValue={editRow.typeFilter}
                        accountId={editRow.accountId}
                        onFilterChange={(f) => setEditRow((p) => p ? { ...p, typeFilter: f } : p)}
                        onAccountChange={(id) => setEditRow((p) => p ? { ...p, accountId: id } : p)}
                        selectStyle={compactSelect}
                        pillsContainerStyle={{ marginBottom: '4px' }}
                      />
                      {tx.type === 'transfer' ? (
                        <div>
                          <div style={{ color: '#8b949e', fontSize: '11px', marginBottom: '3px' }}>To Account</div>
                          <select
                            style={compactSelect}
                            value={editRow.toAccountId}
                            onChange={(e) => setEditRow((p) => p ? { ...p, toAccountId: e.target.value } : p)}
                          >
                            <option value="">Select destination…</option>
                            {activeAccounts
                              .filter((a) => a.id !== editRow.accountId)
                              .map((a) => (
                                <option key={a.id} value={a.id}>{a.name}</option>
                              ))}
                          </select>
                        </div>
                      ) : (
                        <CategoryPicker
                          categories={categories}
                          txType={tx.type}
                          categoryId={editRow.categoryId}
                          onChange={(cid) => setEditRow((p) => p ? { ...p, categoryId: cid } : p)}
                          inputStyle={compactSelect}
                        />
                      )}
                      {tags.length > 0 && (
                        <TagSelector
                          tags={tags}
                          categories={categories}
                          selectedIds={editRow.tagIds}
                          onChange={(ids) => setEditRow((p) => p ? { ...p, tagIds: ids } : p)}
                        />
                      )}
                      <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                        <button
                          onClick={() => saveEdit(tx)}
                          disabled={isSaving}
                          style={{
                            border: 'none', borderRadius: '6px',
                            cursor: isSaving ? 'not-allowed' : 'pointer',
                            fontSize: '12px', fontWeight: 500, padding: '5px 12px',
                            background: '#f0b429', color: '#0d1117',
                            opacity: isSaving ? 0.6 : 1,
                          }}
                        >
                          {isSaving ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          onClick={cancelEdit}
                          style={{
                            border: '1px solid #30363d', borderRadius: '6px', cursor: 'pointer',
                            fontSize: '12px', fontWeight: 500, padding: '5px 12px',
                            background: 'transparent', color: '#8b949e',
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
            <div style={{ padding: '10px 16px', textAlign: 'center' }}>
              <Link
                href="/transactions"
                style={{
                  color: '#8b949e', fontSize: '12px', textDecoration: 'none',
                  fontWeight: 500,
                }}
              >
                Show more →
              </Link>
            </div>
          </>
        )}
      </div>
    </section>
  )
}
