// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom'

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}))

const TAGS = [
  { id: 't-apple', name: 'apple', created_at: '2024-01-01', category_id: null },
  { id: 't-banana', name: 'banana', created_at: '2024-01-01', category_id: null },
  { id: 't-cherry', name: 'cherry', created_at: '2024-01-01', category_id: null },
  { id: 't-date', name: 'date', created_at: '2024-01-01', category_id: null },
  { id: 't-elder', name: 'elderberry', created_at: '2024-01-01', category_id: null },
  { id: 't-fig', name: 'fig', created_at: '2024-01-01', category_id: null },
  { id: 't-coconut', name: 'coconut', created_at: '2024-01-01', category_id: null },
]

// tx counts: apple=10, banana=0, cherry=3, date=5, elderberry=8, fig=0, coconut=1
const STATS = {
  tags: {
    't-apple': 10,
    't-banana': 0,
    't-cherry': 3,
    't-date': 5,
    't-elder': 8,
    't-fig': 0,
    't-coconut': 1,
  },
}

function mockFetch() {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = String(url)
    if (u.includes('/api/tags') && !u.match(/\/api\/tags\/.+/)) {
      return { ok: true, json: async () => TAGS }
    }
    if (u.includes('/api/stats')) {
      return { ok: true, json: async () => STATS }
    }
    if (u.includes('/api/categories')) {
      return { ok: true, json: async () => [] }
    }
    return { ok: true, json: async () => ({}) }
  }))
}

async function renderTagsPage() {
  mockFetch()
  const { ToastProvider } = await import('@/app/(protected)/components/toast')
  const TagsPage = (await import('@/app/(protected)/tags/page')).default
  const result = render(
    <ToastProvider>
      <TagsPage />
    </ToastProvider>
  )
  // wait for load — any tag card or empty-state text indicates fetches resolved
  await waitFor(() => {
    const cards = screen.queryAllByTestId(/^tag-card-/)
    const empty = screen.queryByText('No tags match these filters')
    if (cards.length === 0 && !empty) throw new Error('not loaded')
  })
  return result
}

function renderedTagNames(): string[] {
  const list = screen.getByTestId('tags-list')
  const cards = within(list).getAllByTestId(/^tag-card-/)
  return cards.map(c => within(c).getByTestId('tag-name').textContent || '')
}

beforeEach(() => {
  // jsdom localStorage exists; ensure clean slate
  window.localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
  window.localStorage.clear()
})

describe('TagsPage — sort dropdown', () => {
  it('defaults to Name A–Z order', async () => {
    await renderTagsPage()
    expect(renderedTagNames()).toEqual([
      'apple', 'banana', 'cherry', 'coconut', 'date', 'elderberry', 'fig',
    ])
  })

  it('sorts Name Z–A', async () => {
    await renderTagsPage()
    fireEvent.change(screen.getByTestId('tag-sort-select'), { target: { value: 'name_desc' } })
    expect(renderedTagNames()).toEqual([
      'fig', 'elderberry', 'date', 'coconut', 'cherry', 'banana', 'apple',
    ])
  })

  it('sorts Most used (tx count desc, alpha tiebreak)', async () => {
    await renderTagsPage()
    fireEvent.change(screen.getByTestId('tag-sort-select'), { target: { value: 'count_desc' } })
    // counts desc: apple(10), elderberry(8), date(5), cherry(3), coconut(1), banana(0), fig(0)
    expect(renderedTagNames()).toEqual([
      'apple', 'elderberry', 'date', 'cherry', 'coconut', 'banana', 'fig',
    ])
  })

  it('sorts Least used (tx count asc, alpha tiebreak)', async () => {
    await renderTagsPage()
    fireEvent.change(screen.getByTestId('tag-sort-select'), { target: { value: 'count_asc' } })
    // counts asc: banana(0), fig(0), coconut(1), cherry(3), date(5), elderberry(8), apple(10)
    expect(renderedTagNames()).toEqual([
      'banana', 'fig', 'coconut', 'cherry', 'date', 'elderberry', 'apple',
    ])
  })
})

