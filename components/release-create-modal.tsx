"use client"

import { useState, useMemo } from "react"
import { createPortal } from "react-dom"
import { X, Check, AlertCircle, AlertTriangle, Plus, ExternalLink } from "lucide-react"
import { createMailingList } from "@/app/actions"
import type { EmployerPickOption } from "@/lib/db/employers"
import type { SelectionSummary } from "@/lib/db/mailing-lists"
import { CompanyGroup, candidatePlural, subscriberPlural } from "@/components/picker-rows"

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

export type RosterKind = "default" | "personal" | "missing"
export type RosterRow = { employer: EmployerPickOption; kind: RosterKind; viewHref?: string }

const ROSTER_BADGE: Record<RosterKind, string> = {
  default: "bg-muted text-muted-foreground",
  personal: "bg-violet-50 text-violet-700 dark:bg-violet-900/20 dark:text-violet-400",
  missing: "bg-destructive/10 text-destructive",
}
const ROSTER_LABEL: Record<RosterKind, string> = {
  default: "Общая подборка",
  personal: "Личная подборка",
  missing: "⚠ Нет подборки",
}

/** Always-visible roster of who gets what — not a conditional warning banner, the table itself
 * doubles as one (a "missing" row is visually flagged right where it is). Used identically by
 * ReleaseCreateModal (built from the подборки being picked) and ReleaseDetailModal (edit and
 * readOnly modes alike). */
