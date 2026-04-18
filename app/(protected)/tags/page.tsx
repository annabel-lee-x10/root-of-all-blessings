'use client'

import { useEffect, useState } from 'react'
import { useToast } from '../components/toast'
import type { Tag } from '@/lib/types'

const BTN = { padding: '0.4rem 0.9rem', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500 }
const BTN_PRI = { ...BTN, background: '#f0b429', color: '#0d1117' }
const BTN_SEC = { ...BTN, background: '#21262d', color: '#e6edf3', border: '1px solid #30363d' }
const BTN_DNG = { ...BTN, background: 'transparent', color: '#f85149', border: '1px solid #f85149' }
const INPUT = { padding: '0.45rem 0.7rem', borderRadius: '6px', border: '1px solid #30363d', background: '#0d1117', color: '#e6edf3', fontSize: '0.9rem', width: '100%', boxSizing: 'border-box' as const }

type TagWithCount = Tag & { tx_count: number }

export default function TagsPage() {
  const { showToast } = useToast()
  const [tags, setTags] = useState<TagWithCount[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const [tagRes, statsRes] = await Promise.all([
        fetch('/api/tags'),
        fetch('/api/stats'),
      ])
      const ts: Tag[] = await tagRes.json()
      const s = await statsRes.json()
      setTags(ts.map(t => ({ ...t, tx_count: s.tags?.[t.id] ?? 0 })))
    } catch {
      showToast('Failed to load tags', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const visible = tags.filter(t =>
    !search.trim() || t.name.toLowerCase().includes(search.trim().toLowerCase())
  )

  async function saveEdit(id: string) {
    if (!editName.trim()) return
    setSavingId(id)
    try {
      const res = await fetch(`/api/tags/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim() }),
      })
      if (!res.ok) throw new Error()
      showToast('Tag updated', 'success')
      setEditingId(null)
      await load()
    } catch {
      showToast('Failed to update tag', 'error')
    } finally {
      setSavingId(null)
    }
  }

  async function deleteTag(t: TagWithCount) {
    if (t.tx_count > 0) {
      showToast(`Cannot delete - ${t.tx_count} transaction${t.tx_count !== 1 ? 's' : ''} use this tag`, 'error')
      return
    }
    if (!window.confirm(`Delete tag "${t.name}"?`)) return
    setDeletingId(t.id)
    try {
      const res = await fetch(`/api/tags/${t.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      showToast('Tag deleted', 'success')
      await load()
    } catch {
      showToast('Failed to delete tag', 'error')
    } finally {
      setDeletingId(null)
    }
  }

  async function createTag() {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const res = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      })
      if (!res.ok) throw new Error()
      showToast('Tag created', 'success')
      setNewName('')
      await load()
    } catch {
      showToast('Failed to create tag', 'error')
    } finally {
      setCreating(false)
    }
  }

  return (
    <main style={{ padding: '1.5rem', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.4rem', color: '#e6edf3' }}>Tags</h1>
        <span style={{ fontSize: '0.85rem', color: '#8b949e' }}>{tags.length} total</span>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
        <input
          style={{ ...INPUT, flex: 1 }}
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder="New tag name"
          onKeyDown={e => e.key === 'Enter' && createTag()}
        />
        <button style={BTN_PRI} onClick={createTag} disabled={creating || !newName.trim()}>
          {creating ? 'Adding...' : '+ Add'}
        </button>
      </div>

      <input
        style={{ ...INPUT, marginBottom: '1rem' }}
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search tags..."
      />

      {loading ? (
        <p style={{ color: '#8b949e' }}>Loading...</p>
      ) : visible.length === 0 ? (
        <p style={{ color: '#8b949e' }}>{search ? 'No tags match.' : 'No tags yet.'}</p>
      ) : (
        <div>
          {visible.map(t => (
            <div
              key={t.id}
              style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}
            >
              {editingId === t.id ? (
                <div style={{ flex: 1, display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input
                    style={{ ...INPUT, flex: 1 }}
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveEdit(t.id); if (e.key === 'Escape') setEditingId(null) }}
                    autoFocus
                  />
                  <button style={BTN_PRI} onClick={() => saveEdit(t.id)} disabled={savingId === t.id}>
                    {savingId === t.id ? '...' : 'Save'}
                  </button>
                  <button style={BTN_SEC} onClick={() => setEditingId(null)}>Cancel</button>
                </div>
              ) : (
                <>
                  <div style={{ flex: 1 }}>
                    <span style={{ color: '#e6edf3', fontWeight: 500 }}>{t.name}</span>
                    <span style={{ fontSize: '0.78rem', color: '#8b949e', marginLeft: '0.6rem' }}>
                      {t.tx_count} transaction{t.tx_count !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <button
                      style={BTN_SEC}
                      onClick={() => { setEditingId(t.id); setEditName(t.name) }}
                    >
                      Edit
                    </button>
                    <button
                      style={BTN_DNG}
                      onClick={() => deleteTag(t)}
                      disabled={deletingId === t.id}
                      title={t.tx_count > 0 ? `${t.tx_count} transactions use this tag` : 'Delete'}
                    >
                      {deletingId === t.id ? '...' : 'Delete'}
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
