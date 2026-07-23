"use client"

import { useState } from "react"
import { ChevronDown, ChevronUp } from "lucide-react"

type Campaign = {
  id: number
  name: string
  status: string
  created?: string
}

const STATUS_LABEL: Record<string, string> = {
  sent: "Отправлено",
  active_sending: "Отправляется",
  scheduled: "Запланировано",
  draft: "Черновик",
  moderation: "На модерации",
  failed: "Ошибка",
}

const STATUS_COLOR: Record<string, string> = {
  sent: "text-emerald-600",
  active_sending: "text-blue-500",
  scheduled: "text-amber-500",
  failed: "text-destructive",
}

export function CampaignHistory({ campaigns }: { campaigns: Campaign[] }) {
  const [open, setOpen] = useState(false)

  if (!campaigns.length) return null

  return (
    <div className="border-t px-5 py-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        {open ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
        {open ? "Скрыть историю" : `История отправок (${campaigns.length})`}
      </button>

      {open && (
        <ul className="mt-2 space-y-1.5">
          {campaigns.map((c) => (
            <li key={c.id} className="flex items-center gap-2 text-xs">
              <span className={`font-medium ${STATUS_COLOR[c.status] ?? "text-muted-foreground"}`}>
                {STATUS_LABEL[c.status] ?? c.status}
              </span>
              <span className="text-muted-foreground">{c.name}</span>
              {c.created && (
                <span className="ml-auto text-muted-foreground/60">{c.created}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
