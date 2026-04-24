// @vitest-environment node
import { describe, it, expect } from 'vitest'

describe('BUG-057: news generate route has Vercel maxDuration to prevent timeout', () => {
  it('exports maxDuration = 60 so niche queries (SG headlines, property, portfolio) do not time out', async () => {
    // Regression for BUG-057: /api/news/generate had no maxDuration export.
    // Vercel defaulted to 10s. Niche web_search queries (Singapore headlines,
    // property, portfolio tickers) routinely exceed 10s, leaving those sections
    // empty ("No stories yet") while World Headlines and Jobs loaded fine.
    const mod = await import('@/app/api/news/generate/route')
    expect((mod as Record<string, unknown>).maxDuration).toBe(60)
  })
})
