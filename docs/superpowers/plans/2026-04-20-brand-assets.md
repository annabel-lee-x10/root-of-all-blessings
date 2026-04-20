# Root OS Brand Assets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate Root OS brand assets (favicons, logos, CSS tokens, duotone icons) into the Next.js 16 App Router project and wire them up in layout metadata, globals.css, and nav-bar component.

**Architecture:** Place all brand assets in `public/brand/` as static files served from the Next.js public root. Wire favicons via `metadata.icons` in `app/layout.tsx`. Import the CSS token file with a relative `@import` (build-time inlining by Lightning CSS / Tailwind v4 PostCSS). Replace exact-matching hardcoded hex values with CSS variable references. Swap the nav-bar's inline SVG logo with a plain `<img>` pointing to `/brand/logo-mark.svg`. The existing `app/favicon.ico` is left in place (file-based convention); the metadata `icons` array adds the brand PNG/SVG sizes on top.

**Tech Stack:** Next.js 16.2.4 (App Router), Tailwind CSS v4 (`@tailwindcss/postcss`), Lightning CSS (via Tailwind), Vitest 4, TypeScript 5

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Create | `public/brand/tokens.css` | CSS custom properties for all Root OS brand colours |
| Create | `public/brand/favicon.svg` | SVG favicon (placeholder – replace with final art) |
| Create | `public/brand/favicon-16.png` | 16×16 PNG favicon placeholder |
| Create | `public/brand/favicon-32.png` | 32×32 PNG favicon placeholder |
| Create | `public/brand/favicon-180.png` | 180×180 Apple touch icon placeholder |
| Create | `public/brand/favicon-512.png` | 512×512 PWA icon placeholder |
| Create | `public/brand/logo.svg` | Wordmark logo for dark backgrounds (placeholder) |
| Create | `public/brand/logo-light.svg` | Wordmark logo for light backgrounds (placeholder) |
| Create | `public/brand/logo-mark.svg` | Coin/mark only (placeholder – used in nav-bar) |
| Create | `public/brand/icons/` | Directory for 27 duotone SVG icons |
| Modify | `app/globals.css` | Add `@import` for tokens.css |
| Modify | `app/layout.tsx` | Add `metadata.icons` for brand favicons |
| Modify | `app/(protected)/components/nav-bar.tsx` | Replace inline SVG logo with `<img>` |
| Modify | 12 TSX files + globals.css | Replace `#e6edf3` → `var(--root-paper)` |

---

### Task 1: Create `public/brand/tokens.css`

**Files:**
- Create: `public/brand/tokens.css`

- [ ] **Step 1: Create the tokens file**

```css
/* public/brand/tokens.css */
:root {
  --root-orange: #CC5500;
  --root-ember: #F4A542;
  --root-graphite: #2a2f37;
  --root-ink: #0f1217;
  --root-paper: #e6edf3;
  --root-cream: #f5f0e8;
}
```

- [ ] **Step 2: Commit**

```bash
git add public/brand/tokens.css
git commit -m "feat: add Root OS brand token CSS custom properties"
```

---

### Task 2: Create placeholder SVG assets

**Files:**
- Create: `public/brand/favicon.svg`
- Create: `public/brand/logo.svg`
- Create: `public/brand/logo-light.svg`
- Create: `public/brand/logo-mark.svg`
- Create: `public/brand/icons/` (directory placeholder)

> **Note:** These are minimal valid placeholder SVGs. Replace with final brand artwork before shipping.

- [ ] **Step 1: Create favicon.svg** — SVG favicon (32×32, orange coin on dark background)

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
  <rect width="32" height="32" rx="6" fill="#0f1217"/>
  <circle cx="16" cy="16" r="11" fill="#CC5500"/>
  <text x="16" y="21" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="14" fill="#f5f0e8">R</text>
</svg>
```

- [ ] **Step 2: Create logo.svg** — wordmark for dark backgrounds

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 32" width="120" height="32">
  <rect width="120" height="32" fill="none"/>
  <circle cx="16" cy="16" r="11" fill="#CC5500"/>
  <text x="16" y="21" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="14" fill="#f5f0e8">R</text>
  <text x="34" y="21" font-family="sans-serif" font-weight="600" font-size="14" fill="#e6edf3">Root OS</text>
</svg>
```