export function RosterTable({ rows }: { rows: RosterRow[] }) {
  if (!rows.length) return null
  const missingCount = rows.filter((r) => r.kind === "missing").length
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">
        Кому что попадёт ({rows.length}){missingCount > 0 && <span className="ml-1 font-semibold text-destructive">— {missingCount} без подборки</span>}
      </p>
      <div className="max-h-56 overflow-y-auto rounded-lg border divide-y">
        {rows.map((r) => (
          <div key={r.employer.token} className={`flex items-center justify-between gap-2 px-3 py-2 text-sm ${r.kind === "missing" ? "bg-destructive/5" : ""}`}>
            <span className="min-w-0 truncate">
              <span className="font-medium text-foreground">{r.employer.name}</span>
              <span className="text-muted-foreground"> · {r.employer.company}</span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${ROSTER_BADGE[r.kind]}`}>{ROSTER_LABEL[r.kind]}</span>
              {r.viewHref && (
                <a href={r.viewHref} target="_blank" rel="noopener noreferrer" className="text-[11px] font-medium text-primary hover:underline">
                  Просмотреть →
                </a>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** One row of the подборка picker — ticking it attaches/detaches that pool подборка to the
 * release being built/edited. Composition is never shown or editable here, only in
 * /editor/selections — this is purely a picker, see SelectionDetailLink for inspecting one. */
export function SelectionPickerRow({
  selection,
  checked,
  onToggle,
  readOnly,
}: {
  selection: SelectionSummary
  checked: boolean
  onToggle: () => void
  readOnly?: boolean
}) {
  const isDefault = selection.employerTokens.length === 0
  return (
    <label className={`flex items-center gap-2.5 px-3 py-2 text-sm ${readOnly ? "" : "cursor-pointer hover:bg-muted/40"}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={readOnly ? undefined : onToggle}
        disabled={readOnly}
        className="size-4 shrink-0 accent-primary"
      />
      <span
        className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${isDefault ? "bg-muted text-muted-foreground" : "bg-violet-50 text-violet-700 dark:bg-violet-900/20 dark:text-violet-400"}`}
      >
        {isDefault ? "Общая" : "Личная"}
      </span>
      <span className="min-w-0 flex-1 truncate text-foreground">
        {selection.label || (isDefault ? "Подборка по умолчанию" : `${selection.employerTokens.length} ${subscriberPlural(selection.employerTokens.length)}`)}
      </span>
      <span className="shrink-0 text-xs text-muted-foreground">
        {selection.candidateIds.length} {candidatePlural(selection.candidateIds.length)}
      </span>
      <a
        href={`/selection/${selection.selectionId}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="shrink-0 text-[11px] font-medium text-primary hover:underline"
      >
        Просмотреть →
      </a>
    </label>
  )
}

export function ReleaseCreateModal({
  streams,
  subscriberCountByStream,
  employersByStream,
  selectionsByStream,
  editorSecret,
}: {
  streams: string[]
  subscriberCountByStream: Record<string, number>
  employersByStream: Record<string, EmployerPickOption[]>
  selectionsByStream: Record<string, SelectionSummary[]>
  editorSecret?: string
}) {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle")
  const [errorMsg, setErrorMsg] = useState("")
  const [createdListId, setCreatedListId] = useState("")

  const [stream, setStream] = useState("")
  const [date, setDate] = useState(todayISO())
  const [recipientMode, setRecipientMode] = useState<"all" | "selected">("selected")
  const [selectedEmployerTokens, setSelectedEmployerTokens] = useState<Set<string>>(new Set())
  const [selectedSelectionIds, setSelectedSelectionIds] = useState<Set<string>>(new Set())

  const subscriberCount = stream ? subscriberCountByStream[stream] ?? 0 : 0
  const employersForStream = stream ? employersByStream[stream] ?? [] : []
  const availableSelections = useMemo(
    () => (stream ? (selectionsByStream[stream] ?? []).filter((s) => s.listId === null) : []),
    [stream, selectionsByStream],
  )
  const employerGroups = useMemo(() => {
    const byCompany = new Map<string, EmployerPickOption[]>()
    for (const e of employersForStream) {
      const key = e.company || "Без компании"
      if (!byCompany.has(key)) byCompany.set(key, [])
      byCompany.get(key)!.push(e)
    }
    return [...byCompany.entries()].sort((a, b) => a[0].localeCompare(b[0], "ru"))
  }, [employersForStream])

  function handleStreamChange(next: string) {
    setStream(next)
    setRecipientMode("selected")
    setSelectedEmployerTokens(new Set())
    setSelectedSelectionIds(new Set())
  }

  function toggleSelection(selectionId: string) {
    setSelectedSelectionIds((prev) => {
      const next = new Set(prev)
      if (next.has(selectionId)) next.delete(selectionId)
      else next.add(selectionId)
      return next
    })
  }

  function toggleEmployer(token: string) {
    setSelectedEmployerTokens((prev) => {
      const next = new Set(prev)
      if (next.has(token)) next.delete(token)
      else next.add(token)
      return next
    })
  }

  function toggleCompany(tokens: string[], checkAll: boolean) {
    setSelectedEmployerTokens((prev) => {
      const next = new Set(prev)
      for (const t of tokens) {
        if (checkAll) next.add(t)
        else next.delete(t)
      }
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
    setRecipientMode("selected")
    setSelectedEmployerTokens(new Set())
    setSelectedSelectionIds(new Set())
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus("submitting")
    setErrorMsg("")
    try {
      const result = await createMailingList({
        stream,
        date,
        employerTokens: recipientMode === "selected" ? [...selectedEmployerTokens] : [],
        selectionIds: [...selectedSelectionIds],
      })
      setCreatedListId(result.listId)
      setStatus("success")
    } catch (err) {
      setStatus("error")
      setErrorMsg(err instanceof Error ? err.message : "Не удалось создать рассылку")
    }
  }

  const chosenSelections = availableSelections.filter((s) => selectedSelectionIds.has(s.selectionId))
  const totalCandidateCount = useMemo(
    () => new Set(chosenSelections.flatMap((s) => s.candidateIds)).size,
    [chosenSelections],
  )
  const canSubmit = Boolean(
    stream.trim() && date.trim() && selectedSelectionIds.size > 0 &&
    (recipientMode === "all" || selectedEmployerTokens.size > 0),
  )

  // Audience this release would actually be sent to — crossed with the подборки being picked,
  // so a gap (nobody covers this employer) is visible before saving.
  const audience = recipientMode === "selected" ? employersForStream.filter((e) => selectedEmployerTokens.has(e.token)) : employersForStream
  const hasDefault = chosenSelections.some((s) => s.employerTokens.length === 0)
  const rosterRows: RosterRow[] = useMemo(
    () =>
      audience.map((employer) => {
        const personalMatch = chosenSelections.find((s) => s.employerTokens.includes(employer.token))
        const kind: RosterKind = personalMatch ? "personal" : hasDefault ? "default" : "missing"
        return { employer, kind }
      }),
    [audience, chosenSelections, hasDefault],
  )

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
                    {totalCandidateCount} {candidatePlural(totalCandidateCount)} в выпуске «{stream}» на {toRuDate(date)}.
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
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setRecipientMode("selected")}
                          className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${recipientMode === "selected" ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}
                        >
                          Выбранные получатели
                        </button>
                        <button
                          type="button"
                          onClick={() => setRecipientMode("all")}
                          className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${recipientMode === "all" ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}
                        >
                          Все подписчики стрима
                        </button>
                      </div>
                    )}

                    {stream && recipientMode === "selected" && (
                      <div className="space-y-1.5">
                        <p className="text-xs font-medium text-muted-foreground">
                          Кому отправить письмо ({selectedEmployerTokens.size} выбрано)
                        </p>
                        {employerGroups.length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            Нет подтверждённых подписчиков стрима «{stream}», которых можно выбрать.
                          </p>
                        ) : (
                          <div className="max-h-64 overflow-y-auto rounded-lg border divide-y">
                            {employerGroups.map(([company, employers]) => (
                              <CompanyGroup
                                key={company}
                                company={company}
                                employers={employers}
                                selectedTokens={selectedEmployerTokens}
                                onToggleEmployer={toggleEmployer}
                                onToggleCompany={toggleCompany}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {stream && (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border bg-muted/30 px-4 py-3 text-sm">
                        <span className="text-muted-foreground">
                          {subscriberCount} {subscriberPlural(subscriberCount)}
                        </span>
                        {subscriberCount === 0 && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
                            <AlertTriangle className="size-3" />
                            Нет подтверждённых подписчиков
                          </span>
                        )}
                      </div>
                    )}

                    {stream && (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-medium text-muted-foreground">
                            Подборки этого выпуска ({selectedSelectionIds.size} выбрано)
                          </p>
                          <a href={`/editor/selections${editorSecret ? `?secret=${editorSecret}` : ""}`} className="text-xs font-medium text-primary hover:underline">
                            Подготовить ещё →
                          </a>
                        </div>
                        {availableSelections.length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            Нет подготовленных подборок для стрима «{stream}» — сначала создайте их в разделе «Подборки».
                          </p>
                        ) : (
                          <div className="max-h-64 overflow-y-auto rounded-lg border divide-y">
                            {availableSelections.map((s) => (
                              <SelectionPickerRow
                                key={s.selectionId}
                                selection={s}
                                checked={selectedSelectionIds.has(s.selectionId)}
                                onToggle={() => toggleSelection(s.selectionId)}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {stream && <RosterTable rows={rosterRows} />}
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
                    {status === "submitting" ? "Создаём…" : `Создать рассылку${totalCandidateCount ? ` (${totalCandidateCount})` : ""}`}
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
