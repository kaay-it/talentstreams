"use client"

import { useState } from "react"
import { publishMailingList, type PublishResult } from "@/app/actions"
import { Send, CheckCircle, AlertCircle, Loader2 } from "lucide-react"

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; result: PublishResult }
  | { status: "error"; message: string }

export function PublishButton({ listId }: { listId: string }) {
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

  return (
    <button
      onClick={handlePublish}
      disabled={state.status === "loading"}
      className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {state.status === "loading" ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Send className="size-4" />
      )}
      {state.status === "loading" ? "Отправка…" : "Отправить"}
    </button>
  )
}
