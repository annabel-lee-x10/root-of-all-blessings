'use client'

import React, { useEffect, useState } from 'react'
import { useToast } from '../components/toast'
import type { Category, Tag } from '@/lib/types'

const BTN = { padding: '0.4rem 0.9rem', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500 }
const BTN_PRI = { ...BTN, background: 'var(--accent)', color: 'var(--bg)' }
const BTN_SEC = { ...BTN, background: 'var(--bg-dim)', color: 'var(--text)', border: '1px solid var(--border)' }
const BTN_DNG = { ...BTN, background: 'transparent', color: 'var(--red)', border: '1px solid var(--red)' }
const INPUT = { padding: '0.45rem 0.7rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: '0.9rem', width: '100%', boxSizing: 'border-box' as const }
const SELECT = { ...INPUT }
const CARD: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.85rem 1rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }

type Tab = 'expense' | 'income'
type SortBy = 'name-asc' | 'name-desc' | 'volume-desc' | 'volume-asc'
type CategoryWithCount = Category & { tx_count: number }
type TagWithCategory = Tag & { category_id: string | null }

export default function CategoriesPage() {
  const { showToast } = useToast()
  const [tab, setTab] = useState<Tab>('expense')
  const [categories, setCategories] = useState<CategoryWithCount[]>([])
  const [allTags, setAllTags] = useState<TagWithCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editType, setEditType] = useState<Tab>('expense')
  const [editParentId, setEditParentId] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newParentId, setNewParentId] = useState('')
  const [creating, setCreating] = useState(false)
  const [sortBy, setSortBy] = useState<SortBy>('name-asc')
  const [search, setSearch] = useState('')

  async function load() {
    setLoading(true)
    try {
      const [catRes, statsRes, tagRes] = await Promise.all([
        fetch('/api/categories'),
        fetch('/api/stats'),
        fetch('/api/tags'),
      ])
      const cats: Category[] = await catRes.json()
      const s = await statsRes.json()
      const ts: (Tag & { category_id?: string | null })[] = await tagRes.json()
      setCategories(cats.map(c => ({ ...c, tx_count: s.categories?.[c.id] ?? 0 })))
      setAllTags(ts.map(t => ({ ...t, category_id: t.category_id ?? null })))
    } catch {
      showToast('Failed to load categories', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const topLevel = categories
    .filter(c => c.type === tab && c.parent_id == null)
    .filter(c => !search.trim() || c.name.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'name-asc') return a.name.localeCompare(b.name)
      if (sortBy === 'name-desc') return b.name.localeCompare(a.name)
      if (sortBy === 'volume-desc') return b.tx_count - a.tx_count
      if (sortBy === 'volume-asc') return a.tx_count - b.tx_count
      return 0
    })

  const subcatsByParent = new Map<string, CategoryWithCount[]>()
  for (const c of categories.filter(x => x.type === tab && x.parent_id != null)) {
    const pid = c.parent_id!
    if (!subcatsByParent.has(pid)) subcatsByParent.set(pid, [])
    subcatsByParent.get(pid)!.push(c)
  }

  function startEdit(c: CategoryWithCount) {
    setEditingId(c.id)
    setEditName(c.name)
    setEditType(c.type as Tab)
    setEditParentId(c.parent_id ?? null)
  }

  async function saveEdit(id: string) {
    setSavingId(id)
    try {
      const res = await fetch(`/api/categories/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim(), type: editType, parent_id: editParentId }),
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

  async function createCategory() {
    if (!newName.trim()) { showToast('Name is required', 'error'); return }
    setCreating(true)
    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), type: tab, sort_order: 0, parent_id: newParentId || null }),
      })
      if (!res.ok) throw new Error()
      showToast('Category created', 'success')
      setShowCreate(false)
      setNewName('')
      setNewParentId('')
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

  // Group tags by their linked category_id
  const tagsByCategory: Record<string, TagWithCategory[]> = {}
  for (const t of allTags) {
    if (t.category_id) {
      if (!tagsByCategory[t.category_id]) tagsByCategory[t.category_id] = []
      tagsByCategory[t.category_id].push(t)
    }
  }

  return (
    <main style={{ padding: '1.5rem', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.4rem', color: 'var(--text)' }}>Categories</h1>
        <button style={BTN_PRI} onClick={() => { setShowCreate(v => !v); setNewName(''); setNewParentId('') }}>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
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
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <label style={{ color: 'var(--text-muted)', fontSize: '0.8rem', flexShrink: 0 }}>Parent (optional):</label>
              <select
                style={{ ...SELECT, flex: 1 }}
                value={newParentId}
                onChange={e => setNewParentId(e.target.value)}
              >
                <option value="">None (top-level)</option>
                {categories.filter(c => c.type === tab && c.parent_id == null).map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Sort + search controls */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
          <input
            style={{ ...INPUT, flex: '1 1 180px', minWidth: 0 }}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search categories..."
          />
          <select
            style={{ ...SELECT, flex: '0 0 auto', width: 'auto' }}
            value={sortBy}
            onChange={e => setSortBy(e.target.value as SortBy)}
          >
            <option value="name-asc">Name A-Z</option>
            <option value="name-desc">Name Z-A</option>
            <option value="volume-desc">Volume high-low</option>
            <option value="volume-asc">Volume low-high</option>
          </select>
        </div>

        {loading ? (
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>Loading...</p>
        ) : topLevel.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>No {tab} categories{search ? ' match.' : ' yet.'}</p>
        ) : (
          topLevel.map(c => (
            <React.Fragment key={c.id}>
              {/* Top-level card */}
              <div style={CARD}>
                {editingId === c.id ? (
                  <div style={{ flex: 1, display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <input style={{ ...INPUT, flex: 1 }} value={editName} onChange={e => setEditName(e.target.value)} autoFocus onKeyDown={e => e.key === 'Enter' && saveEdit(c.id)} />
                    <select style={{ ...SELECT, width: 'auto' }} value={editType} onChange={e => setEditType(e.target.value as Tab)}>
                      <option value="expense">Expense</option>
                      <option value="income">Income</option>
                    </select>
                    <select
                      style={{ ...SELECT, width: 'auto' }}
                      value={editParentId ?? ''}
                      onChange={e => setEditParentId(e.target.value || null)}
                    >
                      <option value="">None (top-level)</option>
                      {categories.filter(x => x.type === editType && x.parent_id == null && x.id !== editingId).map(x => (
                        <option key={x.id} value={x.id}>{x.name}</option>
                      ))}
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

              {/* Subcategories — indented */}
              {(subcatsByParent.get(c.id) ?? []).map(sub => (
                <div key={sub.id} style={{ ...CARD, marginLeft: '1.5rem', background: 'var(--bg-dim)', border: '1px dashed var(--border)' }}>
                  {editingId === sub.id ? (
                    <div style={{ flex: 1, display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                      <input style={{ ...INPUT, flex: 1 }} value={editName} onChange={e => setEditName(e.target.value)} autoFocus onKeyDown={e => e.key === 'Enter' && saveEdit(sub.id)} />
                      <select style={{ ...SELECT, width: 'auto' }} value={editType} onChange={e => setEditType(e.target.value as Tab)}>
                        <option value="expense">Expense</option>
                        <option value="income">Income</option>
                      </select>
                      <select
                        style={{ ...SELECT, width: 'auto' }}
                        value={editParentId ?? ''}
                        onChange={e => setEditParentId(e.target.value || null)}
                      >
                        <option value="">None (top-level)</option>
                        {categories.filter(x => x.type === editType && x.parent_id == null && x.id !== sub.id).map(x => (
                          <option key={x.id} value={x.id}>{x.name}</option>
                        ))}
                      </select>
                      <button style={BTN_PRI} onClick={() => saveEdit(sub.id)} disabled={savingId === sub.id}>
                        {savingId === sub.id ? '...' : 'Save'}
                      </button>
                      <button style={BTN_SEC} onClick={() => setEditingId(null)}>Cancel</button>
                    </div>
                  ) : (
                    <>
                      <div style={{ flex: 1 }}>
                        <span style={{ color: '#c9d1d9', fontWeight: 400 }}>{sub.name}</span>
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginLeft: '0.6rem' }}>
                          {sub.tx_count} transaction{sub.tx_count !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <button style={BTN_SEC} onClick={() => startEdit(sub)}>Edit</button>
                        <button style={BTN_DNG} onClick={() => deleteCategory(sub)} disabled={deletingId === sub.id}>
                          {deletingId === sub.id ? '...' : 'Delete'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </React.Fragment>
          ))
        )}
      </div>
    </main>
  )
}
