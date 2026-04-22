// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'

const CATEGORIES = [
  { id: 'cat-food', name: 'Food', type: 'expense', sort_order: 1, parent_id: null, created_at: '2024-01-01', updated_at: '2024-01-01' },
  { id: 'cat-dining', name: 'Dining Out', type: 'expense', sort_order: 1, parent_id: 'cat-food', created_at: '2024-01-01', updated_at: '2024-01-01' },
  { id: 'cat-grocery', name: 'Grocery', type: 'expense', sort_order: 2, parent_id: 'cat-food', created_at: '2024-01-01', updated_at: '2024-01-01' },
  { id: 'cat-transport', name: 'Transport', type: 'expense', sort_order: 2, parent_id: null, created_at: '2024-01-01', updated_at: '2024-01-01' },
  { id: 'cat-bus', name: 'Bus', type: 'expense', sort_order: 1, parent_id: 'cat-transport', created_at: '2024-01-01', updated_at: '2024-01-01' },
  { id: 'cat-living', name: 'Living', type: 'expense', sort_order: 3, parent_id: null, created_at: '2024-01-01', updated_at: '2024-01-01' },
]

function mockFetch(recentIds: string[] = []) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (String(url).includes('/api/categories/frequent')) {
      return { ok: true, json: async () => recentIds.map((id) => ({ id })) }
    }
    return { ok: true, json: async () => [] }
  }))
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

async function renderPicker(props: {
  categoryId?: string
  onChange?: (cid: string, pid: string) => void
  recentIds?: string[]
}) {
  mockFetch(props.recentIds ?? [])
  const { CategoryPicker } = await import('@/app/(protected)/components/category-picker')
  const onChange = props.onChange ?? vi.fn()
  render(
    <CategoryPicker
      categories={CATEGORIES}
      txType="expense"
      categoryId={props.categoryId ?? ''}
      onChange={onChange}
    />
  )
  return { onChange }
}

describe('CategoryPicker — searchable unified picker', () => {
  it('shows a search input with placeholder when no category selected', async () => {
    await renderPicker({})
    expect(screen.getByTestId('category-search-input')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Category (optional)')).toBeInTheDocument()
  })

  it('displays the selected category label in the input when closed', async () => {
    await renderPicker({ categoryId: 'cat-grocery' })
    const input = screen.getByTestId('category-search-input') as HTMLInputElement
    expect(input.value).toBe('Food > Grocery')
  })

  it('opens dropdown on focus and shows all options', async () => {
    await renderPicker({})
    fireEvent.focus(screen.getByTestId('category-search-input'))
    await waitFor(() => expect(screen.getByTestId('category-dropdown')).toBeInTheDocument())
    // Parents with children are NOT shown as standalone options
    expect(screen.queryByTestId('category-option-cat-food')).not.toBeInTheDocument()
    expect(screen.queryByTestId('category-option-cat-transport')).not.toBeInTheDocument()
    // Children shown as "Parent > Child"
    expect(screen.getByTestId('category-option-cat-dining')).toBeInTheDocument()
    expect(screen.getByTestId('category-option-cat-grocery')).toBeInTheDocument()
    expect(screen.getByTestId('category-option-cat-bus')).toBeInTheDocument()
    // Parent with no children shown directly
    expect(screen.getByTestId('category-option-cat-living')).toBeInTheDocument()
  })

  it('filters options as user types — "gro" matches "Food > Grocery"', async () => {
    await renderPicker({})
    fireEvent.focus(screen.getByTestId('category-search-input'))
    await waitFor(() => expect(screen.getByTestId('category-dropdown')).toBeInTheDocument())
    fireEvent.change(screen.getByTestId('category-search-input'), { target: { value: 'gro' } })
    await waitFor(() => {
      expect(screen.getByTestId('category-option-cat-grocery')).toBeInTheDocument()
      expect(screen.queryByTestId('category-option-cat-dining')).not.toBeInTheDocument()
      expect(screen.queryByTestId('category-option-cat-bus')).not.toBeInTheDocument()
    })
  })

  it('filters by parent name — "food" shows Food subcategories', async () => {
    await renderPicker({})
    fireEvent.focus(screen.getByTestId('category-search-input'))
    await waitFor(() => expect(screen.getByTestId('category-dropdown')).toBeInTheDocument())
    fireEvent.change(screen.getByTestId('category-search-input'), { target: { value: 'food' } })
    await waitFor(() => {
      expect(screen.getByTestId('category-option-cat-dining')).toBeInTheDocument()
      expect(screen.getByTestId('category-option-cat-grocery')).toBeInTheDocument()
      expect(screen.queryByTestId('category-option-cat-bus')).not.toBeInTheDocument()
    })
  })

  it('calls onChange with categoryId and parentCategoryId when subcategory selected', async () => {
    const onChange = vi.fn()
    await renderPicker({ onChange })
    fireEvent.focus(screen.getByTestId('category-search-input'))
    await waitFor(() => expect(screen.getByTestId('category-option-cat-grocery')).toBeInTheDocument())
    fireEvent.mouseDown(screen.getByTestId('category-option-cat-grocery'))
    expect(onChange).toHaveBeenCalledWith('cat-grocery', 'cat-food')
  })

  it('calls onChange with ("cat-living", "") when parent-only category selected', async () => {
    const onChange = vi.fn()
    await renderPicker({ onChange })
    fireEvent.focus(screen.getByTestId('category-search-input'))
    await waitFor(() => expect(screen.getByTestId('category-option-cat-living')).toBeInTheDocument())
    fireEvent.mouseDown(screen.getByTestId('category-option-cat-living'))
    expect(onChange).toHaveBeenCalledWith('cat-living', '')
  })

  it('shows "No categories found" when query matches nothing', async () => {
    await renderPicker({})
    fireEvent.focus(screen.getByTestId('category-search-input'))
    await waitFor(() => expect(screen.getByTestId('category-dropdown')).toBeInTheDocument())
    fireEvent.change(screen.getByTestId('category-search-input'), { target: { value: 'xyznotexist' } })
    await waitFor(() => expect(screen.getByText('No categories found')).toBeInTheDocument())
  })

  it('shows recent chips above the list when fetch returns ids', async () => {
    await renderPicker({ recentIds: ['cat-grocery', 'cat-bus'] })
    fireEvent.focus(screen.getByTestId('category-search-input'))
    await waitFor(() => {
      expect(screen.getByTestId('recent-chip-cat-grocery')).toBeInTheDocument()
      expect(screen.getByTestId('recent-chip-cat-bus')).toBeInTheDocument()
    })
  })

  it('selecting a recent chip calls onChange with correct ids', async () => {
    const onChange = vi.fn()
    await renderPicker({ onChange, recentIds: ['cat-grocery'] })
    fireEvent.focus(screen.getByTestId('category-search-input'))
    await waitFor(() => expect(screen.getByTestId('recent-chip-cat-grocery')).toBeInTheDocument())
    fireEvent.mouseDown(screen.getByTestId('recent-chip-cat-grocery'))
    expect(onChange).toHaveBeenCalledWith('cat-grocery', 'cat-food')
  })

  it('hides recent chips while search query is active', async () => {
    await renderPicker({ recentIds: ['cat-grocery'] })
    fireEvent.focus(screen.getByTestId('category-search-input'))
    await waitFor(() => expect(screen.getByTestId('recent-chip-cat-grocery')).toBeInTheDocument())
    fireEvent.change(screen.getByTestId('category-search-input'), { target: { value: 'bus' } })
    await waitFor(() => expect(screen.queryByTestId('recent-chip-cat-grocery')).not.toBeInTheDocument())
  })
})
