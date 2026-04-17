'use client'

import { useState, useEffect, useCallback } from 'react'
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

export function RecentTransactions() {
  const { showToast } = useToast()
  const [transactions, setTransactions] = useState<TransactionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/transactions?limit=20')
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
          transactions.map((tx, i) => (
            <div
              key={tx.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '11px 16px',
                borderBottom: i < transactions.length - 1 ? '1px solid #21262d' : 'none',
              }}
            >
              {/* Type indicator */}
              <div
                style={{
                  width: '8px', height: '8px', borderRadius: '50%',
                  background: typeColor(tx.type), flexShrink: 0,
                }}
              />

              {/* Main info */}
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
                  <span style={{ color: '#484f58', fontSize: '12px' }}>
                    {tx.type === 'transfer'
                      ? `${tx.account_name} → ${tx.to_account_name ?? ''}`
                      : tx.account_name}
                  </span>
                  {tx.note && (
                    <span style={{ color: '#8b949e', fontSize: '12px', fontStyle: 'italic' }}>
                      {(tx.note as string).length > 50
                        ? (tx.note as string).slice(0, 50) + '...'
                        : tx.note as string}
                    </span>
                  )}
                </div>
              </div>

              {/* Amount */}
              <span
                style={{
                  fontSize: '14px', fontWeight: 600, flexShrink: 0,
                  color: typeColor(tx.type), textAlign: 'right',
                }}
              >
                {formatAmount(tx)}
              </span>

              {/* Delete */}
              <button
                onClick={() => deleteTransaction(tx.id)}
                disabled={deletingId === tx.id}
                title="Delete transaction"
                style={{
                  background: 'none', border: 'none',
                  color: deletingId === tx.id ? '#484f58' : '#484f58',
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
          ))
        )}
      </div>
    </section>
  )
}
