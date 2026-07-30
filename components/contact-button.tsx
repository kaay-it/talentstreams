"use client"

import { useState } from "react"
import { Handshake } from "lucide-react"

export function ContactButton({ candidateId, listId }: { candidateId: string; listId: string }) {
  const [sent, setSent] = useState(false)

  if (sent) {
    return (
      <span className="text-sm text-emerald-600">
        Запрос отправлен — мы свяжемся с кандидатом и уточним его интерес.
      </span>
    )
  }

  return (
    <button
      onClick={() => setSent(true)}
      className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
    >
      <Handshake className="size-4" />
      Хочу связаться
    </button>
  )
}
