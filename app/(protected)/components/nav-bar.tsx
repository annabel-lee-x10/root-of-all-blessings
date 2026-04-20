'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { ThemeToggle } from './theme-toggle'

const TOP_TABS = [
  {
    href: '/',
    label: "Where's My Money",
    matchPaths: ['/', '/transactions', '/accounts', '/categories', '/tax', '/tags', '/settings', '/dashboard'],
  },
  { href: '/news', label: 'News', matchPaths: ['/news'] },
  { href: '/portfolio', label: 'Portfolio', matchPaths: ['/portfolio'] },
]

const WMM_SUB = [
  { href: '/transactions', label: 'Transactions' },
  { href: '/accounts', label: 'Accounts' },
  { href: '/categories', label: 'Categories' },
  { href: '/tax', label: 'Tax' },
]

const MORE_ITEMS = [
  { href: '/categories', label: 'Categories' },
  { href: '/accounts', label: 'Accounts' },
  { href: '/tags', label: 'Tags' },
  { href: '/news', label: 'News' },
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

function ChartIcon() {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="10" width="5" height="11" rx="0.5" />
      <rect x="9" y="4" width="5" height="17" rx="0.5" />
      <rect x="16" y="7" width="5" height="14" rx="0.5" />
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
  const [subOpen, setSubOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)

  function isTabActive(tab: (typeof TOP_TABS)[0]) {
    return tab.matchPaths.some((p) =>
      p === '/' ? pathname === '/' || pathname === '/dashboard' : pathname.startsWith(p)
    )
  }

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

  function isBottomTabActive(matchPaths: string[]) {
    return matchPaths.some((p) =>
      p === '/' ? pathname === '/' || pathname === '/dashboard' : pathname.startsWith(p)
    )
  }

  function bottomTabLinkStyle(active: boolean): React.CSSProperties {
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
        {/* Logo */}
        <div style={{ flexShrink: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo.svg" alt="Root OS" height={28} style={{ height: '28px', width: 'auto' }} className="logo-dark" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-light.svg" alt="Root OS" height={28} style={{ height: '28px', width: 'auto' }} className="logo-light" />
        </div>

        {/* Desktop tabs */}
        <div
          className="hidden sm:flex"
          style={{ alignItems: 'center', gap: '2px', flex: 1, padding: '0 0.75rem' }}
        >
          {TOP_TABS.map((tab) => {
            const active = isTabActive(tab)
            if (tab.href === '/') {
              return (
                <div key={tab.href} style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                  <Link href={tab.href} style={tabStyle(active)} data-active={String(active)}>
                    {tab.label}
                  </Link>
                  <button
                    aria-label="Where's My Money sub-menu"
                    onClick={() => setSubOpen((v) => !v)}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: active ? 'var(--accent)' : 'var(--text-muted)',
                      padding: '2px 4px', fontSize: '10px', lineHeight: 1,
                    }}
                  >
                    {subOpen ? '▲' : '▼'}
                  </button>
                  {subOpen && (
                    <div
                      style={{
                        position: 'absolute', top: '100%', left: 0,
                        background: 'var(--bg-subtle)', border: '1px solid var(--border)',
                        borderRadius: '8px', padding: '4px 0',
                        marginTop: '4px', minWidth: '140px', zIndex: 50,
                        boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                      }}
                    >
                      {WMM_SUB.map((sub) => (
                        <Link
                          key={sub.href}
                          href={sub.href}
                          onClick={() => setSubOpen(false)}
                          style={{
                            display: 'block',
                            color: pathname.startsWith(sub.href) ? 'var(--accent)' : 'var(--text)',
                            textDecoration: 'none',
                            padding: '8px 14px',
                            fontSize: '13px',
                          }}
                        >
                          {sub.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )
            }
            return (
              <Link key={tab.href} href={tab.href} style={tabStyle(active)} data-active={String(active)}>
                {tab.label}
              </Link>
            )
          })}
        </div>

        {/* Right side */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          <ThemeToggle />
          <form action="/api/auth/logout" method="POST">
            <button
              type="submit"
              style={{
                background: 'none', border: 'none', color: 'var(--text-muted)',
                fontSize: '13px', cursor: 'pointer', padding: '4px 8px',
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
        {/* Dashboard */}
        <Link
          href="/dashboard"
          data-active={String(isBottomTabActive(['/', '/dashboard']))}
          style={bottomTabLinkStyle(isBottomTabActive(['/', '/dashboard']))}
        >
          <HomeIcon />
          <span style={{ fontSize: '10px', fontWeight: 500 }}>Dashboard</span>
        </Link>

        {/* Transactions */}
        <Link
          href="/transactions"
          data-active={String(isBottomTabActive(['/transactions']))}
          style={bottomTabLinkStyle(isBottomTabActive(['/transactions']))}
        >
          <ListIcon />
          <span style={{ fontSize: '10px', fontWeight: 500 }}>Transactions</span>
        </Link>

        {/* Add — raised accent FAB */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Link
            href="/dashboard"
            aria-label="Add transaction"
            style={{
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
            }}
          >
            <PlusIcon size={26} />
          </Link>
        </div>

        {/* Portfolio */}
        <Link
          href="/portfolio"
          data-active={String(isBottomTabActive(['/portfolio']))}
          style={bottomTabLinkStyle(isBottomTabActive(['/portfolio']))}
        >
          <ChartIcon />
          <span style={{ fontSize: '10px', fontWeight: 500 }}>Portfolio</span>
        </Link>

        {/* More */}
        <button
          onClick={() => setMoreOpen(true)}
          style={{
            ...bottomTabLinkStyle(moreOpen),
            background: 'none',
            border: 'none',
            cursor: 'pointer',
          } as React.CSSProperties}
        >
          <DotsIcon />
          <span style={{ fontSize: '10px', fontWeight: 500 }}>More</span>
        </button>
      </nav>

      {/* ── More sheet — mobile only ── */}
      {moreOpen && (
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
            {MORE_ITEMS.map((item) => (
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
