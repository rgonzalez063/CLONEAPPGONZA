import type { ReactNode } from 'react'
import Link from 'next/link'
import './tokens.css'
import './globals.css'

export const metadata = { title: 'Adjustment Support', description: 'Market-supported adjustments for appraisal workfiles' }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-bg text-text">
        <header className="flex items-center gap-4 border-b border-border px-4 py-2">
          <Link href="/" className="text-base font-semibold">Adjustment Support</Link>
          <nav className="flex gap-4 text-sm text-text-muted">
            <Link href="/sessions">Sessions</Link>
            <Link href="/design">Design</Link>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  )
}
