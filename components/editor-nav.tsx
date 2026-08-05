"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { MailOpen, Building2, Handshake, Settings, Users, Layers } from "lucide-react"

const NAV_ITEMS = [
  { label: "Выпуски", href: "/editor", icon: MailOpen },
  { label: "Работодатели", href: "/editor/employers", icon: Building2 },
  { label: "Кандидаты", href: "/editor/candidates", icon: Users },
  { label: "Запросы", href: "/editor/requests", icon: Handshake },
  { label: "Стримы", href: "/editor/streams", icon: Layers },
  { label: "Настройки", href: "/editor/settings", icon: Settings },
]

export function EditorNav() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const secret = searchParams.get("secret")
  const suffix = secret ? `?secret=${secret}` : ""

  return (
    <nav className="flex-1 px-3 py-4 space-y-0.5">
      {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
        const isActive = pathname === href
        return (
          <Link
            key={href}
            href={`${href}${suffix}`}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <Icon className="size-4 shrink-0" />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
