'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

const NAV_LINKS = [
  { href: '/', label: "Where's My Money" },
  { href: '/transactions', label: 'Transactions' },
  { href: '/portfolio', label: 'Portfolio' },
  { href: '/news', label: 'News' },
  { href: '/accounts', label: 'Accounts' },
  { href: '/categories', label: 'Categories' },
  { href: '/tags', label: 'Tags' },
  { href: '/settings', label: 'Settings' },
]

export function NavBar() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  function isActive(href: string) {
    return href === '/' ? pathname === '/' || pathname === '/dashboard' : pathname.startsWith(href)
  }

  function linkStyle(active: boolean): React.CSSProperties {
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
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L8 8H4l4 4-2 6 6-3 6 3-2-6 4-4h-4L12 2z" fill="white" opacity="0.9" />
            </svg>
          </div>
          <span style={{ color: '#e6edf3', fontWeight: 600, fontSize: '14px' }}>Root OS</span>
        </div>

        {/* Desktop nav links */}
        <div
          className="hidden sm:flex"
          style={{ alignItems: 'center', gap: '2px', flex: 1, padding: '0 0.75rem', overflow: 'hidden' }}
        >
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} style={linkStyle(isActive(link.href))}>
              {link.label}
            </Link>
          ))}
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

          {/* Mobile menu button */}
          <button
            className="sm:hidden"
            onClick={() => setOpen(!open)}
            aria-label="Toggle menu"
            style={{
              background: 'none', border: '1px solid #30363d', color: '#8b949e',
              cursor: 'pointer', padding: '4px 8px', borderRadius: '6px',
              fontSize: '16px', lineHeight: 1,
            }}
          >
            {open ? '×' : '≡'}
          </button>
        </div>
      </nav>

      {/* Mobile dropdown */}
      {open && (
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
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              style={{
                display: 'block',
                color: isActive(link.href) ? '#f0b429' : '#e6edf3',
                textDecoration: 'none',
                padding: '11px 1rem',
                fontSize: '14px',
                fontWeight: isActive(link.href) ? 500 : 400,
                borderLeft: `3px solid ${isActive(link.href) ? '#f0b429' : 'transparent'}`,
              }}
            >
              {link.label}
            </Link>
          ))}
        </div>
      )}
    </>
  )
}
