import type { ReactNode } from 'react'
import { Header } from '@/components/Header'
import './tokens.css'
import './globals.css'

export const metadata = { title: 'Adjustment Support', description: 'Market-supported adjustments for appraisal workfiles' }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-bg text-text">
        <Header />
        <main>{children}</main>
      </body>
    </html>
  )
}
