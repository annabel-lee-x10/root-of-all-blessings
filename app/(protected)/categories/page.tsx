'use client'

import { useEffect, useState } from 'react'
import { useToast } from '../components/toast'
import type { Category } from '@/lib/types'

const BTN = { padding: '0.4rem 0.9rem', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500 }
const BTN_PRI = { ...BTN, background: 'var(--accent)', color: 'var(--bg)' }
const BTN_SEC = { ...BTN, background: '#21262d', color: 'var(--text)', border: '1px solid var(--border)' }
const BTN_DNG = { ...BTN, background: 'transparent', color: '#f85149', border: '1px solid #f85149' }
const BTN_ICON = { ...BTN_SEC, padding: '0.3rem 0.6rem', fontSize: '0.85rem' }
const INPUT = { padding: '0.45rem 0.7rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: '0.9rem', width: '100%', boxSizing: 'border-box' as const }
const SELECT = { ...INPUT }
const CARD = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.85rem 1rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }

type Tab = 'expense' | 'income'
type CategoryWithCount = Category & { tx_count: number }

export default function CategoriesPage() {
  const { showToast } = useToast()
  const [tab, setTab] = useState<Tab>('expense')
  const [categories, setCategories] = useState<CategoryWithCount[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editType, setEditType] = useState<Tab>('expense')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [movingId, setMovingId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const [catRes, statsRes] = await Promise.all([
        fetch('/api/categories'),
        fetch('/api/stats'),
      ])
      const cats: Category[] = await catRes.json()
      const s = await statsRes.json()
      setCategories(cats.map(c => ({ ...c, tx_count: s.categories?.[c.id] ?? 0 })))
    } catch {
      showToast('Failed to load categories', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const visible = categories
    .filter(c => c.type === tab)
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))

  function startEdit(c: CategoryWithCount) {
    setEditingId(c.id)
    setEditName(c.name)
    setEditType(c.type as Tab)
  }

  async function saveEdit(id: string) {
    setSavingId(id)
    try {
      const res = await fetch(`/api/categories/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim(), type: editType }),
      })
      if (!res.ok) throw new Error()
      showToast('Category updated', 'success')
      setEditingId(null)
      await load()
    } catch {
      showToast('Failed to update category', 'error')
    } finally {
      setSavingId(null)
    }
  }

  async function deleteCategory(c: CategoryWithCount) {
    if (c.tx_count > 0) {
      showToast(`Cannot delete - ${c.tx_count} transaction${c.tx_count !== 1 ? 's' : ''} use this category`, 'error')
      return
    }
    if (!window.confirm(`Delete "${c.name}"?`)) return
    setDeletingId(c.id)
    try {
      const res = await fetch(`/api/categories/${c.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      showToast('Category deleted', 'success')
      await load()
    } catch {
      showToast('Failed to delete category', 'error')
    } finally {
      setDeletingId(null)
    }
  }

  async function move(c: CategoryWithCount, dir: 'up' | 'down') {
    const list = visible
    const idx = list.findIndex(x => x.id === c.id)
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= list.length) return
    const swap = list[swapIdx]
    setMovingId(c.id)
    try {
      await Promise.all([
        fetch(`/api/categories/${c.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sort_order: swap.sort_order }),
        }),
        fetch(`/api/categories/${swap.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sort_order: c.sort_order }),
        }),
      ])
      await load()
    } catch {
      showToast('Failed to reorder', 'error')
    } finally {
      setMovingId(null)
    }
  }

  async function createCategory() {
    if (!newName.trim()) { showToast('Name is required', 'error'); return }
    const maxOrder = visible.length > 0 ? Math.max(...visible.map(c => c.sort_order)) + 1 : 0
    setCreating(true)
    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), type: tab, sort_order: maxOrder }),
      })
      if (!res.ok) throw new Error()
      showToast('Category created', 'success')
      setShowCreate(false)
      setNewName('')
      await load()
    } catch {
      showToast('Failed to create category', 'error')
    } finally {
      setCreating(false)
    }
  }

  const TAB_STYLE = (active: boolean): React.CSSProperties => ({
    padding: '0.5rem 1.25rem',
    borderRadius: '6px 6px 0 0',
    border: '1px solid var(--border)',
    borderBottom: active ? '1px solid var(--bg-card)' : '1px solid var(--border)',
    background: active ? 'var(--bg-card)' : 'transparent',
    color: active ? 'var(--text)' : 'var(--text-muted)',
    cursor: 'pointer',
    fontSize: '0.9rem',
    fontWeight: active ? 600 : 400,
    marginRight: '2px',
    marginBottom: '-1px',
  })

  return (
    <main style={{ padding: '1.5rem', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.4rem', color: 'var(--text)' }}>Categories</h1>
        <button style={BTN_PRI} onClick={() => { setShowCreate(v => !v); setNewName('') }}>
          {showCreate ? 'Cancel' : '+ New Category'}
        </button>
      </div>

      <div style={{ display: 'flex', marginBottom: 0 }}>
        <button style={TAB_STYLE(tab === 'expense')} onClick={() => { setTab('expense'); setShowCreate(false) }}>
          Expense
        </button>
        <button style={TAB_STYLE(tab === 'income')} onClick={() => { setTab('income'); setShowCreate(false) }}>
          Income
        </button>
      </div>

      <div style={{ border: '1px solid var(--border)', borderRadius: '0 6px 6px 6px', padding: '1.25rem', background: 'var(--bg-card)' }}>
        {showCreate && (
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            <input
              style={{ ...INPUT, flex: 1 }}
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder={`New ${tab} category name`}
              onKeyDown={e => e.key === 'Enter' && createCategory()}
              autoFocus
            />
            <button style={BTN_PRI} onClick={createCategory} disabled={creating}>
              {creating ? 'Adding...' : 'Add'}
            </button>
          </div>
        )}

        {loading ? (
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>Loading...</p>
        ) : visible.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>No {tab} categories yet.</p>
        ) : (
          visible.map((c, idx) => (
            <div key={c.id} style={CARD}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <button style={BTN_ICON} onClick={() => move(c, 'up')} disabled={idx === 0 || movingId === c.id} title="Move up">^</button>
                <button style={BTN_ICON} onClick={() => move(c, 'down')} disabled={idx === visible.length - 1 || movingId === c.id} title="Move down">v</button>
              </div>

              {editingId === c.id ? (
                <div style={{ flex: 1, display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input style={{ ...INPUT, flex: 1 }} value={editName} onChange={e => setEditName(e.target.value)} autoFocus onKeyDown={e => e.key === 'Enter' && saveEdit(c.id)} />
                  <select style={{ ...SELECT, width: 'auto' }} value={editType} onChange={e => setEditType(e.target.value as Tab)}>
                    <option value="expense">Expense</option>
                    <option value="income">Income</option>
                  </select>
                  <button style={BTN_PRI} onClick={() => saveEdit(c.id)} disabled={savingId === c.id}>
                    {savingId === c.id ? '...' : 'Save'}
                  </button>
                  <button style={BTN_SEC} onClick={() => setEditingId(null)}>Cancel</button>
                </div>
              ) : (
                <>
                  <div style={{ flex: 1 }}>
                    <span style={{ color: 'var(--text)', fontWeight: 500 }}>{c.name}</span>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginLeft: '0.6rem' }}>
                      {c.tx_count} transaction{c.tx_count !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <button style={BTN_SEC} onClick={() => startEdit(c)}>Edit</button>
                    <button
                      style={BTN_DNG}
                      onClick={() => deleteCategory(c)}
                      disabled={deletingId === c.id}
                      title={c.tx_count > 0 ? `${c.tx_count} transactions use this category` : 'Delete'}
                    >
                      {deletingId === c.id ? '...' : 'Delete'}
                    </button>
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </div>
    </main>
  )
}
