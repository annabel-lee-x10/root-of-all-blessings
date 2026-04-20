# CSS Variables, Account Optgroups & Vallow Cleanup

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all hardcoded hex colors in inline `style` props with CSS variables so light/dark toggle works; add `<optgroup>` grouping to the account dropdown; remove the defunct "vallow" account entry.

**Architecture:** Add semantic CSS variables to `globals.css` (dark defaults + `[data-theme="light"]` overrides). Swap every hardcoded hex in `style={}` props across six components to `var(--xxx)`. The `login-form.tsx` also drops its redundant `isDark ? darkHex : lightHex` conditional style logic since the CSS variables handle it. `portfolio-client.tsx` already has its own `DARK`/`LIGHT` theme system — fix only the single stray hardcoded hex. Remove vallow from `scripts/import-andromoney.ts` and its tests.

**Tech Stack:** Next.js 16 / React 19, plain CSS custom properties in `app/globals.css`, TypeScript, Vitest

---

## Color variable reference

### New variables to add (dark defaults, light overrides)

| Variable | Dark | Light | Semantic use |
|---|---|---|---|
| `--bg-subtle` | `#1c2128` | `#f0f2f5` | nested card / dropdown bg |
| `--bg-dim` | `#21262d` | `#e1e4e8` | disabled bg / row separator |
| `--text-dim` | `#484f58` | `#8c959f` | very muted / disabled text |
| `--red` | `#f85149` | `#cf222e` | expense / error |
| `--green` | `#3fb884` | `#1a7f37` | income / success |
| `--bg-success` | `#1a4731` | `#dafbe1` | toast success bg |
| `--bg-error` | `#4a1717` | `#ffebe9` | toast error bg |
| `--border-success` | `rgba(46,160,67,0.5)` | same | toast success border |
| `--border-error` | `rgba(248,81,73,0.5)` | `rgba(207,34,46,0.5)` | toast error border |
| `--accent-faint` | `rgba(240,180,41,0.10)` | `rgba(212,160,23,0.10)` | accent tinted bg (pills, buttons) |
| `--accent-muted` | `rgba(240,180,41,0.25)` | `rgba(212,160,23,0.25)` | accent mid (borders, panels) |
| `--accent-soft` | `rgba(240,180,41,0.40)` | `rgba(212,160,23,0.40)` | accent strong border |
| `--green-faint` | `rgba(63,184,132,0.10)` | `rgba(26,127,55,0.10)` | success tinted bg |
| `--green-muted` | `rgba(63,184,132,0.25)` | `rgba(26,127,55,0.25)` | success border |
| `--accent-gradient` | `linear-gradient(135deg, #f0b429 0%, #d4a017 100%)` | same | logo / branding gradient |

### Existing variables (already in globals.css — reference only)
- `--bg` → `#0d1117` / `#f6f8fa`
- `--bg-card` → `#161b22` / `#ffffff`
- `--border` → `#30363d` / `#d0d7de`
- `--text` → `#e6edf3` / `#1f2328`
- `--text-muted` → `#8b949e` / `#636c76`
- `--accent` → `#f0b429` / `#d4a017`

---

## Task 1 — Add CSS variables to globals.css

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: Extend globals.css**

Replace the entire file with:

```css
@import "tailwindcss";

:root {
  --bg: #0d1117;
  --bg-card: #161b22;
  --border: #30363d;
  --text: #e6edf3;
  --text-muted: #8b949e;
  --accent: #f0b429;

  --bg-subtle: #1c2128;
  --bg-dim: #21262d;
  --text-dim: #484f58;
  --red: #f85149;
  --green: #3fb884;
  --bg-success: #1a4731;
  --bg-error: #4a1717;
  --border-success: rgba(46, 160, 67, 0.5);
  --border-error: rgba(248, 81, 73, 0.5);
  --accent-faint: rgba(240, 180, 41, 0.10);
  --accent-muted: rgba(240, 180, 41, 0.25);
  --accent-soft: rgba(240, 180, 41, 0.40);
  --green-faint: rgba(63, 184, 132, 0.10);
  --green-muted: rgba(63, 184, 132, 0.25);
  --accent-gradient: linear-gradient(135deg, #f0b429 0%, #d4a017 100%);
}

[data-theme="light"] {
  --bg: #f6f8fa;
  --bg-card: #ffffff;
  --border: #d0d7de;
  --text: #1f2328;
  --text-muted: #636c76;
  --accent: #d4a017;

  --bg-subtle: #f0f2f5;
  --bg-dim: #e1e4e8;
  --text-dim: #8c959f;
  --red: #cf222e;
  --green: #1a7f37;
  --bg-success: #dafbe1;
  --bg-error: #ffebe9;
  --border-success: rgba(46, 160, 67, 0.5);
  --border-error: rgba(207, 34, 46, 0.5);
  --accent-faint: rgba(212, 160, 23, 0.10);
  --accent-muted: rgba(212, 160, 23, 0.25);
  --accent-soft: rgba(212, 160, 23, 0.40);
  --green-faint: rgba(26, 127, 55, 0.10);
  --green-muted: rgba(26, 127, 55, 0.25);
  --accent-gradient: linear-gradient(135deg, #f0b429 0%, #d4a017 100%);
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  -webkit-font-smoothing: antialiased;
}
```

