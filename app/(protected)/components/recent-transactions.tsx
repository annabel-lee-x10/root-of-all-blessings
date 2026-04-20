'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import type { TransactionRow, Account, TxType } from '@/lib/types'
import { useToast } from './toast'

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

const selectStyle: React.CSSProperties = {
  background: '#0d1117',
  border: '1px solid #30363d',
  borderRadius: '6px',
  color: '#e6edf3',
  padding: '2px 6px',
  fontSize: '11px',
  outline: 'none',
  cursor: 'pointer',
}

export function RecentTransactions() {
  const { showToast } = useToast()
  const [transactions, setTransactions] = useState<TransactionRow[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)

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
    const handler = () => load()
    window.addEventListener('transaction-saved', handler)
    return () => window.removeEventListener('transaction-saved', handler)
  }, [load])

  const activeAccounts = accounts.filter((a) => a.is_active === 1)

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

  async function changeAccount(tx: TransactionRow, newAccountId: string) {
    if (newAccountId === tx.account_id) return
    await patchTransaction(tx.id, { account_id: newAccountId })
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
              return (
                <div
                  key={tx.id}
                  data-tx-row
                  style={{
                    padding: '11px 16px',
                    borderBottom: '1px solid #21262d',
                    opacity: isSaving ? 0.6 : 1,
                    transition: 'opacity 0.15s',
                  }}
                >
                  {/* Top row: label + amount + delete */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
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

                  {/* Bottom row: type toggle + account selector */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    marginTop: '8px', paddingLeft: '20px', flexWrap: 'wrap',
                  }}>
                    {/* Type pills */}
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

                    {/* Account selector */}
                    <select
                      value={tx.account_id}
                      disabled={isSaving}
                      onChange={(e) => changeAccount(tx, e.target.value)}
                      style={selectStyle}
                    >
                      {activeAccounts.map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  </div>
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
