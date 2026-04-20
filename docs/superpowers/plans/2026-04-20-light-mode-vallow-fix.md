# Light Mode & Vallow Bug Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix light/dark theme switching by replacing all hardcoded hex colors with CSS variables, delete the vallow account via migration, and add optgroup labels to the WMM account dropdown.

**Architecture:** Add 3 new CSS variables (--bg-secondary, --bg-muted, --text-subtle) to globals.css, then do a systematic sweep replacing hardcoded hex colors in 11 component files. Semantic colors (red/green/blue for tx types, toast backgrounds) remain hardcoded as they are not theme-dependent. Add vallow DELETE to migrate endpoint. Add optgroup grouping to WMM account selects.

**Tech Stack:** Next.js, React inline styles, CSS custom properties, TypeScript, Turso/libSQL

---

## Color Mapping Reference

| Hardcoded | CSS Variable | Notes |
|-----------|-------------|-------|
| `#0d1117` | `var(--bg)` | Main background |
| `#161b22` | `var(--bg-card)` | Card/container background |
| `#1c2128` | `var(--bg-secondary)` | Dropdowns, sub-surfaces (NEW var) |
| `#21262d` | `var(--bg-muted)` | Disabled buttons, badges (NEW var) |
| `#30363d` | `var(--border)` | Borders |
| `#e6edf3` | `var(--text)` | Primary text |
| `#8b949e` | `var(--text-muted)` | Muted text |
| `#484f58` | `var(--text-subtle)` | Very subtle text, timestamps (NEW var) |
| `#f0b429` | `var(--accent)` | Accent yellow |

**Do NOT replace** (semantic, theme-independent):
- `#f85149` expense/error red
- `#3fb884` income/success green
- `#58a6ff` transfer blue
- `#1a4731` / `#4a1717` toast backgrounds
- `rgba(63,184,132,...)` income-derived rgba
- `linear-gradient(135deg, #f0b429 0%, #d4a017 100%)` logo gradient

---

## Task 1: Extend globals.css with new CSS variables

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: Add --bg-secondary, --bg-muted, --text-subtle to both :root and [data-theme="light"]**

New `:root`:
```css
:root {
  --bg: #0d1117;
  --bg-card: #161b22;
  --bg-secondary: #1c2128;
  --bg-muted: #21262d;
  --border: #30363d;
  --text: #e6edf3;
  --text-muted: #8b949e;
  --text-subtle: #484f58;
  --accent: #f0b429;
}
```

New `[data-theme="light"]`:
```css
[data-theme="light"] {
  --bg: #f6f8fa;
  --bg-card: #ffffff;
  --bg-secondary: #eaeef2;
  --bg-muted: #e1e4e8;
  --border: #d0d7de;
  --text: #1f2328;
  --text-muted: #636c76;
  --text-subtle: #8c959f;
  --accent: #d4a017;
}
```

- [ ] **Step 2: Commit**
```bash
git add app/globals.css
git commit -m "style: add --bg-secondary, --bg-muted, --text-subtle CSS variables"
```

---

## Task 2: Fix wheres-my-money.tsx

**Files:**
- Modify: `app/(protected)/components/wheres-my-money.tsx`

Key changes:
- `inputStyle`: `#0d1117` -> `var(--bg)`, `#30363d` -> `var(--border)`, `#e6edf3` -> `var(--text)`
- `pillBtn()`: `#f0b429` -> `var(--accent)`, `#30363d` -> `var(--border)`, `#8b949e` -> `var(--text-muted)`, `#f0b42920` -> `rgba(from var(--accent) r g b / 0.12)` (or keep as-is since accent works in both themes)
- Card wrapper: `#161b22` -> `var(--bg-card)`, `#30363d` -> `var(--border)`, `#e6edf3` -> `var(--text)`
- Paste panel: `#0d1117` -> `var(--bg)`, border `#f0b42940` keep as-is
- Paste button disabled: `#21262d` -> `var(--bg-muted)`, `#484f58` -> `var(--text-subtle)`
- Submit button disabled: `#21262d` -> `var(--bg-muted)`, `#484f58` -> `var(--text-subtle)`
- Paste receipt button: `#30363d` -> `var(--border)`, `#8b949e` -> `var(--text-muted)`
- `#8b949e` (add note button) -> `var(--text-muted)`
- Tag dropdown `#1c2128` -> `var(--bg-secondary)`, `#30363d` -> `var(--border)`, `#e6edf3` -> `var(--text)`
- Tag pill `#f0b42920`, `#f0b42960`, `#f0b429` - keep as-is (accent-derived)
- `color: '#8b949e'` FX span -> `var(--text-muted)`
- `<style>` tag: `input::placeholder, textarea::placeholder { color: var(--text-subtle); }` and `select option { background: var(--bg-card); color: var(--text); }`
- Add optgroup labels to Account and To Account selects (Bank/Wallet/Cash/Fund grouping)

