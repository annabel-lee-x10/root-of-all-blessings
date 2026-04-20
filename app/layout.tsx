import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Root OS',
  description: 'Root of All Blessings - Personal finance tracker',
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
