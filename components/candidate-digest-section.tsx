"use client"

import { useState, useTransition } from "react"
import {
  setCandidateDigestAutoSend,
  previewCandidateDigest,
  sendCandidateDigestToApproved,
  type DigestRun,
  type DigestPreviewCandidate,
} from "@/app/actions"
import { Send, Loader2, AlertCircle, Download } from "lucide-react"

function formatRunDate(iso: string): string {
  return new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
}

function triggerLabel(triggeredBy: DigestRun["triggeredBy"]): string {
  return triggeredBy === "cron" ? "по расписанию" : "вручную"
}

type PreviewState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "loaded"; candidates: (DigestPreviewCandidate & { checked: boolean })[] }

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
  const [preview, setPreview] = useState<PreviewState>({ status: "idle" })
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

  async function handleLoad() {
    setError(null)
    setPreview({ status: "loading" })
    try {
      const result = await previewCandidateDigest()
      setPreview({ status: "loaded", candidates: result.candidates.map((c) => ({ ...c, checked: true })) })
    } catch (err) {
      setPreview({ status: "error", message: err instanceof Error ? err.message : "Не удалось загрузить список" })
    }
  }

  function toggleRow(id: string) {
    setPreview((prev) => {
      if (prev.status !== "loaded") return prev
      return { ...prev, candidates: prev.candidates.map((c) => (c.id === id ? { ...c, checked: !c.checked } : c)) }
    })
  }

  function setAll(checked: boolean) {
    setPreview((prev) => {
      if (prev.status !== "loaded") return prev
      return { ...prev, candidates: prev.candidates.map((c) => ({ ...c, checked })) }
    })
  }

  function handleSendApproved() {
    if (preview.status !== "loaded") return
    const checked = preview.candidates.filter((c) => c.checked)
    if (!checked.length) return
    if (!confirm(`Отправить дайджест ${checked.length} выбранным кандидатам?`)) return
    setError(null)
    startSendTransition(async () => {
      try {
        const run = await sendCandidateDigestToApproved(checked)
        setRuns((prev) => [run, ...prev])
        setPreview({ status: "idle" })
      } catch (err) {
        setError(err instanceof Error ? err.message : "Не удалось отправить дайджест")
      }
    })
  }

  const checkedCount = preview.status === "loaded" ? preview.candidates.filter((c) => c.checked).length : 0

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

        {preview.status === "idle" || preview.status === "error" ? (
          <button
            onClick={handleLoad}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="size-4" />
            Загрузить список
          </button>
        ) : preview.status === "loading" ? (
          <button disabled className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground opacity-50">
            <Loader2 className="size-4 animate-spin" />
            Загружаем…
          </button>
        ) : null}
      </div>

      {error && (
        <div className="flex items-start gap-2.5 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <p className="text-sm font-medium text-destructive">{error}</p>
        </div>
      )}

      {preview.status === "error" && (
        <div className="flex items-start gap-2.5 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <p className="text-sm font-medium text-destructive">{preview.message}</p>
        </div>
      )}

      {preview.status === "loaded" && (
        <div className="space-y-3 rounded-xl border bg-card p-4">
          {preview.candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">Нет подходящих кандидатов.</p>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3">
                <div className="flex gap-3 text-xs">
                  <button onClick={() => setAll(true)} className="font-medium text-primary hover:underline">Выбрать все</button>
                  <button onClick={() => setAll(false)} className="font-medium text-primary hover:underline">Снять все</button>
                </div>
                <p className="text-xs text-muted-foreground">Выбрано: {checkedCount} из {preview.candidates.length}</p>
              </div>

              <div className="max-h-96 overflow-y-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="w-10 px-4 py-2"></th>
                      <th className="px-4 py-2 font-medium">Имя</th>
                      <th className="px-4 py-2 font-medium">Email</th>
                      <th className="px-4 py-2 font-medium">Показано</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {preview.candidates.map((c) => (
                      <tr key={c.id}>
                        <td className="px-4 py-2">
                          <input type="checkbox" checked={c.checked} onChange={() => toggleRow(c.id)} className="size-4 accent-primary" />
                        </td>
                        <td className="px-4 py-2 text-card-foreground">{c.name}</td>
                        <td className="px-4 py-2 text-muted-foreground">{c.email}</td>
                        <td className="px-4 py-2 text-card-foreground">{c.shown}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleSendApproved}
                  disabled={isSendPending || checkedCount === 0}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSendPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                  {isSendPending ? "Отправляем…" : `Отправить выбранным (${checkedCount})`}
                </button>
                <button
                  onClick={() => setPreview({ status: "idle" })}
                  disabled={isSendPending}
                  className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted"
                >
                  Отмена
                </button>
              </div>
            </>
          )}
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
