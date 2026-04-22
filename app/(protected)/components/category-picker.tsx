'use client'

import { useState, useEffect, useRef } from 'react'
import type { Category, TxType } from '@/lib/types'

interface CategoryOption {
  id: string
  parentId: string
  label: string
}

export interface CategoryPickerProps {
  categories: Category[]
  txType: TxType
  categoryId: string
  onChange: (categoryId: string, parentCategoryId: string) => void
  inputStyle?: React.CSSProperties
}

const DEFAULT_INPUT: React.CSSProperties = {
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: '6px',
  color: 'var(--text)',
  fontSize: '13px',
  padding: '6px 10px',
  outline: 'none',
  width: '100%',
  cursor: 'text',
  boxSizing: 'border-box',
}

export function buildCategoryOptions(categories: Category[], txType: TxType): CategoryOption[] {
  const type = txType === 'transfer' ? 'expense' : txType
  const filtered = categories.filter((c) => c.type === type)
  const parents = filtered.filter((c) => c.parent_id === null)
  const options: CategoryOption[] = []
  for (const parent of parents) {
    const children = filtered.filter((c) => c.parent_id === parent.id)
    if (children.length === 0) {
      options.push({ id: parent.id, parentId: '', label: parent.name })
    } else {
      for (const child of children) {
        options.push({ id: child.id, parentId: parent.id, label: `${parent.name} > ${child.name}` })
      }
    }
  }
  return options
}

export function CategoryPicker({
  categories,
  txType,
  categoryId,
  onChange,
  inputStyle,
}: CategoryPickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [recentIds, setRecentIds] = useState<string[]>([])
  const containerRef = useRef<HTMLDivElement>(null)

  const options = buildCategoryOptions(categories, txType)
  const selected = options.find((o) => o.id === categoryId)

  useEffect(() => {
    const type = txType === 'transfer' ? 'expense' : txType
    fetch(`/api/categories/frequent?type=${type}&days=30&limit=5`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: { id: string }[]) => setRecentIds(data.map((d) => d.id)))
      .catch(() => {})
  }, [txType])

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filteredOptions = query
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options

  const recentOptions = recentIds
    .map((id) => options.find((o) => o.id === id))
    .filter((o): o is CategoryOption => o !== undefined)

  function selectOption(opt: CategoryOption) {
    onChange(opt.id, opt.parentId)
    setIsOpen(false)
    setQuery('')
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation()
    onChange('', '')
    setQuery('')
  }

  const displayValue = isOpen ? query : (selected?.label ?? '')
  const inputSt: React.CSSProperties = { ...DEFAULT_INPUT, ...inputStyle }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <input
          data-testid="category-search-input"
          placeholder="Category (optional)"
          value={displayValue}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsOpen(true)}
          style={inputSt}
          autoComplete="off"
        />
        {categoryId && !isOpen && (
          <button
            type="button"
            onClick={handleClear}
            aria-label="Clear category"
            style={{
              position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', fontSize: '16px', lineHeight: 1, padding: '0 2px',
            }}
          >
            ×
          </button>
        )}
      </div>

      {isOpen && (
        <div
          data-testid="category-dropdown"
          style={{
            position: 'absolute', top: '100%', left: 0, right: 0,
            background: 'var(--bg)', border: '1px solid var(--border)',
            borderRadius: '6px', zIndex: 200, maxHeight: '260px',
            overflowY: 'auto', marginTop: '2px', boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          }}
        >
          {!query && recentOptions.length > 0 && (
            <div style={{ padding: '8px 8px 6px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>Recent</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                {recentOptions.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    data-testid={`recent-chip-${opt.id}`}
                    onMouseDown={(e) => { e.preventDefault(); selectOption(opt) }}
                    style={{
                      padding: '3px 10px', borderRadius: '12px', fontSize: '12px',
                      background: categoryId === opt.id ? 'var(--accent)' : 'var(--bg-dim)',
                      color: categoryId === opt.id ? '#fff' : 'var(--text)',
                      border: '1px solid var(--border)', cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {filteredOptions.length === 0 ? (
            <div style={{ padding: '12px', color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center' }}>
              No categories found
            </div>
          ) : (
            filteredOptions.map((opt) => (
              <div
                key={opt.id}
                data-testid={`category-option-${opt.id}`}
                onMouseDown={(e) => { e.preventDefault(); selectOption(opt) }}
                style={{
                  padding: '8px 12px', cursor: 'pointer', fontSize: '13px',
                  color: categoryId === opt.id ? 'var(--accent)' : 'var(--text)',
                  background: 'transparent',
                  fontWeight: categoryId === opt.id ? 600 : 400,
                }}
              >
                {opt.label}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
