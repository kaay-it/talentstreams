"use client"

import { useState } from "react"
import { TableProperties, CheckCircle, AlertCircle, Loader2 } from "lucide-react"
import { addAllColumns } from "@/app/actions"

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; added: string[] }
  | { status: "error"; message: string }

export function AddColumnsButton() {
  const [state, setState] = useState<State>({ status: "idle" })

  async function handle() {
    if (state.status === "loading") return
    setState({ status: "loading" })
    try {
      const { added } = await addAllColumns()
      setState({ status: "done", added })
    } catch (err) {
      setState({ status: "error", message: err instanceof Error ? err.message : "Неизвестная ошибка" })
    }
  }

  if (state.status === "done") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600">
        <CheckCircle className="size-3.5" />
        {state.added.length
          ? `Добавлены колонки: ${state.added.join(", ")}`
          : "Все колонки уже есть в таблице"}
      </span>
    )
  }

  if (state.status === "error") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-destructive" title={state.message}>
        <AlertCircle className="size-3.5" />
        Ошибка при добавлении колонок
      </span>
    )
  }

  return (
    <button
      onClick={handle}
      disabled={state.status === "loading"}
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50"
    >
      {state.status === "loading" ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <TableProperties className="size-3.5" />
      )}
      {state.status === "loading" ? "Проверяю колонки…" : "Проверить или добавить колонки в таблицу"}
    </button>
  )
}
