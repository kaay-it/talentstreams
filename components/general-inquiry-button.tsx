"use client"

import { useState, useTransition } from "react"
import { MessageCircle, AlertCircle } from "lucide-react"
import { submitGeneralInquiry } from "@/app/actions"

export function GeneralInquiryButton({
  listId,
  employerToken,
}: {
  listId: string
  employerToken: string
}) {
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  if (sent) {
    return (
      <p className="text-sm text-emerald-600">
        Запрос отправлен — мы свяжемся с вами в ближайшее время.
      </p>
    )
  }

  const handleClick = () => {
    setError(null)
    startTransition(async () => {
      try {
        await submitGeneralInquiry(listId, employerToken)
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
        className="inline-flex items-center gap-2 rounded-lg border border-primary px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/10 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <MessageCircle className="size-4" />
        {isPending ? "Отправка…" : "Связаться с нами"}
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
