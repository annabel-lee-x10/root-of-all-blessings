'use client'

import type { Account, AccountType } from '@/lib/types'
import { ACCOUNT_TYPE_ORDER, ACCOUNT_TYPE_LABELS } from '@/lib/account-types'

interface PaymentTypePickerProps {
  accounts: Account[]
  filterValue: AccountType | ''
  accountId: string
  onFilterChange: (f: AccountType | '') => void
  onAccountChange: (id: string) => void
  selectStyle?: React.CSSProperties
  accountSelectRequired?: boolean
  pillsContainerStyle?: React.CSSProperties
}

const PILL: (active: boolean) => React.CSSProperties = (active) => ({
  padding: '5px 12px',
  borderRadius: '20px',
  fontSize: '12px',
  fontWeight: 500,
  cursor: 'pointer',
  border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
  background: active ? 'var(--accent-faint)' : 'transparent',
  color: active ? 'var(--accent)' : 'var(--text-muted)',
  transition: 'all 0.15s',
})

const DEFAULT_SELECT: React.CSSProperties = {
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: '6px',
  color: 'var(--text)',
  fontSize: '13px',
  padding: '6px 10px',
  outline: 'none',
  width: '100%',
  cursor: 'pointer',
}

export function PaymentTypePicker({
  accounts,
  filterValue,
  accountId,
  onFilterChange,
  onAccountChange,
  selectStyle,
  accountSelectRequired,
  pillsContainerStyle,
}: PaymentTypePickerProps) {
  const filteredAccounts = filterValue
    ? accounts.filter((a) => a.type === filterValue)
    : accounts

  function handlePillClick(type: AccountType) {
    const newFilter: AccountType | '' = filterValue === type ? '' : type
    onFilterChange(newFilter)
    if (newFilter) {
      const inFilter = accounts.filter((a) => a.type === newFilter)
      if (!inFilter.some((a) => a.id === accountId)) {
        onAccountChange(inFilter.length === 1 ? inFilter[0].id : '')
      }
    }
  }

  return (
    <>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', ...pillsContainerStyle }}>
        {ACCOUNT_TYPE_ORDER
          .filter((t) => accounts.some((a) => a.type === t))
          .map((t) => (
            <button
              key={t}
              type="button"
              data-testid={`payment-type-${t}`}
              onClick={() => handlePillClick(t)}
              style={PILL(filterValue === t)}
            >
              {ACCOUNT_TYPE_LABELS[t]}
            </button>
          ))}
      </div>
      <select
        value={accountId}
        onChange={(e) => onAccountChange(e.target.value)}
        required={accountSelectRequired}
        style={selectStyle ?? DEFAULT_SELECT}
      >
        <option value="">Account</option>
        {filteredAccounts.map((a) => (
          <option key={a.id} value={a.id}>{a.name}</option>
        ))}
      </select>
    </>
  )
}