- [ ] **Step 2: Commit**

```bash
git add app/globals.css
git commit -m "feat: add semantic CSS variables for light/dark theme"
```

---

## Task 2 — Refactor recent-transactions.tsx

**Files:**
- Modify: `app/(protected)/components/recent-transactions.tsx`

**Hex → var mapping:**
| Hex | Variable |
|---|---|
| `#f85149` | `var(--red)` |
| `#3fb884` | `var(--green)` |
| `#8b949e` | `var(--text-muted)` |
| `#161b22` | `var(--bg-card)` |
| `#30363d` | `var(--border)` |
| `#21262d` | `var(--bg-dim)` |
| `#e6edf3` | `var(--text)` |
| `#484f58` | `var(--text-dim)` |

- [ ] **Step 1: Update typeColor function (lines 16-20)**

```tsx
function typeColor(type: string) {
  if (type === 'expense') return 'var(--red)'
  if (type === 'income') return 'var(--green)'
  return 'var(--text-muted)'
}
```

- [ ] **Step 2: Replace hex colors in JSX style props**

Apply the mapping table above throughout the file. Key changes:

```tsx
// h2 heading (line ~77-80)
style={{
  color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600,
  letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 12px',
}}

// card container (line ~84-90)
style={{
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: '12px',
  overflow: 'hidden',
}}

// loading/empty divs (lines ~93, 97)
style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px' }}

// row div (line ~106-112)
style={{
  display: 'flex', alignItems: 'center', gap: '12px',
  padding: '11px 16px',
  borderBottom: '1px solid var(--bg-dim)',
}}

// primary text span (line ~122)
style={{ color: 'var(--text)', fontSize: '14px', fontWeight: 500 }}

// tags span (line ~126)
style={{ color: 'var(--text-muted)', fontSize: '11px' }}

// datetime span (line ~132)
style={{ color: 'var(--text-dim)', fontSize: '12px' }}

// account span (line ~135)
style={{ color: 'var(--text-dim)', fontSize: '12px' }}

// payment_method span (line ~141)
style={{ color: 'var(--text-muted)', fontSize: '12px' }}

// note span (line ~146)
style={{ color: 'var(--text-muted)', fontSize: '12px', fontStyle: 'italic' }}

// delete button (line ~166-173)
style={{
  background: 'none', border: 'none',
  color: 'var(--text-dim)',
  cursor: deletingId === tx.id ? 'not-allowed' : 'pointer',
  padding: '4px 6px', fontSize: '16px', lineHeight: 1,
  flexShrink: 0, borderRadius: '4px',
  transition: 'color 0.1s',
}}
onMouseEnter={(e) => { if (deletingId !== tx.id) (e.currentTarget as HTMLElement).style.color = 'var(--red)' }}
onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-dim)' }}

// "Show more" link (line ~184-187)
style={{ color: 'var(--text-muted)', fontSize: '12px', textDecoration: 'none', fontWeight: 500 }}
```

- [ ] **Step 3: Run tests**

```bash
npm test
```
Expected: all pass (no component tests for this file, but overall suite should be green).

- [ ] **Step 4: Commit**

```bash
git add app/(protected)/components/recent-transactions.tsx
git commit -m "feat: replace hardcoded hex with CSS vars in recent-transactions"
```