describe('TagsPage — filter chips', () => {
  it('All chip is active by default and shows everything', async () => {
    await renderTagsPage()
    expect(screen.getByTestId('tag-filter-chip-all')).toHaveAttribute('aria-pressed', 'true')
    expect(renderedTagNames()).toHaveLength(7)
  })

  it('Unused chip shows only tags with tx_count = 0', async () => {
    await renderTagsPage()
    fireEvent.click(screen.getByTestId('tag-filter-chip-unused'))
    expect(renderedTagNames()).toEqual(['banana', 'fig'])
  })

  it('1–5 chip shows only tags with tx_count between 1 and 5 inclusive', async () => {
    await renderTagsPage()
    fireEvent.click(screen.getByTestId('tag-filter-chip-low'))
    // cherry=3, coconut=1, date=5 => alpha order
    expect(renderedTagNames()).toEqual(['cherry', 'coconut', 'date'])
  })

  it('6+ chip shows only tags with tx_count >= 6', async () => {
    await renderTagsPage()
    fireEvent.click(screen.getByTestId('tag-filter-chip-high'))
    // apple=10, elderberry=8 => alpha
    expect(renderedTagNames()).toEqual(['apple', 'elderberry'])
  })

  it('clicking All after another chip resets to all tags', async () => {
    await renderTagsPage()
    fireEvent.click(screen.getByTestId('tag-filter-chip-unused'))
    expect(renderedTagNames()).toEqual(['banana', 'fig'])
    fireEvent.click(screen.getByTestId('tag-filter-chip-all'))
    expect(renderedTagNames()).toHaveLength(7)
  })
})

describe('TagsPage — composition: search + filter + sort', () => {
  it('applies search, then filter, then sort together', async () => {
    await renderTagsPage()
    // search "c" -> cherry, coconut
    fireEvent.change(screen.getByPlaceholderText('Search tags...'), { target: { value: 'c' } })
    expect(renderedTagNames()).toEqual(['cherry', 'coconut'])
    // filter 1-5: both still match (cherry=3, coconut=1)
    fireEvent.click(screen.getByTestId('tag-filter-chip-low'))
    expect(renderedTagNames()).toEqual(['cherry', 'coconut'])
    // sort by count desc -> cherry(3), coconut(1)
    fireEvent.change(screen.getByTestId('tag-sort-select'), { target: { value: 'count_desc' } })
    expect(renderedTagNames()).toEqual(['cherry', 'coconut'])
    // sort by count asc -> coconut(1), cherry(3)
    fireEvent.change(screen.getByTestId('tag-sort-select'), { target: { value: 'count_asc' } })
    expect(renderedTagNames()).toEqual(['coconut', 'cherry'])
  })
})

describe('TagsPage — localStorage persistence', () => {
  it('restores saved sort option on reload', async () => {
    window.localStorage.setItem('tags.sort', 'count_desc')
    await renderTagsPage()
    const select = screen.getByTestId('tag-sort-select') as HTMLSelectElement
    expect(select.value).toBe('count_desc')
    expect(renderedTagNames()).toEqual([
      'apple', 'elderberry', 'date', 'cherry', 'coconut', 'banana', 'fig',
    ])
  })

  it('restores saved filter chip on reload', async () => {
    window.localStorage.setItem('tags.filter', 'unused')
    await renderTagsPage()
    expect(screen.getByTestId('tag-filter-chip-unused')).toHaveAttribute('aria-pressed', 'true')
    expect(renderedTagNames()).toEqual(['banana', 'fig'])
  })

  it('writes sort and filter selections to localStorage', async () => {
    await renderTagsPage()
    fireEvent.change(screen.getByTestId('tag-sort-select'), { target: { value: 'name_desc' } })
    fireEvent.click(screen.getByTestId('tag-filter-chip-high'))
    expect(window.localStorage.getItem('tags.sort')).toBe('name_desc')
    expect(window.localStorage.getItem('tags.filter')).toBe('high')
  })
})

describe('TagsPage — empty state', () => {
  it('shows a friendly message when search + filter yield no matches', async () => {
    await renderTagsPage()
    fireEvent.click(screen.getByTestId('tag-filter-chip-high')) // apple, elderberry
    fireEvent.change(screen.getByPlaceholderText('Search tags...'), { target: { value: 'xyz' } })
    expect(screen.queryByTestId('tags-list')).not.toBeInTheDocument()
    expect(screen.getByText('No tags match these filters')).toBeInTheDocument()
  })
})
