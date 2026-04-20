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

export function NavBar() {
  const pathname = usePathname()
  const [subOpen, setSubOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

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

  return (
    <>
      <nav
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
          <img src="/brand/logo.svg" alt="Root OS" height={28} className="logo-dark" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-light.svg" alt="Root OS" height={28} className="logo-light" />
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
          <button
            className="sm:hidden"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
            style={{
              background: 'none', border: '1px solid var(--border)', color: 'var(--text-muted)',
              cursor: 'pointer', padding: '4px 8px', borderRadius: '6px',
              fontSize: '16px', lineHeight: 1,
            }}
          >
            {mobileOpen ? '×' : '≡'}
          </button>
        </div>
      </nav>

      {/* Mobile dropdown */}
      {mobileOpen && (
        <div
          className="sm:hidden"
          style={{
            background: 'var(--bg-card)',
            borderBottom: '1px solid var(--border)',
            padding: '4px 0',
            position: 'sticky',
            top: '52px',
            zIndex: 39,
          }}
        >
          {TOP_TABS.map((tab) => {
            const active = isTabActive(tab)
            return (
              <Link
                key={tab.href}
                href={tab.href}
                onClick={() => setMobileOpen(false)}
                style={{
                  display: 'block',
                  color: active ? 'var(--accent)' : 'var(--text)',
                  textDecoration: 'none',
                  padding: '11px 1rem',
                  fontSize: '14px',
                  fontWeight: active ? 500 : 400,
                  borderLeft: `3px solid ${active ? 'var(--accent)' : 'transparent'}`,
                }}
              >
                {tab.label}
              </Link>
            )
          })}
          <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
          {WMM_SUB.map((sub) => (
            <Link
              key={sub.href}
              href={sub.href}
              onClick={() => setMobileOpen(false)}
              style={{
                display: 'block',
                color: pathname.startsWith(sub.href) ? 'var(--accent)' : 'var(--text-muted)',
                textDecoration: 'none',
                padding: '9px 1.5rem',
                fontSize: '13px',
              }}
            >
              {sub.label}
            </Link>
          ))}
        </div>
      )}
    </>
  )
}