- [ ] **Step 1: Replace hardcoded colors and add optgroup labels**

Replace `inputStyle` and `selectStyle` (top of file):
```tsx
const inputStyle: React.CSSProperties = {
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  color: 'var(--text)',
  padding: '8px 12px',
  fontSize: '14px',
  width: '100%',
  outline: 'none',
  boxSizing: 'border-box',
}
```

Replace `pillBtn()`:
```tsx
function pillBtn(active: boolean): React.CSSProperties {
  return {
    padding: '6px 16px',
    borderRadius: '20px',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
    background: active ? '#f0b42920' : 'transparent',
    color: active ? 'var(--accent)' : 'var(--text-muted)',
    transition: 'all 0.15s',
  }
}
```

Replace card wrapper background (line ~290):
```tsx
style={{
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: '12px',
  padding: '1.5rem',
}}
```

Replace h2 color (line ~298): `color: 'var(--text)'`

Replace paste receipt button style (lines ~306-311):
```tsx
style={{
  display: 'flex', alignItems: 'center', gap: '5px',
  padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border)',
  background: pasteOpen ? '#f0b42915' : 'transparent',
  color: pasteOpen ? 'var(--accent)' : 'var(--text-muted)',
  fontSize: '13px', fontWeight: 500, cursor: 'pointer',
  minHeight: '36px',
}}
```

Replace paste panel background (line ~323-325):
```tsx
style={{
  background: 'var(--bg)', border: '1px solid #f0b42940',
  borderRadius: '10px', padding: '1rem', marginBottom: '1.25rem',
}}
```

Replace Fill Form button (lines ~352-356):
```tsx
style={{
  width: '100%', padding: '10px', borderRadius: '8px', border: 'none',
  fontSize: '14px', fontWeight: 600, cursor: pasteText.trim() ? 'pointer' : 'not-allowed',
  background: pasteText.trim() ? 'var(--accent)' : 'var(--bg-muted)',
  color: pasteText.trim() ? 'var(--bg)' : 'var(--text-subtle)',
}}
```

Replace FX span color (line ~435): `color: 'var(--text-muted)'`

Replace Account select with optgroup grouping. Add constants before the component:
```tsx
const ACCOUNT_TYPE_ORDER = ['bank', 'wallet', 'cash', 'fund'] as const
const ACCOUNT_TYPE_LABELS: Record<string, string> = { bank: 'Bank', wallet: 'Wallet', cash: 'Cash', fund: 'Fund' }
```

Replace account `<select>` (line ~445-451):
```tsx
<select value={accountId} onChange={(e) => setAccountId(e.target.value)} required style={selectStyle}>
  <option value="">Account</option>
  {ACCOUNT_TYPE_ORDER.map((t) => {
    const group = activeAccounts.filter((a) => a.type === t)
    if (group.length === 0) return null
    return (
      <optgroup key={t} label={ACCOUNT_TYPE_LABELS[t]}>
        {group.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </optgroup>
    )
  })}
</select>
```

Replace To Account `<select>` (line ~454-459):
```tsx
<select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)} required style={selectStyle}>
  <option value="">To Account</option>
  {ACCOUNT_TYPE_ORDER.map((t) => {
    const group = activeAccounts.filter((a) => a.type === t && a.id !== accountId)
    if (group.length === 0) return null
    return (
      <optgroup key={t} label={ACCOUNT_TYPE_LABELS[t]}>
        {group.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </optgroup>
    )
  })}
</select>
```

Replace tag dropdown (lines ~532-535):
```tsx
style={{
  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
  background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px',
  marginTop: '4px', maxHeight: '180px', overflowY: 'auto',
}}
```

