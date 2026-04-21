'use client'

import type { Tag, Category } from '@/lib/types'

export function filterVisibleTags(tags: Tag[], categories: Category[]): Tag[] {
  const catNames = new Set(categories.map((c) => c.name.toLowerCase()))
  return tags.filter((t) => !catNames.has(t.name.toLowerCase()))
}

const BTN: React.CSSProperties = {
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
  fontSize: '12px',
  fontWeight: 500,
  padding: '3px 10px',
}

interface TagSelectorProps {
  tags: Tag[]
  categories: Category[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
}

export function TagSelector({ tags, categories, selectedIds, onChange }: TagSelectorProps) {
  const visibleTags = filterVisibleTags(tags, categories)
  if (visibleTags.length === 0) return null

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
      {visibleTags.map((tag) => {
        const selected = selectedIds.includes(tag.id)
        return (
          <button
            key={tag.id}
            type="button"
            onClick={() =>
              onChange(
                selected
                  ? selectedIds.filter((id) => id !== tag.id)
                  : [...selectedIds, tag.id]
              )
            }
            style={{
              ...BTN,
              background: selected ? '#f0b42920' : 'var(--bg-dim)',
              color: selected ? '#f0b429' : 'var(--text-muted)',
              border: `1px solid ${selected ? '#f0b42960' : 'var(--border)'}`,
            }}
          >
            {tag.name}
          </button>
        )
      })}
    </div>
  )
}