---

## Task 3 — Refactor expense-dashboard.tsx

**Files:**
- Modify: `app/(protected)/components/expense-dashboard.tsx`

**Hex → var mapping:**
| Hex | Variable |
|---|---|
| `#1c2128` | `var(--bg-subtle)` |
| `#30363d` | `var(--border)` |
| `#8b949e` | `var(--text-muted)` |
| `#e6edf3` | `var(--text)` |
| `#161b22` | `var(--bg-card)` |
| `#0d1117` | `var(--bg)` |
| `#f0b429` | `var(--accent)` |
| `#f85149` | `var(--red)` |
| `#3fb884` | `var(--green)` |
| `#484f58` | `var(--text-dim)` |
| `#21262d` | `var(--bg-dim)` |
| `rgba(240,180,41,0.12)` | `var(--accent-faint)` |

- [ ] **Step 1: Replace top-level style constants (lines 36-57)**

```tsx
const card: React.CSSProperties = {
  background: 'var(--bg-subtle)',
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

- [ ] **Step 2: Replace hex in JSX style props**

```tsx
// outer card container (line ~99-104)
style={{
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: '12px',
  padding: '1.25rem 1.5rem',
}}

// h2 heading (line ~108)
style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', margin: 0 }}

// range buttons (lines ~118-127)
style={{
  padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 500,
  cursor: 'pointer',
  border: range === r.id ? '1px solid var(--accent)' : '1px solid var(--border)',
  background: range === r.id ? 'var(--accent-faint)' : 'transparent',
  color: range === r.id ? 'var(--accent)' : 'var(--text-muted)',
}}

// custom date inputs (lines ~147-165)
style={{
  background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px',
  color: 'var(--text)', padding: '6px 10px', fontSize: '13px', width: '100%',
  boxSizing: 'border-box',
}}

// error text (line ~172)
style={{ color: 'var(--red)', fontSize: '13px', textAlign: 'center', padding: '1rem 0' }}

// Total Spend value color (line ~183)
style={{ ...valueStyle, color: loading ? 'var(--text-dim)' : 'var(--red)' }}

// Income value color (line ~191)
style={{ ...valueStyle, color: loading ? 'var(--text-dim)' : 'var(--green)' }}

// Daily Avg value color (line ~199)
style={{ ...valueStyle, color: loading ? 'var(--text-dim)' : 'var(--text)' }}

// Budget value color (line ~207-208)
style={{ ...valueStyle, color: 'var(--text-dim)', fontSize: '18px' }}

// SGD sub-labels (lines ~186, 194, 202, 210)
style={{ color: 'var(--text-dim)', fontSize: '11px', marginTop: '2px' }}

// category name (line ~221)
style={{ color: 'var(--text)', fontSize: '13px', minWidth: '100px' }}

// progress bar bg (line ~222)
style={{ flex: 1, background: 'var(--bg-dim)', borderRadius: '4px', height: '6px', overflow: 'hidden' }}

// progress bar fill (line ~223)
style={{ width: `${Math.min(100, cat.pct)}%`, height: '100%', background: 'var(--accent)', borderRadius: '4px' }}

// category total (line ~225)
style={{ color: 'var(--text-muted)', fontSize: '12px', minWidth: '48px', textAlign: 'right' }}

// category pct (line ~228)
style={{ color: 'var(--text-dim)', fontSize: '11px', minWidth: '38px', textAlign: 'right' }}
```

- [ ] **Step 3: Commit**

```bash
git add app/(protected)/components/expense-dashboard.tsx
git commit -m "feat: replace hardcoded hex with CSS vars in expense-dashboard"
```

---

## Task 4 — Refactor nav-bar.tsx

**Files:**
- Modify: `app/(protected)/components/nav-bar.tsx`

**Hex → var mapping:**
| Hex | Variable |
|---|---|
| `#f0b429` | `var(--accent)` |
| `#8b949e` | `var(--text-muted)` |
| `#161b22` | `var(--bg-card)` |
| `#30363d` | `var(--border)` |
| `#e6edf3` | `var(--text)` |
| `#1c2128` | `var(--bg-subtle)` |
| `rgba(240,180,41,0.08)` | `var(--accent-faint)` |
| `linear-gradient(135deg, #f0b429 0%, #d4a017 100%)` | `var(--accent-gradient)` |

