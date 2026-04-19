import { describe, it, expect } from 'vitest'
import { stripCiteTags } from '@/lib/news-utils'

describe('stripCiteTags', () => {
  it('removes a cite tag and keeps its inner text', () => {
    expect(stripCiteTags('prices rose <cite index="1">5%</cite> last quarter'))
      .toBe('prices rose 5% last quarter')
  })

  it('removes cite tags with compound index attributes (regression: visible tags in news summaries)', () => {
    // Regression for: Claude web_search returns <cite index="1-19,1-20">text</cite>
    // which was rendered as raw visible text in news card summaries.
    expect(stripCiteTags('MAS tightened policy <cite index="1-19,1-20">last week</cite>.'))
      .toBe('MAS tightened policy last week.')
  })

  it('removes multiple cite tags in one string', () => {
    expect(
      stripCiteTags('<cite index="1">First</cite> and <cite index="2">second</cite> point.')
    ).toBe('First and second point.')
  })

  it('returns string unchanged when no cite tags present', () => {
    expect(stripCiteTags('No citations here.')).toBe('No citations here.')
  })

  it('handles empty string', () => {
    expect(stripCiteTags('')).toBe('')
  })

  it('removes unclosed or malformed cite tags without crashing', () => {
    // Defense-in-depth: malformed fragments should not leave partial tags
    const result = stripCiteTags('text <cite index="1">inner')
    expect(result).not.toContain('<cite')
  })

  it('strips cite tags that would break JSON parsing when embedded in JSON strings', () => {
    // Regression for: <cite index="1-19,1-20"> inside a JSON string value causes
    // the attribute's double-quotes to terminate the JSON string early, making
    // JSON.parse throw and parseArr silently return [], leaving sections empty
    // (observed: Singapore Property section showed "No stories yet" after refresh).
    const jsonLike = `[{"summary": "Prices rose <cite index=\\"1-19,1-20\\">5%</cite> in Q1"}]`
    const stripped = stripCiteTags(jsonLike)
    expect(stripped).not.toContain('<cite')
    expect(JSON.parse(stripped)[0].summary).toBe('Prices rose 5% in Q1')
  })
})
