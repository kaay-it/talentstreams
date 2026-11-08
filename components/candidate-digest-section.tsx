"use client"

import { useState, useTransition } from "react"
import { setCandidateDigestAutoSend, sendCandidateDigestNow, type DigestRun } from "@/app/actions"
import { Send, Loader2, AlertCircle } from "lucide-react"

function formatRunDate(iso: string): string {
  return new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
}

function triggerLabel(triggeredBy: DigestRun["triggeredBy"]): string {
  return triggeredBy === "cron" ? "по расписанию" : "вручную"
}

export function CandidateDigestSection({
  initialAutoSendEnabled,
  initialRuns,
}: {
  initialAutoSendEnabled: boolean
  initialRuns: DigestRun[]
}) {
  const [autoSendEnabled, setAutoSendEnabled] = useState(initialAutoSendEnabled)
  const [runs, setRuns] = useState(initialRuns)
  const [isTogglePending, startToggleTransition] = useTransition()
  const [isSendPending, startSendTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleToggle() {
    const next = !autoSendEnabled
    setAutoSendEnabled(next)
    startToggleTransition(async () => {
      try {
        await setCandidateDigestAutoSend(next)
      } catch (err) {
        setAutoSendEnabled(!next)
        setError(err instanceof Error ? err.message : "Не удалось изменить настройку")
      }
    })
  }

  function handleSendNow() {
    if (!confirm("Отправить ежемесячный дайджест всем подходящим кандидатам прямо сейчас?")) return
    setError(null)
    startSendTransition(async () => {
      try {
        const run = await sendCandidateDigestNow()
        setRuns((prev) => [run, ...prev])
      } catch (err) {
        setError(err instanceof Error ? err.message : "Не удалось отправить дайджест")
      }
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2.5 text-sm text-card-foreground">
          <input
            type="checkbox"
            checked={autoSendEnabled}
            onChange={handleToggle}
            disabled={isTogglePending}
            className="size-4 shrink-0 accent-primary"
          />
          Автоматическая ежемесячная рассылка (первый понедельник месяца)
        </label>

        <button
          onClick={handleSendNow}
          disabled={isSendPending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSendPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          {isSendPending ? "Отправляем…" : "Отправить сейчас"}
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2.5 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <p className="text-sm font-medium text-destructive">{error}</p>
        </div>
      )}

      {runs.length === 0 ? (
        <p className="text-sm text-muted-foreground">Рассылок пока не было.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-4 py-2 font-medium">Когда</th>
                <th className="px-4 py-2 font-medium">Как запущено</th>
                <th className="px-4 py-2 font-medium">Кандидатов</th>
                <th className="px-4 py-2 font-medium">Подготовлено</th>
                <th className="px-4 py-2 font-medium">Ошибок</th>
                <th className="px-4 py-2 font-medium">Кампания SendPulse</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {runs.map((run) => (
                <tr key={run.id}>
                  <td className="px-4 py-2 text-card-foreground">{formatRunDate(run.startedAt)}</td>
                  <td className="px-4 py-2 text-muted-foreground">{triggerLabel(run.triggeredBy)}</td>
                  <td className="px-4 py-2 text-card-foreground">{run.candidatesTotal}</td>
                  <td className="px-4 py-2 text-card-foreground">{run.candidatesPrepared}</td>
                  <td className={`px-4 py-2 ${run.candidatesFailed > 0 ? "text-destructive" : "text-muted-foreground"}`}>{run.candidatesFailed}</td>
                  <td className="px-4 py-2 text-muted-foreground">{run.campaignId ?? "— не создана"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
