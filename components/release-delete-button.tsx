"use client"

import { useState, useTransition } from "react"
import { deleteMailingList } from "@/app/actions"
import { Trash2, Loader2, AlertCircle } from "lucide-react"

export function ReleaseDeleteButton({ listId }: { listId: string }) {
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleDelete() {
    startTransition(async () => {
      try {
        await deleteMailingList(listId)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Неизвестная ошибка")
        setConfirming(false)
      }
    })
  }

  if (error) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-destructive" title={error}>
        <AlertCircle className="size-3.5" />
        Ошибка удаления
      </span>
    )
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2 whitespace-nowrap">
        <span className="text-xs font-medium text-destructive">Удалить выпуск?</span>
        <button
          onClick={handleDelete}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-destructive px-3 py-1.5 text-xs font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
          Да, удалить
        </button>
        <button
          onClick={() => setConfirming(false)}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
        >
          Отмена
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      title="Удалить выпуск"
      className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground/50 transition-colors hover:bg-destructive/10 hover:text-destructive"
    >
      <Trash2 className="size-4" />
    </button>
  )
}
