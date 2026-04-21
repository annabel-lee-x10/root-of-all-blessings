'use client'

import type { Category, TxType } from '@/lib/types'

interface CategoryPickerProps {
  categories: Category[]
  txType: TxType
  parentId: string
  categoryId: string
  onParentChange: (pid: string) => void
  onCategoryChange: (cid: string) => void
  selectStyle?: React.CSSProperties
}

const DEFAULT_SELECT: React.CSSProperties = {
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: '6px',
  color: 'var(--text)',
  fontSize: '13px',
  padding: '6px 10px',
  outline: 'none',
  width: '100%',
  cursor: 'pointer',
}

export function CategoryPicker({
  categories,
  txType,
  parentId,
  categoryId,
  onParentChange,
  onCategoryChange,
  selectStyle,
}: CategoryPickerProps) {
  const sel = selectStyle ?? DEFAULT_SELECT
  const filtered = categories.filter(
    (c) => c.type === (txType === 'transfer' ? 'expense' : txType)
  )
  const parents = filtered.filter((c) => c.parent_id === null)
  const subs = filtered.filter((c) => c.parent_id === parentId)

  function handleParentChange(pid: string) {
    onParentChange(pid)
    if (!pid) { onCategoryChange(''); return }
    const children = filtered.filter((c) => c.parent_id === pid)
    onCategoryChange(children.length === 0 ? pid : '')
  }

  return (
    <>
      <select
        value={parentId}
        onChange={(e) => handleParentChange(e.target.value)}
        style={sel}
        data-testid="parent-category-select"
      >
        <option value="">Category (optional)</option>
        {parents.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      {parentId && subs.length > 0 && (
        <select
          value={categoryId}
          onChange={(e) => onCategoryChange(e.target.value)}
          style={{ ...sel, marginTop: '6px' }}
          data-testid="subcategory-select"
        >
          <option value="">— Subcategory</option>
          {subs.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      )}
    </>
  )
}
