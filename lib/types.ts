export type AccountType = 'bank' | 'wallet' | 'cash' | 'fund'
export type CategoryType = 'expense' | 'income'
export type TxType = 'expense' | 'income' | 'transfer'

export interface Account {
  id: string
  name: string
  type: AccountType
  currency: string
  is_active: number
  created_at: string
  updated_at: string
}

export interface Category {
  id: string
  name: string
  type: CategoryType
  sort_order: number
  parent_id: string | null
  created_at: string
  updated_at: string
}

export interface Tag {
  id: string
  name: string
  category_id?: string | null
  created_at: string
}

export interface Transaction {
  id: string
  type: TxType
  amount: number
  currency: string
  fx_rate: number | null
  fx_date: string | null
  sgd_equivalent: number | null
  account_id: string
  to_account_id: string | null
  category_id: string | null
  payee: string | null
  note: string | null
  payment_method: string | null
  datetime: string
  status: 'draft' | 'approved'
  created_at: string
  updated_at: string
}

export interface TransactionRow extends Transaction {
  account_name: string
  to_account_name: string | null
  category_name: string | null
  tags: Tag[]
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
}

export interface Holding {
  name: string
  ticker?: string
  units?: number
  avg_cost?: number
  current_price?: number
  market_value: number
  pnl?: number
  pnl_pct?: number
  allocation_pct?: number
  change_1d_pct?: number
  // Syfe metadata (populated by API from static lookup)
  geo?: 'US' | 'SG' | 'UK' | 'HK'
  sector?: string
  currency?: string
  // Snap27 enrichments
  target?: number
  sell_limit?: number
  buy_limit?: number
  approx?: boolean
  is_new?: boolean
}

export interface PortfolioSnapshot {
  id: string
  snapshot_date: string
  total_value: number
  total_pnl: number | null
  holdings_json: string
  raw_html: string
  created_at: string
}

export type Sentiment = 'bullish' | 'bearish' | 'neutral'

export interface MarketRow {
  name: string
  ticker?: string
  value?: number
  change?: number
  change_pct?: number
}

export interface KeyMover {
  ticker: string
  name?: string
  change_pct: number
  note?: string
}

export interface HeadlineItem {
  title: string
  source?: string
  url?: string
  sentiment?: Sentiment
  summary?: string
  ticker?: string
}

export interface JobItem {
  title: string
  source?: string
  url?: string
  scope: 'global' | 'singapore'
  summary?: string
}

export interface BriefContent {
  market_pre_open: {
    us_futures: MarketRow[]
    asia_overnight: MarketRow[]
    key_movers: KeyMover[]
    macro_theme?: string
  }
  world_headlines: HeadlineItem[]
  singapore_headlines: HeadlineItem[]
  singapore_property: HeadlineItem[]
  job_market: JobItem[]
}

export interface NewsBrief {
  id: string
  brief_date: string
  content_json: string
  created_at: string
}

export interface ExportFilters {
  start?: string
  end?: string
  account_id?: string
  category_id?: string
  type?: TxType
  tag_id?: string
}

export interface QsNewsCard {
  id: string
  category: string
  sentiment: Sentiment
  headline: string
  catalyst: string
  summary: string
  keyPoints: string[]
  source: string
  url: string
  timestamp: string
  ticker?: string
  tickerColor?: string
}

export interface QsBriefSections {
  world: QsNewsCard[]
  sg: QsNewsCard[]
  prop: QsNewsCard[]
  jobsGlobal: QsNewsCard[]
  jobsSg: QsNewsCard[]
  port: QsNewsCard[]
}

export interface QsNewsBriefRow {
  id: string
  generated_at: string
  brief_json: string
  tickers: string | null
}
