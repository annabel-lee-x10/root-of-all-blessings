'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useToast } from '../components/toast'
import type { Account } from '@/lib/types'

const BTN = { padding: '0.4rem 0.9rem', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500, minHeight: '44px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }
const BTN_PRI = { ...BTN, background: 'var(--accent)', color: 'var(--bg)' }
const BTN_SEC = { ...BTN, background: 'var(--bg-dim)', color: 'var(--text)', border: '1px solid var(--border)' }
const BTN_DNG = { ...BTN, background: 'transparent', color: 'var(--red)', border: '1px solid var(--red)' }
const INPUT = { padding: '0.45rem 0.7rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: '0.9rem', width: '100%', boxSizing: 'border-box' as const }
const SELECT = { ...INPUT, maxWidth: '100%' }
const CARD = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px', padding: '1.25rem 1.5rem', marginBottom: '1rem' }

const TYPE_ORDER = ['bank', 'wallet', 'cash', 'fund'] as const
const TYPE_LABEL: Record<string, string> = { bank: 'Bank', wallet: 'Wallet', cash: 'Cash', fund: 'Fund' }
const CURRENCIES = ['SGD', 'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'HKD', 'MYR', 'THB']

type AccountWithCount = Account & { tx_count: number }

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

function groupByType(accounts: AccountWithCount[]) {
  const groups: Record<string, AccountWithCount[]> = {}
  for (const t of TYPE_ORDER) groups[t] = []
  for (const a of accounts) {
    if (groups[a.type]) groups[a.type].push(a)
    else groups[a.type] = [a]
  }
  return groups
}

export default function AccountsPage() {
  const { showToast } = useToast()
  const isMobile = useMobile()
  const [accounts, setAccounts] = useState<AccountWithCount[]>([])
  const [stats, setStats] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editType, setEditType] = useState('')
  const [editCurrency, setEditCurrency] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState('bank')
  const [newCurrency, setNewCurrency] = useState('SGD')
  const [creating, setCreating] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const [accRes, statsRes] = await Promise.all([
        fetch('/api/accounts'),
        fetch('/api/stats'),
      ])
      const accs: Account[] = await accRes.json()
      const s = await statsRes.json()
      setStats(s.accounts ?? {})
      setAccounts(accs.map(a => ({ ...a, tx_count: s.accounts?.[a.id] ?? 0 })))
    } catch {
      showToast('Failed to load accounts', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function startEdit(a: AccountWithCount) {
    setEditingId(a.id)
    setEditName(a.name)
    setEditType(a.type)
    setEditCurrency(a.currency)
  }

  function cancelEdit() {
    setEditingId(null)
  }

  async function saveEdit(id: string) {
    setSavingId(id)
    try {
      const res = await fetch(`/api/accounts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName, type: editType, currency: editCurrency }),
      })
      if (!res.ok) throw new Error()
      showToast('Account updated', 'success')
      setEditingId(null)
      await load()
    } catch {
      showToast('Failed to update account', 'error')
    } finally {
      setSavingId(null)
    }
  }

  async function toggleActive(a: AccountWithCount) {
    if (a.is_active && !window.confirm(`Deactivate "${a.name}"? It will be hidden from quick entry.`)) return
    setTogglingId(a.id)
    try {
      const res = await fetch(`/api/accounts/${a.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: a.is_active ? 0 : 1 }),
      })
      if (!res.ok) throw new Error()
      showToast(a.is_active ? 'Account deactivated' : 'Account reactivated', 'success')
      await load()
    } catch {
      showToast('Failed to update account', 'error')
    } finally {
      setTogglingId(null)
    }
  }

  async function createAccount() {
    if (!newName.trim()) { showToast('Name is required', 'error'); return }
    setCreating(true)
    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), type: newType, currency: newCurrency }),
      })
      if (!res.ok) throw new Error()
      showToast('Account created', 'success')
      setShowCreate(false)
      setNewName('')
      setNewType('bank')
      setNewCurrency('SGD')
      await load()
    } catch {
      showToast('Failed to create account', 'error')
    } finally {
      setCreating(false)
    }
  }

  const groups = groupByType(accounts)

  return (
    <main style={{ padding: '1.5rem', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.4rem', color: 'var(--text)' }}>Accounts</h1>
        <button style={BTN_PRI} onClick={() => setShowCreate(v => !v)}>
          {showCreate ? 'Cancel' : '+ New Account'}
        </button>
      </div>

      {showCreate && (
        <div style={{ ...CARD, marginBottom: '1.5rem', borderColor: 'var(--accent)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
            <div>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.3rem' }}>Name</label>
              <input
                style={INPUT}
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="e.g. DBS Chequing"
                onKeyDown={e => e.key === 'Enter' && createAccount()}
                autoFocus
              />
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.3rem' }}>Type</label>
              <select style={SELECT} value={newType} onChange={e => setNewType(e.target.value)}>
                {TYPE_ORDER.map(t => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.3rem' }}>Currency</label>
              <select style={SELECT} value={newCurrency} onChange={e => setNewCurrency(e.target.value)}>
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <button style={BTN_PRI} onClick={createAccount} disabled={creating}>
            {creating ? 'Creating...' : 'Create Account'}
          </button>
        </div>
      )}

      {loading ? (
        <p style={{ color: 'var(--text-muted)' }}>Loading...</p>
      ) : (
        TYPE_ORDER.map(type => {
          const group = groups[type] ?? []
          if (group.length === 0) return null
          return (
            <div key={type} style={{ marginBottom: '2rem' }}>
              <h2 style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>
                {TYPE_LABEL[type]}
              </h2>
              {group.map(a => (
                <div key={a.id} style={{ ...CARD, opacity: a.is_active ? 1 : 0.55 }}>
                  {editingId === a.id ? (
                    <div>
                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                        <div>
                          <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.3rem' }}>Name</label>
                          <input style={INPUT} value={editName} onChange={e => setEditName(e.target.value)} autoFocus />
                        </div>
                        <div>
                          <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.3rem' }}>Type</label>
                          <select style={SELECT} value={editType} onChange={e => setEditType(e.target.value)}>
                            {TYPE_ORDER.map(t => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
                          </select>
                        </div>
                        <div>
                          <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.3rem' }}>Currency</label>
                          <select style={SELECT} value={editCurrency} onChange={e => setEditCurrency(e.target.value)}>
                            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button style={BTN_PRI} onClick={() => saveEdit(a.id)} disabled={savingId === a.id}>
                          {savingId === a.id ? 'Saving...' : 'Save'}
                        </button>
                        <button style={BTN_SEC} onClick={cancelEdit}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                          <span style={{ fontWeight: 600, color: 'var(--text)' }}>{a.name}</span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', background: 'var(--bg-dim)', padding: '0.1rem 0.5rem', borderRadius: '4px' }}>{a.currency}</span>
                          {!a.is_active && (
                            <span style={{ fontSize: '0.72rem', color: 'var(--red)', background: 'var(--red-faint)', padding: '0.1rem 0.5rem', borderRadius: '4px' }}>inactive</span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
                          <Link
                            href={`/transactions?account_id=${a.id}`}
                            style={{ color: 'var(--text-muted)', textDecoration: 'none' }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.textDecoration = 'underline' }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.textDecoration = 'none' }}
                          >
                            {a.tx_count} transaction{a.tx_count !== 1 ? 's' : ''}
                          </Link>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button style={BTN_SEC} onClick={() => startEdit(a)}>Edit</button>
                        <button
                          style={a.is_active ? BTN_DNG : { ...BTN_SEC, color: 'var(--green)', borderColor: 'var(--green)' }}
                          onClick={() => toggleActive(a)}
                          disabled={togglingId === a.id}
                        >
                          {togglingId === a.id ? '...' : a.is_active ? 'Deactivate' : 'Reactivate'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        })
      )}
    </main>
  )
}