Replace tag dropdown item colors:
- Row `color: '#e6edf3'` -> `color: 'var(--text)'`
- Hover background `'#30363d'` -> `'var(--border)'`
- Create tag color `'#f0b429'` -> `'var(--accent)'`

Replace "+ Add note" button color: `color: 'var(--text-muted)'`

Replace submit button (lines ~600-612):
```tsx
style={{
  width: '100%', padding: '10px', borderRadius: '8px', border: 'none',
  fontSize: '14px', fontWeight: 600, cursor: canSubmit ? 'pointer' : 'not-allowed',
  background: canSubmit ? 'var(--accent)' : 'var(--bg-muted)',
  color: canSubmit ? 'var(--bg)' : 'var(--text-subtle)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
  transition: 'all 0.15s',
}}
```

Replace `<style>` tag content:
```tsx
<style>{`
  @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  input[type="number"]::-webkit-outer-spin-button,
  input[type="number"]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
  input[type="number"] { -moz-appearance: textfield; }
  input::placeholder, textarea::placeholder { color: var(--text-subtle); }
  select option { background: var(--bg-card); color: var(--text); }
  input[type="datetime-local"]::-webkit-calendar-picker-indicator { filter: invert(0.5); cursor: pointer; }
  input[type="date"]::-webkit-calendar-picker-indicator { filter: invert(0.5); cursor: pointer; }
`}</style>
```

- [ ] **Step 2: Commit**
```bash
git add app/(protected)/components/wheres-my-money.tsx
git commit -m "style: replace hardcoded colors with CSS vars in wheres-my-money, add optgroup labels"
```

---

## Task 3: Fix recent-transactions.tsx

**Files:**
- Modify: `app/(protected)/components/recent-transactions.tsx`

Key changes:
- Section h2 `color: '#8b949e'` -> `var(--text-muted)`
- Card container `#161b22` -> `var(--bg-card)`, `#30363d` -> `var(--border)`
- Loading/empty state `color: '#8b949e'` -> `var(--text-muted)`
- Row border `#21262d` -> `var(--bg-muted)`
- Transaction name `#e6edf3` -> `var(--text)`
- Tags span `#8b949e` -> `var(--text-muted)`
- Datetime/account spans `#484f58` -> `var(--text-subtle)`
- Payment method/note spans `#8b949e` -> `var(--text-muted)`
- Delete button `#484f58` -> `var(--text-subtle)`, hover still `#f85149` (semantic)
- "Show more" link `#8b949e` -> `var(--text-muted)`
- `typeColor()` function stays unchanged (semantic colors)

- [ ] **Step 1: Replace hardcoded colors**

```tsx
// h2
style={{
  color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600,
  letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 12px',
}}

// Card container
style={{
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: '12px',
  overflow: 'hidden',
}}

// Loading / empty text
style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px' }}

// Row border
style={{
  display: 'flex', alignItems: 'center', gap: '12px',
  padding: '11px 16px',
  borderBottom: '1px solid var(--bg-muted)',
}}

// Transaction name
style={{ color: 'var(--text)', fontSize: '14px', fontWeight: 500 }}

// Tags
style={{ color: 'var(--text-muted)', fontSize: '11px' }}

// Datetime / account spans
style={{ color: 'var(--text-subtle)', fontSize: '12px' }}

// payment_method / note spans
style={{ color: 'var(--text-muted)', fontSize: '12px' }}

// Delete button
style={{
  background: 'none', border: 'none', color: 'var(--text-subtle)',
  cursor: deletingId === tx.id ? 'not-allowed' : 'pointer',
  padding: '4px 6px', fontSize: '16px', lineHeight: 1,
  flexShrink: 0, borderRadius: '4px', transition: 'color 0.1s',
}}
onMouseEnter={(e) => { if (deletingId !== tx.id) (e.currentTarget as HTMLElement).style.color = '#f85149' }}
onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-subtle)' }}

// Show more link
style={{ color: 'var(--text-muted)', fontSize: '12px', textDecoration: 'none', fontWeight: 500 }}
```

- [ ] **Step 2: Commit**
```bash
git add app/(protected)/components/recent-transactions.tsx
git commit -m "style: replace hardcoded colors with CSS vars in recent-transactions"
```

