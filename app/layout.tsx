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
    apple: { url: '/brand/favicon-180.png', sizes: '180x180', type: 'image/png' },
    other: [{ rel: 'icon', url: '/brand/favicon-512.png', sizes: '512x512', type: 'image/png' }],
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){var t=localStorage.getItem('theme');document.documentElement.setAttribute('data-theme',t==='light'?'light':'dark');})();` }} />
      </head>
      <body>{children}</body>
    </html>
  )
}
