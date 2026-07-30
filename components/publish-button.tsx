"use client"

import { useState } from "react"
import { publishMailingList, type PublishResult } from "@/app/actions"
import { Send, CheckCircle, AlertCircle, Loader2 } from "lucide-react"

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; result: PublishResult }
  | { status: "error"; message: string }

export function PublishButton({
  listId,
  alreadySent = false,
  bookEmpty = false,
}: {
  listId: string
  alreadySent?: boolean
  bookEmpty?: boolean
}) {
  const [state, setState] = useState<State>({ status: "idle" })

  async function handlePublish() {
    if (state.status === "loading") return
    setState({ status: "loading" })
    try {
      const result = await publishMailingList(listId)
      setState({ status: "success", result })
    } catch (err) {
      setState({ status: "error", message: err instanceof Error ? err.message : "Неизвестная ошибка" })
    }
  }

  if (bookEmpty) {
    return (
      <button
        disabled
        title="Адресная книга пустая — нет подписчиков в этом стриме"
        className="inline-flex items-center gap-1.5 rounded-lg border border-input bg-background px-3 py-1.5 text-sm font-medium text-muted-foreground opacity-50 cursor-not-allowed"
      >
        <AlertCircle className="size-4" />
        Нет подписчиков
      </button>
    )
  }

  if (state.status === "success") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-emerald-600">
        <CheckCircle className="size-4" />
        Кампания #{state.result.campaignId} запущена
      </span>
    )
  }

  if (state.status === "error") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-destructive" title={state.message}>
        <AlertCircle className="size-4" />
        Ошибка
      </span>
    )
  }

  const label = state.status === "loading" ? "Отправка…" : alreadySent ? "Отправить повторно" : "Отправить"

  return (
    <button
      onClick={handlePublish}
      disabled={state.status === "loading"}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 ${
        alreadySent
          ? "border border-input bg-background text-foreground"
          : "bg-primary text-primary-foreground"
      }`}
    >
      {state.status === "loading" ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Send className="size-4" />
      )}
      {label}
    </button>
  )
}