- [ ] **Step 1: Update tabStyle function (lines 34-47)**

```tsx
function tabStyle(active: boolean): React.CSSProperties {
  return {
    color: active ? 'var(--accent)' : 'var(--text-muted)',
    textDecoration: 'none',
    fontSize: '13px',
    fontWeight: active ? 500 : 400,
    padding: '4px 10px',
    borderRadius: '6px',
    background: active ? 'var(--accent-faint)' : 'transparent',
    whiteSpace: 'nowrap',
    transition: 'color 0.1s',
    display: 'inline-block',
  }
}
```

- [ ] **Step 2: Replace hex in nav JSX style props**

```tsx
// nav element (lines ~52-63)
style={{
  background: 'var(--bg-card)',
  borderBottom: '1px solid var(--border)',
  padding: '0 1rem', height: '52px',
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  position: 'sticky', top: 0, zIndex: 40,
}}

// logo icon div (lines ~68-72)
style={{
  width: '28px', height: '28px', borderRadius: '8px',
  background: 'var(--accent-gradient)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
}}

// logo text (line ~78)
style={{ color: 'var(--text)', fontWeight: 600, fontSize: '14px' }}

// sub-menu dropdown (lines ~108-114)
style={{
  position: 'absolute', top: '100%', left: 0,
  background: 'var(--bg-subtle)', border: '1px solid var(--border)',
  borderRadius: '8px', padding: '4px 0',
  marginTop: '4px', minWidth: '140px', zIndex: 50,
  boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
}}

// sub-menu links (line ~122)
style={{
  display: 'block',
  color: pathname.startsWith(sub.href) ? 'var(--accent)' : 'var(--text)',
  textDecoration: 'none', padding: '8px 14px', fontSize: '13px',
}}

// chevron button (lines ~98-101)
style={{
  background: 'none', border: 'none', cursor: 'pointer',
  color: active ? 'var(--accent)' : 'var(--text-muted)',
  padding: '2px 4px', fontSize: '10px', lineHeight: 1,
}}

// sign out button (lines ~149-152)
style={{
  background: 'none', border: 'none', color: 'var(--text-muted)',
  fontSize: '13px', cursor: 'pointer', padding: '4px 8px',
}}

// mobile hamburger button (lines ~162-165)
style={{
  background: 'none', border: '1px solid var(--border)', color: 'var(--text-muted)',
  cursor: 'pointer', padding: '4px 8px', borderRadius: '6px',
  fontSize: '16px', lineHeight: 1,
}}

// mobile dropdown container (lines ~176-182)
style={{
  background: 'var(--bg-card)',
  borderBottom: '1px solid var(--border)',
  padding: '4px 0', position: 'sticky', top: '52px', zIndex: 39,
}}

// mobile main links (lines ~192-200)
style={{
  display: 'block',
  color: active ? 'var(--accent)' : 'var(--text)',
  textDecoration: 'none', padding: '11px 1rem',
  fontSize: '14px', fontWeight: active ? 500 : 400,
  borderLeft: `3px solid ${active ? 'var(--accent)' : 'transparent'}`,
}}

// mobile divider (line ~206)
style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }}

// mobile sub-links (lines ~211-217)
style={{
  display: 'block',
  color: pathname.startsWith(sub.href) ? 'var(--accent)' : 'var(--text-muted)',
  textDecoration: 'none', padding: '9px 1.5rem', fontSize: '13px',
}}
```

- [ ] **Step 3: Commit**

```bash
git add app/(protected)/components/nav-bar.tsx
git commit -m "feat: replace hardcoded hex with CSS vars in nav-bar"
```

---

## Task 5 — Refactor toast.tsx

**Files:**
- Modify: `app/(protected)/components/toast.tsx`

- [ ] **Step 1: Replace toast style (lines 29-40)**

```tsx
style={{
  padding: '10px 16px',
  borderRadius: '8px',
  fontSize: '13px',
  fontWeight: 500,
  boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
  background: t.type === 'success' ? 'var(--bg-success)' : 'var(--bg-error)',
  color: t.type === 'success' ? 'var(--green)' : 'var(--red)',
  border: `1px solid ${t.type === 'success' ? 'var(--border-success)' : 'var(--border-error)'}`,
}}
```