- [ ] **Step 3: Create logo-light.svg** — wordmark for light backgrounds

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 32" width="120" height="32">
  <rect width="120" height="32" fill="none"/>
  <circle cx="16" cy="16" r="11" fill="#CC5500"/>
  <text x="16" y="21" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="14" fill="#f5f0e8">R</text>
  <text x="34" y="21" font-family="sans-serif" font-weight="600" font-size="14" fill="#0f1217">Root OS</text>
</svg>
```

- [ ] **Step 4: Create logo-mark.svg** — coin/mark only (28×28, replaces nav-bar inline SVG)

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="28" height="28">
  <rect width="28" height="28" rx="8" fill="#CC5500"/>
  <text x="14" y="20" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="14" fill="#f5f0e8">R</text>
</svg>
```

- [ ] **Step 5: Create icons placeholder**

Create `public/brand/icons/README.md` (this creates the directory):

```markdown
# Root OS Duotone Icons

This directory contains 27 duotone SVG icons for the Root OS brand.
Replace with final artwork. Each icon should be a 24×24 SVG using
--root-orange (#CC5500) and --root-ember (#F4A542) as the duotone pair.
```

- [ ] **Step 6: Commit**

```bash
git add public/brand/
git commit -m "feat: add Root OS brand SVG asset placeholders"
```

---

### Task 3: Create placeholder PNG favicons

**Files:**
- Create: `public/brand/favicon-16.png`
- Create: `public/brand/favicon-32.png`
- Create: `public/brand/favicon-180.png`
- Create: `public/brand/favicon-512.png`

