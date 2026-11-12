"use client"

import { useState, useTransition } from "react"
import { setReleaseFollowUpAutoSend } from "@/app/actions"
import { AlertCircle } from "lucide-react"

export function ReleaseFollowUpToggle({ initialAutoSendEnabled }: { initialAutoSendEnabled: boolean }) {
  const [autoSendEnabled, setAutoSendEnabled] = useState(initialAutoSendEnabled)
  const [isTogglePending, startToggleTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleToggle() {
    const next = !autoSendEnabled
    setAutoSendEnabled(next)
    startToggleTransition(async () => {
      try {
        await setReleaseFollowUpAutoSend(next)
      } catch (err) {
        setAutoSendEnabled(!next)
        setError(err instanceof Error ? err.message : "Не удалось изменить настройку")
      }
    })
  }

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2.5 text-sm text-card-foreground">
        <input
          type="checkbox"
          checked={autoSendEnabled}
          onChange={handleToggle}
          disabled={isTogglePending}
          className="size-4 shrink-0 accent-primary"
        />
        Автоматическая отправка (ежедневная проверка, через 2–14 дней после выпуска)
      </label>

      {error && (
        <div className="flex items-start gap-2.5 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <p className="text-sm font-medium text-destructive">{error}</p>
        </div>
      )}
    </div>
  )
}
