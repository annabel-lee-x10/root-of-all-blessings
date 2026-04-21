// Regression test for BUG-023: parseArr fails when preamble contains square brackets
import { describe, it, expect } from 'vitest'
import { parseArr } from '@/lib/news-utils'

describe('parseArr — BUG-023 preamble handling', () => {
  it('parses clean JSON array (fast path)', () => {
    const raw = '[{"headline":"test","sentiment":"neutral","keyPoints":[],"source":"CNA","url":"","timestamp":""}]'
    const result = parseArr(raw)
    expect(result).toHaveLength(1)
    expect(result[0].headline).toBe('test')
  })

  it('parses array when preamble contains [N] bracket notation', () => {
    const raw = 'Here are [5] Singapore property stories today:\n[{"headline":"HDB BTO launch","sentiment":"bullish","keyPoints":[],"source":"CNA","url":"","timestamp":""}]'
    const result = parseArr(raw)
    expect(result).toHaveLength(1)
    expect((result[0] as Record<string, unknown>).headline).toBe('HDB BTO launch')
  })

  it('parses array with multi-item preamble: "Top [3] of [10] results:"', () => {
    const raw = 'Top [3] of [10] results:\n[{"headline":"A"},{"headline":"B"},{"headline":"C"}]'
    const result = parseArr(raw)
    expect(result).toHaveLength(3)
  })

  it('returns empty array for []', () => {
    expect(parseArr('[]')).toHaveLength(0)
  })

  it('returns empty array for empty string', () => {
    expect(parseArr('')).toHaveLength(0)
  })

  it('returns empty array when model returns explanation only (no array)', () => {
    expect(parseArr('No property news found today.')).toHaveLength(0)
  })

  it('handles markdown-fenced JSON (```json ... ```)', () => {
    const raw = '```json\n[{"headline":"Condo prices rise"}]\n```'
    const result = parseArr(raw)
    expect(result).toHaveLength(1)
  })

  it('handles cite tags that would break JSON — they are already stripped upstream, but parseArr is robust to leftover [idx] text', () => {
    // After stripCiteTags, cite tags are gone but numeric indexes may leave edge cases
    const raw = 'Prices rose 5% in Q1 according to analysis [1]:\n[{"headline":"Condo resale prices up","sentiment":"bullish","keyPoints":[],"source":"ST","url":"","timestamp":""}]'
    const result = parseArr(raw)
    expect(result).toHaveLength(1)
  })
})