- [ ] **Step 2: Commit**

```bash
git add app/(protected)/components/toast.tsx
git commit -m "feat: replace hardcoded hex with CSS vars in toast"
```

---

## Task 6 — Refactor login-form.tsx

**Files:**
- Modify: `app/login/login-form.tsx`

Note: `isDark` state is kept for the theme toggle button icon (sun/moon SVG) and for toggling `data-theme` on the html element, but all style color expressions (`isDark ? darkHex : lightHex`) are replaced with single CSS variable references.

- [ ] **Step 1: Replace all inline hex/conditional colors**

The page wrapper div (line ~56-59):
```tsx
style={{ background: 'var(--bg)' }}
```

Theme toggle button (line ~64-68):
```tsx
style={{
  background: 'var(--bg-dim)',
  color: 'var(--text-muted)',
  border: '1px solid var(--border)',
}}
```

Card div (line ~86-91):
```tsx
style={{
  background: 'var(--bg-card)',
  border: `1px solid var(--border)`,
  boxShadow: isDark ? '0 8px 32px rgba(0,0,0,0.4)' : '0 8px 32px rgba(0,0,0,0.08)',
}}
```
(box-shadow stays conditional since the opacity is theme-aesthetic, not a named color)

h1 heading (line ~104):
```tsx
style={{ color: 'var(--text)' }}
```

Subtitle paragraph (line ~108):
```tsx
style={{ color: 'var(--text-muted)' }}
```

Password label (line ~118):
```tsx
style={{ color: 'var(--text-muted)' }}
```

Password input (lines ~133-137):
```tsx
style={{
  background: 'var(--bg)',
  border: `1px solid ${error ? 'var(--red)' : 'var(--border)'}`,
  color: 'var(--text)',
}}
onFocus={(e) => {
  e.target.style.border = `1px solid ${error ? 'var(--red)' : 'var(--accent)'}`
}}
onBlur={(e) => {
  e.target.style.border = `1px solid ${error ? 'var(--red)' : 'var(--border)'}`
}}
```

Error message (line ~148):
```tsx
style={{ color: 'var(--red)' }}
```

Submit button (lines ~157-161):
```tsx
style={{
  background: loading || !password ? 'var(--bg-dim)' : 'var(--accent)',
  color: loading || !password ? 'var(--text-dim)' : 'var(--bg)',
  cursor: loading || !password ? 'not-allowed' : 'pointer',
}}
```

Footer text (line ~178):
```tsx
style={{ color: 'var(--text-dim)' }}
```

Logo gradient div (line ~96):
```tsx
style={{ background: 'var(--accent-gradient)' }}
```

- [ ] **Step 2: Commit**

```bash
git add app/login/login-form.tsx
git commit -m "feat: replace hardcoded hex with CSS vars in login-form"
```

---

## Task 7 — Refactor wheres-my-money.tsx + add account optgroups

**Files:**
- Modify: `app/(protected)/components/wheres-my-money.tsx`

**Hex → var mapping:**
| Hex | Variable |
|---|---|
| `#0d1117` | `var(--bg)` |
| `#30363d` | `var(--border)` |
| `#e6edf3` | `var(--text)` |
| `#161b22` | `var(--bg-card)` |
| `#8b949e` | `var(--text-muted)` |
| `#f0b429` | `var(--accent)` |
| `#1c2128` | `var(--bg-subtle)` |
| `#21262d` | `var(--bg-dim)` |
| `#484f58` | `var(--text-dim)` |
| `#3fb884` | `var(--green)` |
| `#f85149` | `var(--red)` |
| `#f0b42920` | `var(--accent-faint)` |
| `#f0b42915` | `var(--accent-faint)` |
| `#f0b42940` | `var(--accent-muted)` |
| `#f0b42960` | `var(--accent-soft)` |
| `rgba(240,180,41,0.12)` | `var(--accent-faint)` |
| `rgba(240,180,41,0.08)` | `var(--accent-faint)` |
| `rgba(63,184,132,0.1)` | `var(--green-faint)` |
| `rgba(63,184,132,0.25)` | `var(--green-muted)` |