---

## Task 4: Fix expense-dashboard.tsx

**Files:**
- Modify: `app/(protected)/components/expense-dashboard.tsx`

Key changes:
- `card` constant: `#1c2128` -> `var(--bg-secondary)`, `#30363d` -> `var(--border)`
- `labelStyle`: `#8b949e` -> `var(--text-muted)`
- `valueStyle`: `#e6edf3` -> `var(--text)`
- Card container: `#161b22` -> `var(--bg-card)`, `#30363d` -> `var(--border)`
- Header h2: `#8b949e` -> `var(--text-muted)`
- Range buttons: `#f0b429` -> `var(--accent)`, `#30363d` -> `var(--border)`, `#8b949e` -> `var(--text-muted)`
- Custom date inputs: `#0d1117` -> `var(--bg)`, `#30363d` -> `var(--border)`, `#e6edf3` -> `var(--text)`
- Loading color `#484f58` -> `var(--text-subtle)`, SGD label `#484f58` -> `var(--text-subtle)`
- Progress bar track `#21262d` -> `var(--bg-muted)`, fill `#f0b429` -> `var(--accent)`
- Category amount `#8b949e` -> `var(--text-muted)`, pct `#484f58` -> `var(--text-subtle)`
- Category name `#e6edf3` -> `var(--text)`

- [ ] **Step 1: Replace hardcoded colors**

```tsx
const card: React.CSSProperties = {
  background: 'var(--bg-secondary)',
  border: '1px solid var(--border)',
  borderRadius: '10px',
  padding: '1rem',
}

const labelStyle: React.CSSProperties = {
  color: 'var(--text-muted)',
  fontSize: '11px',
  fontWeight: 600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  marginBottom: '4px',
}

const valueStyle: React.CSSProperties = {
  color: 'var(--text)',
  fontSize: '22px',
  fontWeight: 700,
  letterSpacing: '-0.5px',
}
```

Outer card container: `background: 'var(--bg-card)'`, `border: '1px solid var(--border)'`

Header h2: `color: 'var(--text-muted)'`

Range buttons: `border: range === r.id ? '1px solid var(--accent)' : '1px solid var(--border)'`, `color: range === r.id ? 'var(--accent)' : 'var(--text-muted)'`

Custom date inputs: `background: 'var(--bg)'`, `border: '1px solid var(--border)'`, `color: 'var(--text)'`

Total Spend loading color: `color: loading ? 'var(--text-subtle)' : '#f85149'`
Income loading: `color: loading ? 'var(--text-subtle)' : '#3fb884'`
Daily Avg loading: `color: loading ? 'var(--text-subtle)' : 'var(--text)'`
Budget value: `color: 'var(--text-subtle)'`
SGD sub-labels: `color: 'var(--text-subtle)'`

Progress bar: track `background: 'var(--bg-muted)'`, fill `background: 'var(--accent)'`
Category name: `color: 'var(--text)'`, amount: `color: 'var(--text-muted)'`, pct: `color: 'var(--text-subtle)'`

- [ ] **Step 2: Commit**
```bash
git add app/(protected)/components/expense-dashboard.tsx
git commit -m "style: replace hardcoded colors with CSS vars in expense-dashboard"
```

---

## Task 5: Fix nav-bar.tsx

**Files:**
- Modify: `app/(protected)/components/nav-bar.tsx`

Key changes:
- `tabStyle()`: `#f0b429` -> `var(--accent)`, `#8b949e` -> `var(--text-muted)`
- Nav `background: '#161b22'` -> `var(--bg-card)`, `borderBottom: '1px solid #30363d'` -> `var(--border)`
- Logo span `#e6edf3` -> `var(--text)`
- Sub-menu arrow button: `#f0b429` -> `var(--accent)`, `#8b949e` -> `var(--text-muted)`
- Sub-menu dropdown: `background: '#1c2128'` -> `var(--bg-secondary)`, `#30363d` -> `var(--border)`
- Sub-menu links: active `#f0b429` -> `var(--accent)`, default `#e6edf3` -> `var(--text)`
- Sign out button: `#8b949e` -> `var(--text-muted)`
- Mobile hamburger button: `#30363d` -> `var(--border)`, `#8b949e` -> `var(--text-muted)`
- Mobile dropdown: `background: '#161b22'` -> `var(--bg-card)`, `borderBottom: '1px solid #30363d'` -> `var(--border)`
- Mobile links: active `#f0b429` -> `var(--accent)`, default `#e6edf3` -> `var(--text)`, sub `#8b949e` -> `var(--text-muted)`
- Mobile divider: `borderTop: '1px solid #30363d'` -> `var(--border)`
- Logo gradient stays as-is (decorative)

