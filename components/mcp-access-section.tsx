"use client"

import { useState, useTransition } from "react"
import { revokeAllMcpTokens } from "@/app/actions"
import { AlertCircle, Check, Loader2, Unplug } from "lucide-react"

export function McpAccessSection() {
  const [isPending, startTransition] = useTransition()
  const [status, setStatus] = useState<"idle" | "done" | "error">("idle")
  const [confirming, setConfirming] = useState(false)

  function handleRevoke() {
    if (!confirming) {
      setConfirming(true)
      return
    }
    setConfirming(false)
    startTransition(async () => {
      try {
        await revokeAllMcpTokens()
        setStatus("done")
      } catch {
        setStatus("error")
      }
    })
  }

  return (
    <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">
        Завершает доступ у всех подключённых ИИ-ассистентов сразу — им придётся залогиниться
        повторно (код доступа редактора), повторно добавлять коннектор в Claude Desktop не нужно.
      </p>
      <button
        onClick={handleRevoke}
        disabled={isPending}
        className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : status === "done" && !confirming ? (
          <Check className="size-3.5 text-emerald-600" />
        ) : (
          <Unplug className="size-3.5" />
        )}
        {confirming ? "Точно отключить все подключения?" : status === "done" ? "Отключено" : "Отключить все MCP-подключения"}
      </button>
      {status === "error" && (
        <div className="flex items-start gap-2.5 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <p className="text-sm font-medium text-destructive">Не удалось отключить подключения</p>
        </div>
      )}
    </div>
  )
}