- [ ] **Step 1: Update inputStyle and selectStyle constants (lines 21-36)**

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

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
}
```

- [ ] **Step 2: Update pillBtn function (lines 271-283)**

```tsx
function pillBtn(active: boolean): React.CSSProperties {
  return {
    padding: '6px 16px', borderRadius: '20px', fontSize: '13px',
    fontWeight: 500, cursor: 'pointer',
    border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
    background: active ? 'var(--accent-faint)' : 'transparent',
    color: active ? 'var(--accent)' : 'var(--text-muted)',
    transition: 'all 0.15s',
  }
}
```

- [ ] **Step 3: Replace hex in all JSX style props**

Card container (line ~289-295):
```tsx
style={{
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: '12px',
  padding: '1.5rem',
}}
```

h2 heading (line ~298):
```tsx
style={{ color: 'var(--text)', fontSize: '15px', fontWeight: 600, margin: 0 }}
```

Paste Receipt button (lines ~304-311):
```tsx
style={{
  display: 'flex', alignItems: 'center', gap: '5px',
  padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border)',
  background: pasteOpen ? 'var(--accent-faint)' : 'transparent',
  color: pasteOpen ? 'var(--accent)' : 'var(--text-muted)',
  fontSize: '13px', fontWeight: 500, cursor: 'pointer', minHeight: '36px',
}}
```

Paste panel div (lines ~323-326):
```tsx
style={{
  background: 'var(--bg)', border: '1px solid var(--accent-muted)',
  borderRadius: '10px', padding: '1rem', marginBottom: '1.25rem',
}}
```

Fill Form button (lines ~351-356):
```tsx
style={{
  width: '100%', padding: '10px', borderRadius: '8px', border: 'none',
  fontSize: '14px', fontWeight: 600, cursor: pasteText.trim() ? 'pointer' : 'not-allowed',
  background: pasteText.trim() ? 'var(--accent)' : 'var(--bg-dim)',
  color: pasteText.trim() ? 'var(--bg)' : 'var(--text-dim)',
}}
```

Pre-fill indicator div (lines ~365-370):
```tsx
style={{
  display: 'flex', alignItems: 'center', gap: '6px',
  background: 'var(--green-faint)', border: '1px solid var(--green-muted)',
  borderRadius: '8px', padding: '8px 12px', marginBottom: '1rem',
  fontSize: '13px', color: 'var(--green)',
}}
```

FX rate span (line ~435):
```tsx
style={{ color: 'var(--text-muted)', fontSize: '13px', whiteSpace: 'nowrap', flexShrink: 0 }}
```

Tag pill spans (lines ~511-515):
```tsx
style={{
  background: 'var(--accent-faint)', border: '1px solid var(--accent-soft)',
  borderRadius: '12px', padding: '2px 10px', fontSize: '12px',
  color: 'var(--accent)', cursor: 'pointer', userSelect: 'none',
}}
```

Tag dropdown container (lines ~531-535):
```tsx
style={{
  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
  background: 'var(--bg-subtle)', border: '1px solid var(--border)',
  borderRadius: '8px', marginTop: '4px', maxHeight: '180px', overflowY: 'auto',
}}
```

Tag dropdown items (line ~541):
```tsx
style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '13px', color: 'var(--text)' }}
onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--border)' }}
onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
```

Create tag item (line ~551):
```tsx
style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '13px', color: 'var(--accent)' }}
onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--border)' }}
onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
```

Add note button (lines ~567-571):
```tsx
style={{
  background: 'none', border: 'none', color: 'var(--text-muted)',
  fontSize: '13px', cursor: 'pointer', marginBottom: '12px', padding: 0,
}}
```

Submit button (lines ~598-614):
```tsx
style={{
  width: '100%', padding: '10px', borderRadius: '8px', border: 'none',
  fontSize: '14px', fontWeight: 600,
  cursor: canSubmit ? 'pointer' : 'not-allowed',
  background: canSubmit ? 'var(--accent)' : 'var(--bg-dim)',
  color: canSubmit ? 'var(--bg)' : 'var(--text-dim)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  gap: '8px', transition: 'all 0.15s',
}}
```

`<style>` tag (lines ~629-638):
```tsx
<style>{`
  @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  input[type="number"]::-webkit-outer-spin-button,
  input[type="number"]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
  input[type="number"] { -moz-appearance: textfield; }
  input::placeholder, textarea::placeholder { color: var(--text-dim); }
  select option { background: var(--bg-card); color: var(--text); }
  input[type="datetime-local"]::-webkit-calendar-picker-indicator { filter: invert(0.5); cursor: pointer; }
  input[type="date"]::-webkit-calendar-picker-indicator { filter: invert(0.5); cursor: pointer; }
`}</style>
```

- [ ] **Step 4: Add account type constants and optgroup grouping**

Add after the `CURRENCIES` constant (line ~8):

```tsx
import type { Account, Category, Tag, TxType, AccountType } from '@/lib/types'