- [ ] **Step 1: Replace hardcoded colors**

```tsx
function tabStyle(active: boolean): React.CSSProperties {
  return {
    color: active ? 'var(--accent)' : 'var(--text-muted)',
    textDecoration: 'none',
    fontSize: '13px',
    fontWeight: active ? 500 : 400,
    padding: '4px 10px',
    borderRadius: '6px',
    background: active ? 'rgba(240,180,41,0.08)' : 'transparent',
    whiteSpace: 'nowrap',
    transition: 'color 0.1s',
    display: 'inline-block',
  }
}
```

Nav: `background: 'var(--bg-card)'`, `borderBottom: '1px solid var(--border)'`
Logo span: `color: 'var(--text)'`
Arrow button: `color: active ? 'var(--accent)' : 'var(--text-muted)'`
Dropdown: `background: 'var(--bg-secondary)'`, `border: '1px solid var(--border)'`
Dropdown links: active `color: 'var(--accent)'`, default `color: 'var(--text)'`
Sign out: `color: 'var(--text-muted)'`
Hamburger: `border: '1px solid var(--border)'`, `color: 'var(--text-muted)'`
Mobile div: `background: 'var(--bg-card)'`, `borderBottom: '1px solid var(--border)'`
Mobile links: active `color: 'var(--accent)'`, default `color: 'var(--text)'`, sub `color: 'var(--text-muted)'`
Mobile active borderLeft: `color: 'var(--accent)'`
Mobile divider: `borderTop: '1px solid var(--border)'`

- [ ] **Step 2: Commit**
```bash
git add app/(protected)/components/nav-bar.tsx
git commit -m "style: replace hardcoded colors with CSS vars in nav-bar"
```

---

## Task 6: Fix toast.tsx

**Files:**
- Modify: `app/(protected)/components/toast.tsx`

The toast backgrounds (`#1a4731`, `#4a1717`) and text (`#3fb884`, `#f85149`) are semantic status colors - they stay. The borders are also semantic. **No changes needed in toast.tsx.**

---

## Task 7: Fix transactions/page.tsx

**Files:**
- Modify: `app/(protected)/transactions/page.tsx`

Key changes:
- `BTN_PRI`: `#f0b429` -> `var(--accent)`, `#0d1117` -> `var(--bg)`
- `BTN_SEC`: `#21262d` -> `var(--bg-muted)`, `#e6edf3` -> `var(--text)`, `#30363d` -> `var(--border)`
- `BTN_DNG`: stays (semantic red)
- `INPUT`: `#0d1117` -> `var(--bg)`, `#30363d` -> `var(--border)`, `#e6edf3` -> `var(--text)`
- Page h1: `#e6edf3` -> `var(--text)`
- Filters panel: `#161b22` -> `var(--bg-card)`, `#30363d` -> `var(--border)`
- Filter labels: `#8b949e` -> `var(--text-muted)`
- Count text: `#8b949e` -> `var(--text-muted)`
- Transaction list container: `#161b22` -> `var(--bg-card)`, `#30363d` -> `var(--border)`
- Empty state: `#8b949e` -> `var(--text-muted)`
- Row border `#21262d` -> `var(--bg-muted)`
- Tx name `#e6edf3` -> `var(--text)`
- Tags `#484f58` -> `var(--text-subtle)`
- Date/account/note text `#484f58` -> `var(--text-subtle)`
- Edit panel bg `#0d1117` -> `var(--bg)`
- Type filter buttons: active `#f0b429` -> `var(--accent)`, `#0d1117` -> `var(--bg)`, inactive `#21262d` -> `var(--bg-muted)`, `#8b949e` -> `var(--text-muted)`, border `#30363d` -> `var(--border)`
- Edit form type buttons: `#21262d` -> `var(--bg-muted)`, `#8b949e` -> `var(--text-muted)`, `#0d1117` -> `var(--bg)`
- Edit form labels: `#8b949e` -> `var(--text-muted)`
- Tag toggle buttons: selected `#f0b429` -> `var(--accent)`, unselected `#21262d` -> `var(--bg-muted)`, `#8b949e` -> `var(--text-muted)`, borders `#30363d` -> `var(--border)`
- Pagination `#8b949e` -> `var(--text-muted)`

