'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

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
      color: active ? '#f0b429' : '#8b949e',
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

  return (
    <>
      <nav
        style={{
          background: '#161b22',
          borderBottom: '1px solid #30363d',
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <div
            style={{
              width: '28px', height: '28px', borderRadius: '8px',
              background: 'linear-gradient(135deg, #f0b429 0%, #d4a017 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}
          >
            {/* Option 1 (default): ascending bar chart + trend line */}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <rect x="2" y="17" width="5" height="5" rx="1" fill="white" fillOpacity="0.75"/>
              <rect x="9" y="12" width="5" height="10" rx="1" fill="white" fillOpacity="0.75"/>
              <rect x="16" y="5" width="5" height="17" rx="1" fill="white" fillOpacity="0.75"/>
              <path d="M4 17 L11 12 L18 5 L22 2" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {/* Option 2: coin with R — swap above svg with this to use
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9" fill="white" fillOpacity="0.2" stroke="white" strokeWidth="1.5"/>
              <text x="12" y="16.5" textAnchor="middle" fontSize="11" fontWeight="700" fill="white">R</text>
            </svg>
            */}
          </div>
          <span style={{ color: '#e6edf3', fontWeight: 600, fontSize: '14px' }}>Root OS</span>
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
                      color: active ? '#f0b429' : '#8b949e',
                      padding: '2px 4px', fontSize: '10px', lineHeight: 1,
                    }}
                  >
                    {subOpen ? '▲' : '▼'}
                  </button>
                  {subOpen && (
                    <div
                      style={{
                        position: 'absolute', top: '100%', left: 0,
                        background: '#1c2128', border: '1px solid #30363d',
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
                            color: pathname.startsWith(sub.href) ? '#f0b429' : '#e6edf3',
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
          <form action="/api/auth/logout" method="POST">
            <button
              type="submit"
              style={{
                background: 'none', border: 'none', color: '#8b949e',
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
              background: 'none', border: '1px solid #30363d', color: '#8b949e',
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
            background: '#161b22',
            borderBottom: '1px solid #30363d',
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
                  color: active ? '#f0b429' : '#e6edf3',
                  textDecoration: 'none',
                  padding: '11px 1rem',
                  fontSize: '14px',
                  fontWeight: active ? 500 : 400,
                  borderLeft: `3px solid ${active ? '#f0b429' : 'transparent'}`,
                }}
              >
                {tab.label}
              </Link>
            )
          })}
          <div style={{ borderTop: '1px solid #30363d', margin: '4px 0' }} />
          {WMM_SUB.map((sub) => (
            <Link
              key={sub.href}
              href={sub.href}
              onClick={() => setMobileOpen(false)}
              style={{
                display: 'block',
                color: pathname.startsWith(sub.href) ? '#f0b429' : '#8b949e',
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
