'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { ThemeToggle } from './theme-toggle'

// ── View types ────────────────────────────────────────────────────────────────

type View = 'budget' | 'portfolio' | 'news'

const VIEW_LABELS: Record<View, string> = {
  budget: 'Budget',
  portfolio: 'Portfolio',
  news: 'News',
}

const VIEW_HOME: Record<View, string> = {
  budget: '/dashboard',
  portfolio: '/portfolio',
  news: '/news',
}

function getView(pathname: string): View {
  if (pathname.startsWith('/portfolio')) return 'portfolio'
  if (pathname.startsWith('/news')) return 'news'
  return 'budget'
}

const BUDGET_MORE = [
  { href: '/accounts', label: 'Accounts' },
  { href: '/tags', label: 'Tags' },
]

// ── Inline SVG icons ──────────────────────────────────────────────────────────

function HomeIcon() {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  )
}

function ListIcon() {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" aria-hidden="true">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  )
}

function PlusIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

function CategoryIcon() {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  )
}

function DotsIcon() {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
    </svg>
  )
}

// ── NavBar ────────────────────────────────────────────────────────────────────

export function NavBar() {
  const pathname = usePathname()
  const router = useRouter()
  const view = getView(pathname)
  const [moreOpen, setMoreOpen] = useState(false)

  function isActive(matchPaths: string[]) {
    return matchPaths.some((p) =>
      p === '/' ? pathname === '/' || pathname === '/dashboard' : pathname.startsWith(p)
    )
  }

  function bottomTabStyle(active: boolean): React.CSSProperties {
    return {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 3,
      minHeight: 56,
      textDecoration: 'none',
      color: active ? 'var(--accent)' : 'var(--text-muted)',
      padding: '4px 0',
      transition: 'color 0.15s',
      WebkitTapHighlightColor: 'transparent',
    }
  }

  const fabStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 48,
    height: 48,
    borderRadius: '50%',
    background: 'var(--accent-gradient)',
    color: 'white',
    boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
    transform: 'translateY(-10px)',
    textDecoration: 'none',
    flexShrink: 0,
    WebkitTapHighlightColor: 'transparent',
    transition: 'opacity 0.15s',
  }

  return (
    <>
      {/* ── Top nav ── */}
      <nav
        aria-label="Top navigation"
        style={{
          background: 'var(--bg-card)',
          borderBottom: '1px solid var(--border)',
          padding: '0 1rem',
          height: '52px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'sticky',
          top: 0,
          zIndex: 40,
        }}
      >
        {/* Logo + View Switcher */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo.svg" alt="Root OS" height={28} style={{ height: '28px', width: 'auto' }} className="logo-dark" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-light.svg" alt="Root OS" height={28} style={{ height: '28px', width: 'auto' }} className="logo-light" />

          {/* View Switcher — inline pills */}
          <div style={{ display: 'flex', gap: '4px' }}>
            {(['budget', 'portfolio', 'news'] as View[]).map((v) => {
              const active = view === v
              return (
                <button
                  key={v}
                  aria-pressed={active}
                  onClick={() => { if (!active) router.push(VIEW_HOME[v]) }}
                  style={{
                    background: active ? 'var(--accent)' : 'transparent',
                    border: '1px solid var(--border)',
                    borderRadius: '999px',
                    color: active ? 'white' : 'var(--text-muted)',
                    fontSize: '12px',
                    fontWeight: active ? 600 : 400,
                    cursor: 'pointer',
                    padding: '3px 10px',
                    minHeight: '28px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    whiteSpace: 'nowrap',
                    transition: 'background 0.15s, color 0.15s',
                  }}
                >
                  {VIEW_LABELS[v]}
                </button>
              )
            })}
          </div>
        </div>

        {/* Right side */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          <ThemeToggle />
          <form action="/api/auth/logout" method="POST">
            <button
              type="submit"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                fontSize: '13px',
                cursor: 'pointer',
                padding: '4px 8px',
                minHeight: '44px',
                display: 'inline-flex',
                alignItems: 'center',
              }}
            >
              Sign out
            </button>
          </form>
        </div>
      </nav>

      {/* ── Bottom tab bar — mobile only ── */}
      <nav
        aria-label="Bottom navigation"
        className="sm:hidden"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          background: 'var(--bg-card)',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'stretch',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        {view === 'budget' ? (
          <>
            {/* Dashboard */}
            <Link
              href="/dashboard"
              data-active={String(isActive(['/', '/dashboard']))}
              style={bottomTabStyle(isActive(['/', '/dashboard']))}
            >
              <HomeIcon />
              <span style={{ fontSize: '10px', fontWeight: 500 }}>Dashboard</span>
            </Link>

            {/* Transactions */}
            <Link
              href="/transactions"
              data-active={String(isActive(['/transactions']))}
              style={bottomTabStyle(isActive(['/transactions']))}
            >
              <ListIcon />
              <span style={{ fontSize: '10px', fontWeight: 500 }}>Transactions</span>
            </Link>

            {/* Add — raised accent FAB */}
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Link href="/add" aria-label="Add transaction" style={fabStyle}>
                <PlusIcon size={26} />
              </Link>
            </div>

            {/* Categories */}
            <Link
              href="/categories"
              data-active={String(isActive(['/categories']))}
              style={bottomTabStyle(isActive(['/categories']))}
            >
              <CategoryIcon />
              <span style={{ fontSize: '10px', fontWeight: 500 }}>Categories</span>
            </Link>

            {/* More */}
            <button
              onClick={() => setMoreOpen(true)}
              style={{
                ...bottomTabStyle(moreOpen),
                background: 'none',
                border: 'none',
                cursor: 'pointer',
              } as React.CSSProperties}
            >
              <DotsIcon />
              <span style={{ fontSize: '10px', fontWeight: 500 }}>More</span>
            </button>
          </>
        ) : (
          /* Portfolio / News — FAB only */
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {view === 'portfolio' ? (
              <Link href="/portfolio" aria-label="Upload portfolio snapshot" style={fabStyle}>
                <PlusIcon size={26} />
              </Link>
            ) : (
              <button
                aria-label="Add news"
                style={{ ...fabStyle, cursor: 'pointer', border: 'none', padding: 0 }}
                onClick={() => window.dispatchEvent(new CustomEvent('news:open-upload'))}
              >
                <PlusIcon size={26} />
              </button>
            )}
          </div>
        )}
      </nav>

      {/* ── Budget More sheet — mobile only ── */}
      {moreOpen && view === 'budget' && (
        <div className="sm:hidden">
          {/* Backdrop */}
          <div
            onClick={() => setMoreOpen(false)}
            role="presentation"
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 60,
              background: 'rgba(0,0,0,0.5)',
            }}
          />
          {/* Sheet */}
          <div
            role="dialog"
            aria-label="More options"
            style={{
              position: 'fixed',
              bottom: 0,
              left: 0,
              right: 0,
              zIndex: 61,
              background: 'var(--bg-card)',
              borderRadius: '16px 16px 0 0',
              borderTop: '1px solid var(--border)',
              paddingTop: 8,
              paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)',
              boxShadow: '0 -4px 24px rgba(0,0,0,0.4)',
            }}
          >
            {/* Drag handle */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0 12px' }}>
              <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border)' }} />
            </div>
            {BUDGET_MORE.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMoreOpen(false)}
                style={{
                  display: 'block',
                  color: pathname.startsWith(item.href) ? 'var(--accent)' : 'var(--text)',
                  textDecoration: 'none',
                  padding: '14px 20px',
                  fontSize: '15px',
                  fontWeight: pathname.startsWith(item.href) ? 500 : 400,
                }}
              >
                {item.label}
              </Link>
            ))}
            <div style={{ borderTop: '1px solid var(--border)', margin: '8px 0' }} />
            <form action="/api/auth/logout" method="POST">
              <button
                type="submit"
                style={{
                  width: '100%',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  fontSize: '15px',
                  cursor: 'pointer',
                  padding: '14px 20px',
                  textAlign: 'left',
                  minHeight: '44px',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