- [ ] **Step 1: Replace hardcoded colors**

```tsx
const BTN_PRI: React.CSSProperties = { ...BTN, background: 'var(--accent)', color: 'var(--bg)' }
const BTN_SEC: React.CSSProperties = { ...BTN, background: 'var(--bg-muted)', color: 'var(--text)', border: '1px solid var(--border)' }
const BTN_DNG: React.CSSProperties = { ...BTN, background: 'transparent', color: '#f85149', border: '1px solid #f8514940' }

const INPUT: React.CSSProperties = {
  background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px',
  color: 'var(--text)', fontSize: '13px', padding: '6px 10px', outline: 'none',
}
```

Then sweep the JSX replacing:
- h1 `color: 'var(--text)'`
- Filters panel `background: 'var(--bg-card)'`, `border: '1px solid var(--border)'`
- Filter labels `color: 'var(--text-muted)'`
- Type filter buttons: `background: filters.type === t ? 'var(--accent)' : 'var(--bg-muted)'`, `color: filters.type === t ? 'var(--bg)' : 'var(--text-muted)'`, `border: '1px solid var(--border)'`
- Count `color: 'var(--text-muted)'`
- List container `background: 'var(--bg-card)'`, `border: '1px solid var(--border)'`
- Empty state `color: 'var(--text-muted)'`
- Row border `borderBottom: '... var(--bg-muted)'`
- Tx name `color: 'var(--text)'`
- Tags `color: 'var(--text-subtle)'`
- Date spans `color: 'var(--text-subtle)'`
- Edit panel `background: 'var(--bg)'`
- Edit type buttons: `background: editForm.type === t ? typeColor(t) : 'var(--bg-muted)'`, `color: editForm.type === t ? 'var(--bg)' : 'var(--text-muted)'`, border uses typeColor which stays
- Edit labels `color: 'var(--text-muted)'`
- Tag buttons: selected `background: '#f0b42920'`, `color: 'var(--accent)'`, `border: '1px solid #f0b42960'`; unselected `background: 'var(--bg-muted)'`, `color: 'var(--text-muted)'`, `border: '1px solid var(--border)'`
- Pagination `color: 'var(--text-muted)'`

- [ ] **Step 2: Commit**
```bash
git add app/(protected)/transactions/page.tsx
git commit -m "style: replace hardcoded colors with CSS vars in transactions page"
```

---

## Task 8: Fix categories/page.tsx

**Files:**
- Modify: `app/(protected)/categories/page.tsx`

Key changes:
- `BTN_PRI`, `BTN_SEC`, `BTN_DNG`, `BTN_ICON`, `INPUT`, `SELECT`, `CARD` constants
- `TAB_STYLE()` function
- Inline JSX colors

```tsx
const BTN_PRI = { ...BTN, background: 'var(--accent)', color: 'var(--bg)' }
const BTN_SEC = { ...BTN, background: 'var(--bg-muted)', color: 'var(--text)', border: '1px solid var(--border)' }
const BTN_DNG = { ...BTN, background: 'transparent', color: '#f85149', border: '1px solid #f85149' }
const BTN_ICON = { ...BTN_SEC, padding: '0.3rem 0.6rem', fontSize: '0.85rem' }
const INPUT = { padding: '0.45rem 0.7rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: '0.9rem', width: '100%', boxSizing: 'border-box' as const }
const SELECT = { ...INPUT }
const CARD = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.85rem 1rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }
```

TAB_STYLE function:
```tsx
const TAB_STYLE = (active: boolean): React.CSSProperties => ({
  padding: '0.5rem 1.25rem',
  borderRadius: '6px 6px 0 0',
  border: '1px solid var(--border)',
  borderBottom: active ? '1px solid var(--bg-card)' : '1px solid var(--border)',
  background: active ? 'var(--bg-card)' : 'transparent',
  color: active ? 'var(--text)' : 'var(--text-muted)',
  cursor: 'pointer',
  fontSize: '0.9rem',
  fontWeight: active ? 600 : 400,
  marginRight: '2px',
  marginBottom: '-1px',
})
```

