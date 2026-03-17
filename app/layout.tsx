import type { Metadata } from 'next'
import 'react-notion-x/src/styles.css'
import './globals.css'
import './notion-overrides.css'

export const metadata: Metadata = {
  title: 'Blog',
  description: 'My Notion Blog',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}
