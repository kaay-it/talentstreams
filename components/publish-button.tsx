"use client"

import { useState } from "react"
import { publishMailingList, type PublishResult, type EmployerWithoutSelection } from "@/app/actions"
import { Send, CheckCircle, AlertCircle, Loader2 } from "lucide-react"

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "confirm"; missingEmployers: EmployerWithoutSelection[] }
  | { status: "success"; result: Extract<PublishResult, { campaignId: number }> }
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

  async function handlePublish(confirmed = false) {
    if (state.status === "loading") return
    setState({ status: "loading" })
    try {
      const result = await publishMailingList(listId, confirmed)
      if ("requiresConfirmation" in result) {
        setState({ status: "confirm", missingEmployers: result.missingEmployers })
      } else {
        setState({ status: "success", result })
      }
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

  if (state.status === "confirm") {
    return (
      <span className="inline-flex items-center gap-2 text-sm">
        <span className="inline-flex items-center gap-1.5 text-amber-600" title={state.missingEmployers.map((e) => `${e.name} (${e.company})`).join(", ")}>
          <AlertCircle className="size-4" />
          {state.missingEmployers.length} без подборки
        </span>
        <button
          onClick={() => handlePublish(true)}
          className="rounded-lg border border-amber-600 px-2.5 py-1 text-xs font-medium text-amber-600 transition-opacity hover:opacity-90"
        >
          Отправить всё равно
        </button>
      </span>
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
      onClick={() => handlePublish(false)}
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