const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  bank: 'Bank',
  wallet: 'Wallet',
  cash: 'Cash',
  fund: 'Fund',
}
const ACCOUNT_TYPE_ORDER: AccountType[] = ['bank', 'wallet', 'cash', 'fund']
```

Note: the `import` line replaces the existing one that already imports `Account, Category, Tag, TxType` — just add `AccountType` to it.

- [ ] **Step 5: Replace flat account options with grouped optgroups**

Replace the Account select (lines ~445-451):
```tsx
<select value={accountId} onChange={(e) => setAccountId(e.target.value)} required style={selectStyle}>
  <option value="">Account</option>
  {ACCOUNT_TYPE_ORDER.map((type) => {
    const group = activeAccounts.filter((a) => a.type === type)
    if (group.length === 0) return null
    return (
      <optgroup key={type} label={ACCOUNT_TYPE_LABELS[type]}>
        {group.map((a) => (
          <option key={a.id} value={a.id}>{a.name}</option>
        ))}
      </optgroup>
    )
  })}
</select>
```

Replace the To Account select (lines ~454-460):
```tsx
<select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)} required style={selectStyle}>
  <option value="">To Account</option>
  {ACCOUNT_TYPE_ORDER.map((type) => {
    const group = activeAccounts.filter((a) => a.type === type && a.id !== accountId)
    if (group.length === 0) return null
    return (
      <optgroup key={type} label={ACCOUNT_TYPE_LABELS[type]}>
        {group.map((a) => (
          <option key={a.id} value={a.id}>{a.name}</option>
        ))}
      </optgroup>
    )
  })}
</select>
```

- [ ] **Step 6: Run tests**

```bash
npm test
```
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add app/(protected)/components/wheres-my-money.tsx
git commit -m "feat: CSS vars in wheres-my-money + optgroup account dropdown"
```

---

## Task 8 — Fix stray hardcoded hex in portfolio-client.tsx

**Files:**
- Modify: `app/(protected)/portfolio/portfolio-client.tsx`

This component has its own DARK/LIGHT theme system (`C` and `T` objects). The single stray hardcoded hex at line 343 (`#06D6A0`) bypasses this system.

- [ ] **Step 1: Add teal to the DARK and LIGHT theme objects (lines 9-32)**

```tsx
const DARK = {
  bg:     '#0E1117',
  card:   '#161C27',
  border: '#242C3A',
  pale:   '#C8D0DC',
  mid:    '#6B7A92',
  inset:  '#0A0D14',
  orange: '#E8520A',
  green:  '#3DD68C',
  red:    '#FF5A5A',
  yellow: '#F5C842',
  teal:   '#06D6A0',
}
const LIGHT = {
  bg:     '#F1F5F9',
  card:   '#FFFFFF',
  border: '#CBD5E1',
  pale:   '#1E293B',
  mid:    '#64748B',
  inset:  '#E2E8F0',
  orange: '#E8520A',
  green:  '#16A34A',
  red:    '#DC2626',
  yellow: '#D97706',
  teal:   '#06D6A0',
}
```

- [ ] **Step 2: Replace hardcoded hex at line 343**

```tsx
// Before:
style={{ ...TAG, background: '#06D6A022', color: '#06D6A0' }}

// After:
style={{ ...TAG, background: C.teal + '22', color: C.teal }}
```

- [ ] **Step 3: Commit**

```bash
git add app/(protected)/portfolio/portfolio-client.tsx
git commit -m "feat: fix stray hardcoded hex in portfolio-client"
```

---

## Task 9 — Delete vallow from import-andromoney.ts + update tests

**Files:**
- Modify: `scripts/import-andromoney.ts`
- Modify: `tests/import-andromoney.test.ts`

