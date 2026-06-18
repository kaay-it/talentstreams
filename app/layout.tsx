import type React from "react"
import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
})

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
})

export const metadata: Metadata = {
  title: "TalentStreams",
  description: "Цифровые визитки и персональные страницы, собираемые из ваших данных.",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ru" className={`bg-background ${geistSans.variable} ${geistMono.variable}`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  )
}
