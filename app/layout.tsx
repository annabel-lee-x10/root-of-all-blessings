import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Root OS',
  description: 'Root of All Blessings - Personal finance tracker',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark">
      <body>{children}</body>
    </html>
  )
}
