// Static ticker → { geo, sector, currency } lookup used by the portfolio
// upload routes to classify holdings whose source data does not include a
// sector. The HTML upload route (/api/portfolio) has long had this table
// inline; the OCR scan route (/api/portfolio/scan, added in PR #86) was
// missing it, which caused BUG-065 — every holding inserted via screenshot
// upload had sector = NULL, lumping the entire portfolio under "Other" on
// the Sector tab.
//
// Keep this list narrow: only tickers we know belong to the user's actual
// portfolio. Unknown tickers fall through to NULL by design — better to show
// "Other" than to fabricate a sector.

export interface TickerMeta {
  geo: 'US' | 'SG' | 'UK' | 'HK'
  sector: string
  currency: string
}

export const TICKER_META: Record<string, TickerMeta> = {
  MU:    { geo: 'US', sector: 'Technology',          currency: 'USD' },
  ABBV:  { geo: 'US', sector: 'Healthcare',          currency: 'USD' },
  Z74:   { geo: 'SG', sector: 'Telecommunications',  currency: 'SGD' },
  NEE:   { geo: 'US', sector: 'Utilities',           currency: 'USD' },
  GOOG:  { geo: 'US', sector: 'Technology',          currency: 'USD' },
  GOOGL: { geo: 'US', sector: 'Technology',          currency: 'USD' },
  SLB:   { geo: 'US', sector: 'Energy',              currency: 'USD' },
  PG:    { geo: 'US', sector: 'Consumer Staples',    currency: 'USD' },
  RING:  { geo: 'US', sector: 'Metals',              currency: 'USD' },
  AGIX:  { geo: 'US', sector: 'ETF',                 currency: 'USD' },
  NFLX:  { geo: 'US', sector: 'Media',               currency: 'USD' },
  D05:   { geo: 'SG', sector: 'Financials',          currency: 'SGD' },
  CMCL:  { geo: 'US', sector: 'Metals',              currency: 'USD' },
  MOO:   { geo: 'US', sector: 'Agriculture ETF',     currency: 'USD' },
  FXI:   { geo: 'HK', sector: 'ETF',                 currency: 'USD' },
  WISE:  { geo: 'UK', sector: 'Financials',          currency: 'GBP' },
  ICLN:  { geo: 'US', sector: 'ETF',                 currency: 'USD' },
  QQQ:   { geo: 'US', sector: 'ETF',                 currency: 'USD' },
  AAPL:  { geo: 'US', sector: 'Technology',          currency: 'USD' },
  MSFT:  { geo: 'US', sector: 'Technology',          currency: 'USD' },
  AMZN:  { geo: 'US', sector: 'Technology',          currency: 'USD' },
  NVDA:  { geo: 'US', sector: 'Technology',          currency: 'USD' },
  META:  { geo: 'US', sector: 'Media',               currency: 'USD' },
  TSLA:  { geo: 'US', sector: 'Technology',          currency: 'USD' },
  PLTR:  { geo: 'US', sector: 'Technology',          currency: 'USD' },
  C6L:   { geo: 'SG', sector: 'Telecommunications',  currency: 'SGD' },
  O39:   { geo: 'SG', sector: 'Financials',          currency: 'SGD' },
  U11:   { geo: 'SG', sector: 'Financials',          currency: 'SGD' },
}

// Resolve the base ticker symbol from a raw value. Syfe's HTML/OCR sometimes
// returns composite values like "MU US" or "ABBV US DIV 15 May" — try the full
// string first, then the first whitespace-separated token.
export function resolveTickerMeta(raw: string | null | undefined): TickerMeta | null {
  if (!raw) return null
  const candidates = [raw, raw.split(/\s+/)[0]]
  for (const c of candidates) {
    const key = c.toUpperCase()
    if (key && TICKER_META[key]) return TICKER_META[key]
  }
  return null
}