- [ ] **Step 1: Remove vallow from ACCOUNT_NAME_MAP (line 360 in import-andromoney.ts)**

Delete this line:
```ts
'vallow':               'vallow',
```

- [ ] **Step 2: Remove vallow from ACCOUNT_TYPE_HINTS (line 368)**

Delete this line:
```ts
'vallow':           'wallet',
```

- [ ] **Step 3: Update tests — remove vallow assertions**

In `tests/import-andromoney.test.ts`, in the `normaliseAccountName` describe block, remove the `'vallow'` assertion from the `'maps special accounts'` test:

```ts
// Before:
it('maps special accounts', () => {
  expect(normaliseAccountName('vallow')).toBe('vallow')
  expect(normaliseAccountName('Lalamove Easyvan')).toBe('Lalamove Easyvan')
  expect(normaliseAccountName('2024 Japan')).toBe('2024 Japan')
})

// After:
it('maps special accounts', () => {
  expect(normaliseAccountName('Lalamove Easyvan')).toBe('Lalamove Easyvan')
  expect(normaliseAccountName('2024 Japan')).toBe('2024 Japan')
})
```

Delete the entire `'returns wallet for vallow'` test (lines ~285-287):
```ts
// DELETE this entire block:
it('returns wallet for vallow', () => {
  expect(guessAccountType('vallow')).toBe('wallet')
})
```

- [ ] **Step 4: Run tests**

```bash
npm test
```
Expected: all pass (vallow test cases removed, remaining tests still pass).

- [ ] **Step 5: Commit**

```bash
git add scripts/import-andromoney.ts tests/import-andromoney.test.ts
git commit -m "chore: remove vallow account from import mapping and tests"
```

---

## Task 10 — Create PR

- [ ] **Step 1: Push branch**

```bash
git push -u origin claude/mystifying-neumann-5f4af7
```

- [ ] **Step 2: Create PR targeting main**

```bash
gh pr create \
  --base main \
  --title "feat: CSS variables for theme toggle, account optgroups, remove vallow" \
  --body "$(cat <<'EOF'
## Summary
- Add 15 semantic CSS variables to globals.css so light/dark toggle works across all components
- Replace ~80 hardcoded hex colors in inline style props across 7 TSX files with CSS variables
- Add \`<optgroup>\` grouping (Bank / Wallet / Cash / Fund) to account dropdown in Where's My Money form
- Remove defunct vallow account from import mapping and tests

## Files changed
- \`app/globals.css\` — new semantic variables + light overrides
- \`app/(protected)/components/recent-transactions.tsx\`
- \`app/(protected)/components/expense-dashboard.tsx\`
- \`app/(protected)/components/nav-bar.tsx\`
- \`app/(protected)/components/toast.tsx\`
- \`app/login/login-form.tsx\`
- \`app/(protected)/components/wheres-my-money.tsx\`
- \`app/(protected)/portfolio/portfolio-client.tsx\`
- \`scripts/import-andromoney.ts\`
- \`tests/import-andromoney.test.ts\`

## Test plan
- [ ] Run \`npm test\` — all pass
- [ ] Toggle light/dark on login page — colors update correctly
- [ ] Toggle light/dark on dashboard — all components update (cards, text, borders, toasts)
- [ ] Add a transaction — account dropdown shows Bank / Wallet / Cash / Fund optgroups
- [ ] "vallow" no longer appears in import account mapping

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review

**Spec coverage:**
- ✅ All hardcoded hex colors in inline style props → CSS variables (7 files)
- ✅ Light/dark toggle works — CSS variables respond to `[data-theme="light"]` on `<html>`
- ✅ Delete vallow from accounts (import-andromoney.ts + tests)
- ✅ Add optgroup to Recent Transactions account dropdown (wheres-my-money.tsx — this is the component that hosts the account select on the same page as RecentTransactions)
- ✅ Branch from main (worktree is already on `claude/mystifying-neumann-5f4af7` branched from main)
- ✅ PR creation

**No placeholders:** All steps contain exact code.

**Type consistency:** `AccountType` is imported from `@/lib/types` (already exported there). `ACCOUNT_TYPE_ORDER: AccountType[]` and `ACCOUNT_TYPE_LABELS: Record<AccountType, string>` are consistent.
