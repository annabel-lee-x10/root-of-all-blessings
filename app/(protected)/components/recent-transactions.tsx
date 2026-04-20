'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import type { TransactionRow } from '@/lib/types'
import { useToast } from './toast'

function formatAmount(row: TransactionRow) {
  const prefix = row.type === 'expense' ? '-' : row.type === 'income' ? '+' : ''
  if (row.currency !== 'SGD' && row.sgd_equivalent != null) {
    return `${prefix}${row.currency} ${(row.amount as number).toFixed(2)} (SGD ${(row.sgd_equivalent as number).toFixed(2)})`
  }
  return `${prefix}SGD ${(row.amount as number).toFixed(2)}`
}

function typeColor(type: string) {
  if (type === 'expense') return 'var(--red)'
  if (type === 'income') return 'var(--green)'
  return 'var(--text-muted)'
}

function formatDatetime(iso: string) {
  return new Date(iso).toLocaleString('en-SG', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
    hour12: false,
  })
}

export function RecentTransactions() {
  const { showToast } = useToast()
  const [transactions, setTransactions] = useState<TransactionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)

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
    const handler = () => load()
    window.addEventListener('transaction-saved', handler)
    return () => window.removeEventListener('transaction-saved', handler)
  }, [load])

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
          color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600,
          letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 12px',
        }}
      >
        Recent Transactions
      </h2>
      <div
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          overflow: 'hidden',
        }}
      >
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px' }}>
            Loading...
          </div>
        ) : transactions.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px' }}>
            No transactions yet. Add one above.
          </div>
        ) : (
          <>
            {transactions.map((tx) => (
              <div
                key={tx.id}
                data-tx-row
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '11px 16px',
                  borderBottom: '1px solid var(--bg-dim)',
                }}
              >
                <div
                  style={{
                    width: '8px', height: '8px', borderRadius: '50%',
                    background: typeColor(tx.type), flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ color: 'var(--text)', fontSize: '14px', fontWeight: 500 }}>
                      {tx.payee ?? tx.category_name ?? tx.account_name}
                    </span>
                    {tx.tags && tx.tags.length > 0 && (
                      <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                        {tx.tags.map((t) => t.name).join(', ')}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '10px', marginTop: '2px', flexWrap: 'wrap' }}>
                    <span style={{ color: 'var(--text-dim)', fontSize: '12px' }}>
                      {formatDatetime(tx.datetime)}
                    </span>
                    <span style={{ color: 'var(--text-dim)', fontSize: '12px' }}>
                      {tx.type === 'transfer'
                        ? `${tx.account_name} → ${tx.to_account_name ?? ''}`
                        : tx.account_name}
                    </span>
                    {tx.payment_method && (
                      <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                        {tx.payment_method as string}
                      </span>
                    )}
                    {tx.note && (
                      <span style={{ color: 'var(--text-muted)', fontSize: '12px', fontStyle: 'italic' }}>
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
                    color: 'var(--text-dim)',
                    cursor: deletingId === tx.id ? 'not-allowed' : 'pointer',
                    padding: '4px 6px', fontSize: '16px', lineHeight: 1,
                    flexShrink: 0, borderRadius: '4px',
                    transition: 'color 0.1s',
                  }}
                  onMouseEnter={(e) => { if (deletingId !== tx.id) (e.currentTarget as HTMLElement).style.color = 'var(--red)' }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-dim)' }}
                >
                  {deletingId === tx.id ? '...' : '×'}
                </button>
              </div>
            ))}
            <div style={{ padding: '10px 16px', textAlign: 'center' }}>
              <Link
                href="/transactions"
                style={{
                  color: 'var(--text-muted)', fontSize: '12px', textDecoration: 'none',
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
