"use client"

import { useState } from "react"
import { createPortal } from "react-dom"
import { X, Check, AlertCircle, AlertTriangle, Plus, Users, ExternalLink } from "lucide-react"
import { createMailingList } from "@/app/actions"

export type EligibleCandidate = {
  id: string
  name: string
  title: string
  level: string
}

const inputCls =
  "w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}
function toRuDate(isoDate: string): string {
  const m = isoDate.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return ""
  const [, y, mo, d] = m
  return `${d}.${mo}.${y}`
}

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-card-foreground">
        {label}
        {required && <span className="ml-1 text-primary">*</span>}
      </label>
      {children}
    </div>
  )
}

function candidatePlural(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return "кандидат"
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "кандидата"
  return "кандидатов"
}

function subscriberPlural(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return "подписчик"
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "подписчика"
  return "подписчиков"
}

export function ReleaseCreateModal({
  streams,
  eligibleByStream,
  subscriberCountByStream,
  editorSecret,
}: {
  streams: string[]
  eligibleByStream: Record<string, EligibleCandidate[]>
  subscriberCountByStream: Record<string, number>
  editorSecret?: string
}) {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle")
  const [errorMsg, setErrorMsg] = useState("")
  const [createdListId, setCreatedListId] = useState("")

  const [stream, setStream] = useState("")
  const [date, setDate] = useState(todayISO())
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const eligible = stream ? eligibleByStream[stream] ?? [] : []
  const subscriberCount = stream ? subscriberCountByStream[stream] ?? 0 : 0

  function handleStreamChange(next: string) {
    setStream(next)
    setSelectedIds(new Set((eligibleByStream[next] ?? []).map((c) => c.id)))
  }

  function toggleCandidate(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleClose() {
    setOpen(false)
    setStatus("idle")
    setErrorMsg("")
    setCreatedListId("")
    setStream("")
    setDate(todayISO())
    setSelectedIds(new Set())
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus("submitting")
    setErrorMsg("")
    try {
      const result = await createMailingList({
        stream,
        date: toRuDate(date),
        candidateIds: [...selectedIds],
      })
      setCreatedListId(result.listId)
      setStatus("success")
    } catch (err) {
      setStatus("error")
      setErrorMsg(err instanceof Error ? err.message : "Не удалось создать рассылку")
    }
  }

  const canSubmit = Boolean(stream.trim() && date.trim() && selectedIds.size > 0)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
      >
        <Plus className="size-3.5" />
        Создать рассылку
      </button>

      {open && createPortal(
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} aria-hidden="true" />
          <div className="flex min-h-full items-center justify-center p-4">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="create-release-title"
              className="relative w-full max-w-xl rounded-2xl border bg-card shadow-xl"
            >
              <div className="flex items-center justify-between border-b px-6 py-4">
                <h2 id="create-release-title" className="text-base font-semibold text-card-foreground">
                  Создать рассылку
                </h2>
                <button
                  onClick={handleClose}
                  className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label="Закрыть"
                >
                  <X className="size-4" />
                </button>
              </div>

              {status === "success" ? (
                <div className="flex flex-col items-center px-6 py-12 text-center">
                  <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Check className="size-6" />
                  </span>
                  <h3 className="mt-4 text-lg font-semibold text-card-foreground">Выпуск создан</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {selectedIds.size} {candidatePlural(selectedIds.size)} добавлено в выпуск «{stream}» на {toRuDate(date)}.
                  </p>
                  <div className="mt-6 flex gap-2">
                    <a
                      href={`/list/${createdListId}${editorSecret ? `?secret=${editorSecret}` : ""}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                    >
                      <ExternalLink className="size-3.5" />
                      Посмотреть подборку
                    </a>
                    <button
                      onClick={handleClose}
                      className="rounded-lg bg-primary px-6 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
                    >
                      Закрыть
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="max-h-[75vh] overflow-y-auto px-6 py-5">
                  <div className="space-y-5">
                    <div className="grid grid-cols-2 gap-4">
                      <Field label="Стрим" required>
                        <select
                          value={stream}
                          onChange={(e) => handleStreamChange(e.target.value)}
                          required
                          className={inputCls}
                        >
                          <option value="">— выберите —</option>
                          {streams.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Дата рассылки" required>
                        <input
                          type="date"
                          value={date}
                          onChange={(e) => setDate(e.target.value)}
                          required
                          className={inputCls}
                        />
                      </Field>
                    </div>

                    {stream && (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border bg-muted/30 px-4 py-3 text-sm">
                        <span className="inline-flex items-center gap-1.5">
                          <Users className="size-3.5 text-muted-foreground" />
                          {eligible.length} {candidatePlural(eligible.length)} подходит
                        </span>
                        <span className="text-muted-foreground">·</span>
                        <span className="text-muted-foreground">
                          {subscriberCount} {subscriberPlural(subscriberCount)}
                        </span>
                        {selectedIds.size > 0 && (selectedIds.size < 6 || selectedIds.size > 10) && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600">
                            <AlertTriangle className="size-3" />
                            {selectedIds.size < 6 ? "Мало кандидатов (менее 6)" : "Много кандидатов (более 10)"}
                          </span>
                        )}
                        {subscriberCount === 0 && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
                            <AlertTriangle className="size-3" />
                            Нет подтверждённых подписчиков
                          </span>
                        )}
                      </div>
                    )}

                    {stream && (
                      eligible.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          Нет подходящих кандидатов — активных, с уже наступившей датой «Активен с», по стриму «{stream}».
                        </p>
                      ) : (
                        <div className="space-y-1.5">
                          <p className="text-xs font-medium text-muted-foreground">
                            Кандидаты в выпуске ({selectedIds.size} из {eligible.length})
                          </p>
                          <div className="max-h-64 overflow-y-auto rounded-lg border divide-y">
                            {eligible.map((c) => (
                              <label
                                key={c.id}
                                className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted/40"
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedIds.has(c.id)}
                                  onChange={() => toggleCandidate(c.id)}
                                  className="size-4 shrink-0 accent-primary"
                                />
                                <span className="min-w-0 flex-1 truncate">
                                  <span className="font-medium text-foreground">{c.name || c.id}</span>
                                  {c.title && <span className="text-muted-foreground"> · {c.title}</span>}
                                </span>
                                {c.level && (
                                  <span className="shrink-0 rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-medium text-teal-700 dark:bg-teal-900/20 dark:text-teal-400">
                                    {c.level}
                                  </span>
                                )}
                              </label>
                            ))}
                          </div>
                        </div>
                      )
                    )}
                  </div>

                  {status === "error" && (
                    <div className="mt-5 flex items-start gap-2.5 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3">
                      <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
                      <p className="text-sm font-medium text-destructive">{errorMsg}</p>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={status === "submitting" || !canSubmit}
                    className="mt-5 w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {status === "submitting" ? "Создаём…" : `Создать рассылку${selectedIds.size ? ` (${selectedIds.size})` : ""}`}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
