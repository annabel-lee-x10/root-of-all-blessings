'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useToast } from '../components/toast'
import type { Tag, Category } from '@/lib/types'

const BTN = { padding: '0.4rem 0.9rem', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500, minHeight: '44px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }
const BTN_PRI = { ...BTN, background: '#CC5500', color: '#0d1117' }
const BTN_SEC = { ...BTN, background: '#21262d', color: '#e6edf3', border: '1px solid #30363d' }
const BTN_DNG = { ...BTN, background: 'transparent', color: '#f85149', border: '1px solid #f85149' }
const BTN_WARN = { ...BTN, background: 'transparent', color: '#e3b341', border: '1px solid #e3b341' }
const INPUT = { padding: '0.45rem 0.7rem', borderRadius: '6px', border: '1px solid #30363d', background: '#0d1117', color: '#e6edf3', fontSize: '0.9rem', width: '100%', boxSizing: 'border-box' as const }
const SELECT = { ...INPUT, maxWidth: '100%' }
const CARD = { background: '#161b22', border: '1px solid #30363d', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '0.5rem' }

type TagWithMeta = Tag & { tx_count: number; category_id: string | null }

type SortOption = 'name_asc' | 'name_desc' | 'count_desc' | 'count_asc'
type FilterChip = 'all' | 'unused' | 'low' | 'high'

const SORT_KEY = 'tags.sort'
const FILTER_KEY = 'tags.filter'
const SORT_OPTIONS: SortOption[] = ['name_asc', 'name_desc', 'count_desc', 'count_asc']
const FILTER_CHIPS: FilterChip[] = ['all', 'unused', 'low', 'high']

const CHIP_BASE = { padding: '0.35rem 0.8rem', borderRadius: '999px', border: '1px solid #30363d', background: '#0d1117', color: '#e6edf3', fontSize: '0.8rem', cursor: 'pointer', minHeight: '36px' }
const CHIP_ACTIVE = { ...CHIP_BASE, background: '#CC5500', color: '#0d1117', border: '1px solid #CC5500', fontWeight: 600 }

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

export default function TagsPage() {
  const { showToast } = useToast()
  const isMobile = useMobile()
  const [tags, setTags] = useState<TagWithMeta[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sortOption, setSortOption] = useState<SortOption>('name_asc')
  const [filterChip, setFilterChip] = useState<FilterChip>('all')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [mergingId, setMergingId] = useState<string | null>(null)
  const [mergeOpenId, setMergeOpenId] = useState<string | null>(null)
  const [mergeTargetId, setMergeTargetId] = useState('')
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const [tagRes, statsRes, catRes] = await Promise.all([
        fetch('/api/tags'),
        fetch('/api/stats'),
        fetch('/api/categories'),
      ])
      const ts: (Tag & { category_id?: string | null })[] = await tagRes.json()
      const s = await statsRes.json()
      const cats: Category[] = await catRes.json()
      setCategories(cats)
      setTags(ts.map(t => ({
        ...t,
        tx_count: s.tags?.[t.id] ?? 0,
        category_id: t.category_id ?? null,
      })))
    } catch {
      showToast('Failed to load tags', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    try {
      const s = window.localStorage.getItem(SORT_KEY)
      if (s && (SORT_OPTIONS as string[]).includes(s)) setSortOption(s as SortOption)
      const f = window.localStorage.getItem(FILTER_KEY)
      if (f && (FILTER_CHIPS as string[]).includes(f)) setFilterChip(f as FilterChip)
    } catch {}
  }, [])

  function chooseSort(value: SortOption) {
    setSortOption(value)
    try { window.localStorage.setItem(SORT_KEY, value) } catch {}
  }

  function chooseFilter(value: FilterChip) {
    setFilterChip(value)
    try { window.localStorage.setItem(FILTER_KEY, value) } catch {}
  }

  const visible = (() => {
    let list = tags
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(t => t.name.toLowerCase().includes(q))
    }
    if (filterChip === 'unused') list = list.filter(t => t.tx_count === 0)
    else if (filterChip === 'low') list = list.filter(t => t.tx_count >= 1 && t.tx_count <= 5)
    else if (filterChip === 'high') list = list.filter(t => t.tx_count >= 6)

    const byNameAsc = (a: TagWithMeta, b: TagWithMeta) => a.name.localeCompare(b.name)
    const sorted = [...list]
    if (sortOption === 'name_asc') sorted.sort(byNameAsc)
    else if (sortOption === 'name_desc') sorted.sort((a, b) => b.name.localeCompare(a.name))
    else if (sortOption === 'count_desc') sorted.sort((a, b) => b.tx_count - a.tx_count || byNameAsc(a, b))
    else if (sortOption === 'count_asc') sorted.sort((a, b) => a.tx_count - b.tx_count || byNameAsc(a, b))
    return sorted
  })()

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
      showToast('Tag renamed', 'success')
      setEditingId(null)
      await load()
    } catch {
      showToast('Failed to rename tag', 'error')
    } finally {
      setSavingId(null)
    }
  }

  async function saveCategoryLink(id: string, categoryId: string | null) {
    try {
      const res = await fetch(`/api/tags/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category_id: categoryId }),
      })
      if (!res.ok) throw new Error()
      setTags(prev => prev.map(t => t.id === id ? { ...t, category_id: categoryId } : t))
      showToast('Category linked', 'success')
    } catch {
      showToast('Failed to link category', 'error')
    }
  }

  async function deleteTag(t: TagWithMeta) {
    const msg = t.tx_count > 0
      ? `Delete "${t.name}"? It will be removed from ${t.tx_count} transaction${t.tx_count !== 1 ? 's' : ''}.`
      : `Delete tag "${t.name}"?`
    if (!window.confirm(msg)) return
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

  async function mergeTag(fromId: string) {
    if (!mergeTargetId || mergeTargetId === fromId) return
    const fromTag = tags.find(t => t.id === fromId)
    const toTag = tags.find(t => t.id === mergeTargetId)
    if (!fromTag || !toTag) return
    const txNote = fromTag.tx_count > 0
      ? ` All ${fromTag.tx_count} transaction${fromTag.tx_count !== 1 ? 's' : ''} will be re-tagged.`
      : ''
    if (!window.confirm(`Merge "${fromTag.name}" → "${toTag.name}"?${txNote} "${fromTag.name}" will be deleted.`)) return
    setMergingId(fromId)
    try {
      const res = await fetch(`/api/tags/${fromId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'merge', into_id: mergeTargetId }),
      })
      if (!res.ok) throw new Error()
      showToast(`Merged into "${toTag.name}"`, 'success')
      setMergeOpenId(null)
      setMergeTargetId('')
      await load()
    } catch {
      showToast('Failed to merge tags', 'error')
    } finally {
      setMergingId(null)
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

  const expenseCategories = categories.filter(c => c.type === 'expense')

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
        style={{ ...INPUT, marginBottom: '0.6rem' }}
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search tags..."
      />

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.6rem', flexWrap: 'wrap' }}>
        <select
          data-testid="tag-sort-select"
          aria-label="Sort tags"
          style={{ ...SELECT, width: 'auto', minHeight: '36px', fontSize: '0.85rem' }}
          value={sortOption}
          onChange={e => chooseSort(e.target.value as SortOption)}
        >
          <option value="name_asc">Name A–Z</option>
          <option value="name_desc">Name Z–A</option>
          <option value="count_desc">Most used</option>
          <option value="count_asc">Least used</option>
        </select>
      </div>

      <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          data-testid="tag-filter-chip-all"
          aria-pressed={filterChip === 'all'}
          style={filterChip === 'all' ? CHIP_ACTIVE : CHIP_BASE}
          onClick={() => chooseFilter('all')}
        >All</button>
        <button
          type="button"
          data-testid="tag-filter-chip-unused"
          aria-pressed={filterChip === 'unused'}
          style={filterChip === 'unused' ? CHIP_ACTIVE : CHIP_BASE}
          onClick={() => chooseFilter('unused')}
        >Unused</button>
        <button
          type="button"
          data-testid="tag-filter-chip-low"
          aria-pressed={filterChip === 'low'}
          style={filterChip === 'low' ? CHIP_ACTIVE : CHIP_BASE}
          onClick={() => chooseFilter('low')}
        >1–5</button>
        <button
          type="button"
          data-testid="tag-filter-chip-high"
          aria-pressed={filterChip === 'high'}
          style={filterChip === 'high' ? CHIP_ACTIVE : CHIP_BASE}
          onClick={() => chooseFilter('high')}
        >6+</button>
      </div>

      {loading ? (
        <p style={{ color: '#8b949e' }}>Loading...</p>
      ) : visible.length === 0 ? (
        <p style={{ color: '#8b949e' }}>
          {tags.length === 0 ? 'No tags yet.' : 'No tags match these filters'}
        </p>
      ) : (
        <div data-testid="tags-list">
          {visible.map(t => (
            <div key={t.id} data-testid={`tag-card-${t.id}`} style={CARD}>
              {editingId === t.id ? (
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
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
                <div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                        <span data-testid="tag-name" style={{ color: '#e6edf3', fontWeight: 500 }}>{t.name}</span>
                        <Link
                          href={`/transactions?tag_id=${t.id}`}
                          style={{ fontSize: '0.78rem', color: '#8b949e', textDecoration: 'none' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.textDecoration = 'underline' }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.textDecoration = 'none' }}
                        >
                          {t.tx_count} transaction{t.tx_count !== 1 ? 's' : ''}
                        </Link>
                      </div>

                      <div style={{ marginTop: '0.4rem' }}>
                        <select
                          style={{ ...SELECT, width: 'auto', fontSize: '0.8rem', padding: '0.4rem 0.5rem', minHeight: '44px' }}
                          value={t.category_id ?? ''}
                          onChange={e => saveCategoryLink(t.id, e.target.value || null)}
                        >
                          <option value="">— no category link —</option>
                          {expenseCategories.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>

                      {mergeOpenId === t.id && (
                        <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '0.82rem', color: '#8b949e', flexShrink: 0 }}>Merge into:</span>
                          <select
                            style={{ ...SELECT, flex: 1, minWidth: 0, fontSize: '0.82rem', padding: '0.25rem 0.5rem' }}
                            value={mergeTargetId}
                            onChange={e => setMergeTargetId(e.target.value)}
                          >
                            <option value="">Select tag...</option>
                            {tags.filter(x => x.id !== t.id).sort((a, b) => a.name.localeCompare(b.name)).map(x => (
                              <option key={x.id} value={x.id}>{x.name}</option>
                            ))}
                          </select>
                          <button
                            style={BTN_WARN}
                            onClick={() => mergeTag(t.id)}
                            disabled={!mergeTargetId || mergingId === t.id}
                          >
                            {mergingId === t.id ? '...' : 'Merge'}
                          </button>
                          <button style={BTN_SEC} onClick={() => { setMergeOpenId(null); setMergeTargetId('') }}>✕</button>
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0, flexWrap: 'wrap' }}>
                      <button style={BTN_SEC} onClick={() => { setEditingId(t.id); setEditName(t.name) }}>Rename</button>
                      <button
                        style={mergeOpenId === t.id ? BTN_PRI : BTN_WARN}
                        onClick={() => {
                          if (mergeOpenId === t.id) { setMergeOpenId(null); setMergeTargetId('') }
                          else { setMergeOpenId(t.id); setMergeTargetId('') }
                        }}
                      >
                        Merge
                      </button>
                      <button
                        style={BTN_DNG}
                        onClick={() => deleteTag(t)}
                        disabled={deletingId === t.id}
                      >
                        {deletingId === t.id ? '...' : 'Delete'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
