import type { Metadata } from 'next'
import './globals.css'

import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { MeProvider } from '@/context/me-provider'
import { ThemeProvider } from '@/context/theme-provider'

export const metadata: Metadata = {
  title: 'Noti World',
  description: 'CodePen을 이용하여 평가를 합니다.',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      {/* 📌 pretendard.variable을 빼고 기본 폰트 클래스 사용 */}
      <body className="antialiased font-sans">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <TooltipProvider>
            <MeProvider>{children}</MeProvider>
          </TooltipProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}