JSX replacements:
- h1 `color: 'var(--text)'`
- Tab content area `border: '1px solid var(--border)'`, `background: 'var(--bg-card)'`
- Loading/empty `color: 'var(--text-muted)'`
- Category name `color: 'var(--text)'`
- Tx count `color: 'var(--text-muted)'`

- [ ] **Step 1: Replace hardcoded colors**

- [ ] **Step 2: Commit**
```bash
git add app/(protected)/categories/page.tsx
git commit -m "style: replace hardcoded colors with CSS vars in categories page"
```

---

## Task 9: Fix tags/page.tsx

**Files:**
- Modify: `app/(protected)/tags/page.tsx`

Same pattern as categories/page.tsx:
```tsx
const BTN_PRI = { ...BTN, background: 'var(--accent)', color: 'var(--bg)' }
const BTN_SEC = { ...BTN, background: 'var(--bg-muted)', color: 'var(--text)', border: '1px solid var(--border)' }
const BTN_DNG = { ...BTN, background: 'transparent', color: '#f85149', border: '1px solid #f85149' }
const INPUT = { padding: '0.45rem 0.7rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: '0.9rem', width: '100%', boxSizing: 'border-box' as const }
```

JSX replacements:
- h1 `color: 'var(--text)'`
- Total count span `color: 'var(--text-muted)'`
- Tag cards: `background: 'var(--bg-card)'`, `border: '1px solid var(--border)'`
- Tag name `color: 'var(--text)'`
- Tx count `color: 'var(--text-muted)'`
- Loading/empty `color: 'var(--text-muted)'`

- [ ] **Step 1: Replace hardcoded colors**

- [ ] **Step 2: Commit**
```bash
git add app/(protected)/tags/page.tsx
git commit -m "style: replace hardcoded colors with CSS vars in tags page"
```

---

## Task 10: Fix accounts/page.tsx

**Files:**
- Modify: `app/(protected)/accounts/page.tsx`

```tsx
const BTN_PRI = { ...BTN, background: 'var(--accent)', color: 'var(--bg)' }
const BTN_SEC = { ...BTN, background: 'var(--bg-muted)', color: 'var(--text)', border: '1px solid var(--border)' }
const BTN_DNG = { ...BTN, background: 'transparent', color: '#f85149', border: '1px solid #f85149' }
const INPUT = { padding: '0.45rem 0.7rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: '0.9rem', width: '100%', boxSizing: 'border-box' as const }
const SELECT = { ...INPUT }
const CARD = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px', padding: '1.25rem 1.5rem', marginBottom: '1rem' }
```

JSX replacements:
- h1 `color: 'var(--text)'`
- New account card border: `borderColor: 'var(--accent)'`
- Section h2: `color: 'var(--text-muted)'`
- Account name: `color: 'var(--text)'`
- Currency badge: `color: 'var(--text-muted)'`, `background: 'var(--bg-muted)'`
- Inactive badge: stays `#f85149` (semantic)
- Tx count: `color: 'var(--text-muted)'`
- Loading: `color: 'var(--text-muted)'`
- Reactivate button border/color: stays `#3fb884` (semantic green)
- Form labels: `color: 'var(--text-muted)'`

- [ ] **Step 1: Replace hardcoded colors**

- [ ] **Step 2: Commit**
```bash
git add app/(protected)/accounts/page.tsx
git commit -m "style: replace hardcoded colors with CSS vars in accounts page"
```

---

## Task 11: Fix login/login-form.tsx

**Files:**
- Modify: `app/login/login-form.tsx`

The login form already has isDark state that sets data-theme on document, so CSS vars respond to it automatically. Replace all `isDark ? '#x' : '#y'` color patterns with CSS vars. Keep `isDark` state for the toggle button logic but stop using it for colors.

