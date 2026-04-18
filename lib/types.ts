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
  created_at: string
  updated_at: string
}

export interface Tag {
  id: string
  name: string
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
  datetime: string
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

export interface ExportFilters {
  start?: string
  end?: string
  account_id?: string
  category_id?: string
  type?: TxType
  tag_id?: string
}