> These are minimal valid solid-colour PNG files (#CC5500) at the correct dimensions. Replace with final artwork.

- [ ] **Step 1: Generate PNG files using Python**

Run this script from the project root:

```bash
python3 - <<'EOF'
import struct, zlib, pathlib

def make_png(width, height, r, g, b):
    def chunk(t, d):
        c = t + d
        return struct.pack('>I', len(d)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)
    ihdr = chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0))
    raw = b''.join(b'\x00' + bytes([r, g, b] * width) for _ in range(height))
    idat = chunk(b'IDAT', zlib.compress(raw))
    iend = chunk(b'IEND', b'')
    return b'\x89PNG\r\n\x1a\n' + ihdr + idat + iend

pathlib.Path('public/brand').mkdir(parents=True, exist_ok=True)
for size, name in [(16,'favicon-16'),(32,'favicon-32'),(180,'favicon-180'),(512,'favicon-512')]:
    pathlib.Path(f'public/brand/{name}.png').write_bytes(make_png(size, size, 0xCC, 0x55, 0x00))
    print(f'Created public/brand/{name}.png ({size}x{size})')
EOF
```

Expected output:
```
Created public/brand/favicon-16.png (16x16)
Created public/brand/favicon-32.png (32x32)
Created public/brand/favicon-180.png (180x180)
Created public/brand/favicon-512.png (512x512)
```

- [ ] **Step 2: Verify the files exist**

```bash
ls -la public/brand/*.png
```

Expected: 4 files listed with non-zero sizes.

- [ ] **Step 3: Commit**

```bash
git add public/brand/favicon-16.png public/brand/favicon-32.png public/brand/favicon-180.png public/brand/favicon-512.png
git commit -m "feat: add Root OS brand PNG favicon placeholders"
```

---

### Task 4: Import tokens.css in `app/globals.css`

**Files:**
- Modify: `app/globals.css`

The `@tailwindcss/postcss` plugin uses Lightning CSS which inlines `@import` paths resolved relative to the source file at build time. From `app/globals.css`, the relative path to `public/brand/tokens.css` is `../public/brand/tokens.css`.

- [ ] **Step 1: Update globals.css**

Current file (`app/globals.css`):
```css
@import "tailwindcss";

:root {
  --bg: #0d1117;
  ...
```

Updated file — add the import on line 2, after the Tailwind import:
```css
@import "tailwindcss";
@import "../public/brand/tokens.css";

:root {
  --bg: #0d1117;
  --bg-card: #161b22;
  --border: #30363d;
  --text: var(--root-paper);
  --text-muted: #8b949e;
  --accent: #f0b429;
}

[data-theme="light"] {
  --bg: #f6f8fa;
  --bg-card: #ffffff;
  --border: #d0d7de;
  --text: #1f2328;
  --text-muted: #636c76;
  --accent: #d4a017;
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

Note: `--text: var(--root-paper)` replaces `--text: #e6edf3` in globals.css itself — this counts as one of the `#e6edf3` replacements from Task 6.

- [ ] **Step 2: Commit**

```bash
git add app/globals.css
git commit -m "feat: import brand tokens.css into globals.css, replace --text hex with var(--root-paper)"
```

---

### Task 5: Update `app/layout.tsx` favicon metadata

**Files:**
- Modify: `app/layout.tsx`

Next.js 16 App Router resolves `metadata.icons` URLs relative to the public root. Paths starting with `/` refer to files in `public/`.

The existing `app/favicon.ico` is kept (file-based convention generates `<link rel="icon" href="/favicon.ico" sizes="any" />`). The `metadata.icons` array adds the brand-sized variants on top.

- [ ] **Step 1: Update layout.tsx**

```tsx
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Root OS',
  description: 'Root of All Blessings - Personal finance tracker',
  icons: {
    icon: [
      { url: '/brand/favicon.svg', type: 'image/svg+xml' },
      { url: '/brand/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/brand/favicon-16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: [
      { url: '/brand/favicon-180.png', sizes: '180x180', type: 'image/png' },
    ],
    other: [
      { rel: 'icon', url: '/brand/favicon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark">
      <body>{children}</body>
    </html>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/layout.tsx
git commit -m "feat: add brand favicon metadata to root layout"
```

---

### Task 6: Replace `#e6edf3` with `var(--root-paper)` in TSX files

**Files to modify** (all occurrences of `#e6edf3`, case-insensitive):
- `app/(protected)/accounts/page.tsx`
- `app/(protected)/categories/page.tsx`
- `app/(protected)/components/expense-dashboard.tsx`
- `app/(protected)/components/nav-bar.tsx`
- `app/(protected)/components/recent-transactions.tsx`
- `app/(protected)/components/wheres-my-money.tsx`
- `app/(protected)/news/news-client.tsx`
- `app/(protected)/settings/page.tsx`
- `app/(protected)/tags/page.tsx`
- `app/(protected)/tax/page.tsx`
- `app/(protected)/transactions/page.tsx`
- `app/login/login-form.tsx`

> `app/globals.css` was already handled in Task 4.

In all these files, `#e6edf3` appears inside inline `style={{ color: '#e6edf3' }}` or similar style objects. Replace every occurrence with `var(--root-paper)`.

- [ ] **Step 1: Bulk replace in all TSX files**

```bash
# From the project root — replaces all case-insensitive occurrences
grep -rl --include='*.tsx' -i '#e6edf3' app/ | xargs sed -i 's/#e6edf3/var(--root-paper)/gi; s/#E6EDF3/var(--root-paper)/g'
```

- [ ] **Step 2: Verify no occurrences remain**

```bash
grep -ri '#e6edf3' app/ --include='*.tsx' --include='*.css'
```

Expected: no output (zero matches).

- [ ] **Step 3: Commit**

```bash
git add app/
git commit -m "feat: replace hardcoded #e6edf3 with var(--root-paper) across components"
```

---

### Task 7: Update nav-bar logo to use `/brand/logo-mark.svg`

**Files:**
- Modify: `app/(protected)/components/nav-bar.tsx`

The nav-bar has a logo area (lines 66–79) with a `<div>` containing a gradient background and an inline `<svg>`. Replace this with a plain `<img>` tag pointing to `/brand/logo-mark.svg`. No `next/image` needed — SVGs from `public/` don't need optimisation and `<img>` avoids the required-width constraint.

The `img-src 'self'` CSP in `next.config.ts` permits `/brand/logo-mark.svg` since it's served from `'self'`.

- [ ] **Step 1: Replace the logo section in nav-bar.tsx**

Find and replace this block (lines 66–79 in current file):

```tsx
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <div
            style={{
              width: '28px', height: '28px', borderRadius: '8px',
              background: 'linear-gradient(135deg, #f0b429 0%, #d4a017 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L8 8H4l4 4-2 6 6-3 6 3-2-6 4-4h-4L12 2z" fill="white" opacity="0.9" />
            </svg>
          </div>
          <span style={{ color: 'var(--root-paper)', fontWeight: 600, fontSize: '14px' }}>Root OS</span>
        </div>
```

Replace with:

```tsx
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-mark.svg" alt="" width={28} height={28} style={{ flexShrink: 0 }} />
          <span style={{ color: 'var(--root-paper)', fontWeight: 600, fontSize: '14px' }}>Root OS</span>
        </div>
```

> The `alt=""` is intentional — the text "Root OS" beside the mark already labels it; the mark itself is decorative.

- [ ] **Step 2: Run nav-bar tests to verify nothing is broken**

```bash
npx vitest run tests/components/nav-bar.test.tsx
```

Expected output: all 12 tests pass.

- [ ] **Step 3: Commit**

```bash
git add app/(protected)/components/nav-bar.tsx
git commit -m "feat: replace nav-bar inline SVG with /brand/logo-mark.svg"
```

---

### Task 8: Run full test suite and create PR

**Files:** none

- [ ] **Step 1: Run full test suite**

```bash
npm test
```

Expected: all tests pass. If any fail, investigate before continuing. Do **not** skip or suppress failures.

- [ ] **Step 2: Verify public/brand/ directory structure**

```bash
ls -R public/brand/
```

Expected:
```
public/brand/:
favicon-16.png  favicon-180.png  favicon-32.png  favicon-512.png  favicon.svg
icons/  logo-light.svg  logo.svg  logo-mark.svg  tokens.css

public/brand/icons/:
README.md
```

- [ ] **Step 3: Create PR (do not merge)**

```bash
gh pr create \
  --title "feat: integrate Root OS brand assets" \
  --body "$(cat <<'EOF'
## Summary
- Adds \`public/brand/\` with tokens.css, SVG/PNG favicon placeholders, logo SVGs, and icon directory stub
- Wires brand favicons into Next.js App Router via \`metadata.icons\` in \`app/layout.tsx\`
- Imports brand CSS tokens into \`app/globals.css\` via relative \`@import\`
- Replaces all hardcoded \`#e6edf3\` occurrences with \`var(--root-paper)\` across 12 component files
- Replaces nav-bar inline SVG logo with \`<img src=\"/brand/logo-mark.svg\">\`

## Notes
- SVG and PNG files are **placeholders** — replace with final brand artwork before ship
- The 27 duotone icons directory (\`public/brand/icons/\`) is stubbed; add final SVG files by name
- Existing \`app/favicon.ico\` is kept (Next.js file convention); brand PNGs are added via metadata on top

## Test plan
- [ ] \`npm test\` — all tests pass
- [ ] Browser: favicon appears in tab (after \`npm run dev\`)
- [ ] Nav-bar logo renders without broken-image icon
- [ ] CSS custom properties resolve (inspect element: \`--root-paper\` is \`#e6edf3\`)
EOF
)"
```

---

## Self-Review

**Spec coverage:**
- ✅ Task 1–3: `public/brand/` with all named files (tokens.css, 4 PNGs, 4 SVGs, icons/ dir)
- ✅ Task 5: favicon metadata in layout
- ✅ Task 4: `@import` in globals.css
- ✅ Task 6: `#e6edf3` → `var(--root-paper)` (the only brand hex that appears in the codebase; others — `#CC5500`, `#F4A542`, `#2a2f37`, `#0f1217`, `#f5f0e8` — do not appear)
- ✅ Task 7: logo references updated to `/brand/logo.svg` / `/brand/logo-mark.svg`
- ✅ Task 8: tests run, PR created, not merged

**BUGS.md / TEST_STRATEGY.md:** Neither file exists in the worktree — nothing to read.

**Placeholder scan:** No TBD/TODO in plan. Task 2 and 3 explicitly label SVGs/PNGs as placeholders with replacement instructions.

**Type consistency:** No shared types introduced; only CSS strings and `Metadata` from `next`.