Replacements:
- `isDark ? '#0d1117' : '#f6f8fa'` -> `'var(--bg)'`
- `isDark ? '#161b22' : '#ffffff'` -> `'var(--bg-card)'`
- `isDark ? '#30363d' : '#d0d7de'` -> `'var(--border)'`
- `isDark ? '#e6edf3' : '#1f2328'` -> `'var(--text)'`
- `isDark ? '#8b949e' : '#636c76'` (or `'#57606a'`) -> `'var(--text-muted)'`
- `isDark ? '#21262d' : '#e1e4e8'` -> `'var(--bg-muted)'`
- `isDark ? '#484f58' : '#8c959f'` -> `'var(--text-subtle)'`
- Logo gradient: stays as-is
- Error color `#f85149`: stays (semantic)
- Focus border `#f0b429`: stays (accent, could be `var(--accent)`)
- Submit active `#f0b429` -> `var(--accent)`, disabled `isDark ? '#21262d' : '#e1e4e8'` -> `var(--bg-muted)`

- [ ] **Step 1: Replace isDark conditional colors with CSS vars**

Main div: `style={{ background: 'var(--bg)' }}`

Theme toggle button:
```tsx
style={{
  background: 'var(--bg-muted)',
  color: 'var(--text-muted)',
  border: `1px solid var(--border)`,
}}
```

Card div:
```tsx
style={{
  background: 'var(--bg-card)',
  border: `1px solid var(--border)`,
  boxShadow: isDark
    ? '0 8px 32px rgba(0,0,0,0.4)'
    : '0 8px 32px rgba(0,0,0,0.08)',
}}
```

h1: `style={{ color: 'var(--text)' }}`
Subtitle p: `style={{ color: 'var(--text-muted)' }}`
Label: `style={{ color: 'var(--text-muted)' }}`

Input:
```tsx
style={{
  background: 'var(--bg)',
  border: `1px solid ${error ? '#f85149' : 'var(--border)'}`,
  color: 'var(--text)',
}}
onFocus={(e) => {
  e.target.style.border = `1px solid ${error ? '#f85149' : 'var(--accent)'}`
}}
onBlur={(e) => {
  e.target.style.border = `1px solid ${error ? '#f85149' : 'var(--border)'}`
}}
```

Submit button:
```tsx
style={{
  background: loading || !password ? 'var(--bg-muted)' : 'var(--accent)',
  color: loading || !password ? 'var(--text-subtle)' : 'var(--bg)',
  cursor: loading || !password ? 'not-allowed' : 'pointer',
}}
```

Footer p: `style={{ color: 'var(--text-subtle)' }}`

- [ ] **Step 2: Commit**
```bash
git add app/login/login-form.tsx
git commit -m "style: replace isDark conditional colors with CSS vars in login form"
```

---

## Task 12: Fix migrate endpoint - add vallow deletion

**Files:**
- Modify: `app/api/migrate/route.ts`

Add a migration entry to delete the vallow account. Use `LOWER(name) = 'vallow'` for case-insensitive match. The DELETE is idempotent (deletes 0 rows if already gone - no error).

- [ ] **Step 1: Add vallow DELETE migration**

```typescript
const migrations: Array<{ name: string; sql: string }> = [
  {
    name: 'transactions.payment_method',
    sql: 'ALTER TABLE transactions ADD COLUMN payment_method TEXT',
  },
  {
    name: 'news_briefs.tickers',
    sql: 'ALTER TABLE news_briefs ADD COLUMN tickers TEXT',
  },
  {
    name: 'accounts.delete_vallow',
    sql: "DELETE FROM accounts WHERE LOWER(name) = 'vallow'",
  },
]
```

- [ ] **Step 2: Commit**
```bash
git add app/api/migrate/route.ts
git commit -m "fix: add vallow account deletion to migrate endpoint"
```

---

## Task 13: Type check and PR

- [ ] **Step 1: Run TypeScript check**
```bash
cd D:\a10101100_labs\root-of-all-blessings\.claude\worktrees\flamboyant-kapitsa-d2bd95
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 2: Push branch and create PR**
```bash
git push -u origin claude/flamboyant-kapitsa-d2bd95
gh pr create --title "fix: light mode CSS variables and vallow deletion" --body "..."
```

- [ ] **Step 3: Merge PR**
```bash
gh pr merge --squash --auto
```

---

## Task 14: Post-merge production steps (manual)

After merge and 3-minute deploy wait:
- POST /api/migrate on prod
- Smoke test light mode toggle
- Verify vallow is gone from accounts page
