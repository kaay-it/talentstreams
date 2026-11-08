"use client"

import { useState, useTransition } from "react"
import {
  setReleaseFollowUpAutoSend,
  previewReleaseFollowUps,
  sendReleaseFollowUpsToApproved,
  type FollowUpRun,
  type FollowUpPreviewRelease,
} from "@/app/actions"
import { Send, Loader2, AlertCircle, Download } from "lucide-react"

function formatRunDate(iso: string): string {
  return new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
}

function triggerLabel(triggeredBy: FollowUpRun["triggeredBy"]): string {
  return triggeredBy === "cron" ? "по расписанию" : "вручную"
}

function classificationLabel(c: "feedback" | "reminder"): string {
  return c === "feedback" ? "Отзыв" : "Напоминание"
}

type PreviewRow = FollowUpPreviewRelease["rows"][number] & { checked: boolean }
type PreviewRelease = Omit<FollowUpPreviewRelease, "rows"> & { rows: PreviewRow[] }

type PreviewState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "loaded"; releases: PreviewRelease[] }

export function ReleaseFollowUpSection({
  initialAutoSendEnabled,
  initialRuns,
}: {
  initialAutoSendEnabled: boolean
  initialRuns: FollowUpRun[]
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
        await setReleaseFollowUpAutoSend(next)
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
      const result = await previewReleaseFollowUps()
      setPreview({
        status: "loaded",
        releases: result.releases.map((r) => ({ ...r, rows: r.rows.map((row) => ({ ...row, checked: true })) })),
      })
    } catch (err) {
      setPreview({ status: "error", message: err instanceof Error ? err.message : "Не удалось загрузить список" })
    }
  }

  function toggleRow(listId: string, employerToken: string) {
    setPreview((prev) => {
      if (prev.status !== "loaded") return prev
      return {
        ...prev,
        releases: prev.releases.map((r) =>
          r.listId !== listId
            ? r
            : { ...r, rows: r.rows.map((row) => (row.employerToken === employerToken ? { ...row, checked: !row.checked } : row)) },
        ),
      }
    })
  }

  function setAll(checked: boolean) {
    setPreview((prev) => {
      if (prev.status !== "loaded") return prev
      return { ...prev, releases: prev.releases.map((r) => ({ ...r, rows: r.rows.map((row) => ({ ...row, checked })) })) }
    })
  }

  function handleSendApproved() {
    if (preview.status !== "loaded") return
    const checked = preview.releases.flatMap((r) =>
      r.rows.filter((row) => row.checked).map((row) => ({ listId: row.listId, employerToken: row.employerToken, classification: row.classification })),
    )
    if (!checked.length) return
    if (!confirm(`Отправить фоллоу-ап ${checked.length} выбранным работодателям?`)) return
    setError(null)
    startSendTransition(async () => {
      try {
        const run = await sendReleaseFollowUpsToApproved(checked)
        setRuns((prev) => [run, ...prev])
        setPreview({ status: "idle" })
      } catch (err) {
        setError(err instanceof Error ? err.message : "Не удалось отправить фоллоу-апы")
      }
    })
  }

  const checkedCount = preview.status === "loaded" ? preview.releases.reduce((n, r) => n + r.rows.filter((row) => row.checked).length, 0) : 0
  const totalRows = preview.status === "loaded" ? preview.releases.reduce((n, r) => n + r.rows.length, 0) : 0

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
          Автоматическая отправка (ежедневная проверка, через 3–21 день после выпуска)
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
          {preview.releases.length === 0 ? (
            <p className="text-sm text-muted-foreground">Нет выпусков, подходящих по срокам (3–21 день после отправки).</p>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3">
                <div className="flex gap-3 text-xs">
                  <button onClick={() => setAll(true)} className="font-medium text-primary hover:underline">Выбрать все</button>
                  <button onClick={() => setAll(false)} className="font-medium text-primary hover:underline">Снять все</button>
                </div>
                <p className="text-xs text-muted-foreground">Выбрано: {checkedCount} из {totalRows}</p>
              </div>

              <div className="max-h-96 space-y-4 overflow-y-auto">
                {preview.releases.map((release) => (
                  <div key={release.listId} className="space-y-2">
                    <p className="text-xs font-semibold text-card-foreground">{release.stream} — {release.date}</p>
                    {release.rows.length > 0 && (
                      <div className="overflow-hidden rounded-lg border">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b text-left text-xs text-muted-foreground">
                              <th className="w-10 px-4 py-2"></th>
                              <th className="px-4 py-2 font-medium">Работодатель</th>
                              <th className="px-4 py-2 font-medium">Email</th>
                              <th className="px-4 py-2 font-medium">Письмо</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {release.rows.map((row) => (
                              <tr key={row.employerToken}>
                                <td className="px-4 py-2">
                                  <input
                                    type="checkbox"
                                    checked={row.checked}
                                    onChange={() => toggleRow(release.listId, row.employerToken)}
                                    className="size-4 accent-primary"
                                  />
                                </td>
                                <td className="px-4 py-2 text-card-foreground">{row.employerName} ({row.company})</td>
                                <td className="px-4 py-2 text-muted-foreground">{row.email}</td>
                                <td className="px-4 py-2 text-card-foreground">{classificationLabel(row.classification)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {release.skippedCount > 0 && (
                      <p className="text-xs text-muted-foreground">Уже оставили заявку: {release.skippedCount} — не отправляем</p>
                    )}
                  </div>
                ))}
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
        <p className="text-sm text-muted-foreground">Запусков пока не было.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-4 py-2 font-medium">Когда</th>
                <th className="px-4 py-2 font-medium">Как запущено</th>
                <th className="px-4 py-2 font-medium">Выпусков проверено</th>
                <th className="px-4 py-2 font-medium">Работодателей</th>
                <th className="px-4 py-2 font-medium">«Отзыв»</th>
                <th className="px-4 py-2 font-medium">«Напоминание»</th>
                <th className="px-4 py-2 font-medium">Ошибок</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {runs.map((run) => (
                <tr key={run.id}>
                  <td className="px-4 py-2 text-card-foreground">{formatRunDate(run.startedAt)}</td>
                  <td className="px-4 py-2 text-muted-foreground">{triggerLabel(run.triggeredBy)}</td>
                  <td className="px-4 py-2 text-card-foreground">{run.releasesChecked}</td>
                  <td className="px-4 py-2 text-card-foreground">{run.employersEvaluated}</td>
                  <td className="px-4 py-2 text-card-foreground">{run.feedbackSent}</td>
                  <td className="px-4 py-2 text-card-foreground">{run.reminderSent}</td>
                  <td className={`px-4 py-2 ${run.failed > 0 ? "text-destructive" : "text-muted-foreground"}`}>{run.failed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
