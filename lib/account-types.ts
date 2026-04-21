import type { AccountType } from './types'

export const ACCOUNT_TYPE_ORDER: AccountType[] = ['bank', 'wallet', 'cash', 'fund', 'credit_card']

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  bank: 'Bank',
  wallet: 'Wallet',
  cash: 'Cash',
  fund: 'Fund',
  credit_card: 'Credit Card',
}

// Maps legacy human-readable payment method strings (from old Claude output) to account type values.
// Also handles the new account type strings directly (from backfilled data and updated prompts).
export const PAYMENT_METHOD_TO_ACCOUNT_TYPE: Record<string, AccountType> = {
  'credit card': 'credit_card',
  'debit card': 'bank',
  'cash': 'cash',
  'e-wallet': 'wallet',
  'credit_card': 'credit_card',
  'bank': 'bank',
  'wallet': 'wallet',
  'fund': 'fund',
}
