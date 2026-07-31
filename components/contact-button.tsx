"use client"

import { useState, useTransition } from "react"
import { Handshake, AlertCircle } from "lucide-react"
import { submitContactRequest } from "@/app/actions"

export function ContactButton({
  candidateId,
  listId,
  employerToken,
}: {
  candidateId: string
  listId: string
  employerToken?: string
}) {
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  if (!employerToken) {
    return (
      <div className="flex items-center gap-2">
        <button
          disabled
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground opacity-40 cursor-not-allowed"
        >
          <Handshake className="size-4" />
          Хочу связаться
        </button>
        <span className="text-xs text-muted-foreground">работодатель не определён</span>
      </div>
    )
  }

  if (sent) {
    return (
      <span className="text-sm text-emerald-600">
        Запрос отправлен — мы свяжемся с кандидатом и уточним его интерес.
      </span>
    )
  }

  const handleClick = () => {
    setError(null)
    startTransition(async () => {
      try {
        await submitContactRequest(candidateId, listId, employerToken)
        setSent(true)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Не удалось отправить запрос")
      }
    })
  }

  return (
    <div className="flex flex-col gap-2 w-fit">
      <button
        onClick={handleClick}
        disabled={isPending}
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Handshake className="size-4" />
        {isPending ? "Отправка…" : "Хочу связаться"}
      </button>

      {error && (
        <div className="flex items-start gap-1.5">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-destructive" />
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}
    </div>
  )
}
