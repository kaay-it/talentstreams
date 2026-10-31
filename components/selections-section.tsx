"use client"

import { useState, useMemo } from "react"
import { createPortal } from "react-dom"
import { Plus, Pencil, Trash2, Unlink, X, Check, AlertCircle, ChevronDown, ChevronUp } from "lucide-react"
import { createSelection, updateSelection, deleteSelection, detachSelection } from "@/app/actions"
import type { EmployerPickOption } from "@/lib/db/employers"
import type { SelectionSummary } from "@/lib/db/mailing-lists"
import { CandidateRow, CompanyGroup, candidatePlural, type EligibleCandidate } from "@/components/picker-rows"

type ReleaseInfo = { date: string; sent: boolean }
type SelectionRow = SelectionSummary & { stream: string }

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}
function toIsoDate(ruDate: string): string {
  const m = ruDate.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
  if (!m) return todayISO()
  const [, d, mo, y] = m
  return `${y}-${mo}-${d}`
}

export function SelectionsSection({
  streams,
  allSelections,
  eligibleByStream,
  pausedByStream,
  employersByStream,
  releaseInfoByListId,
  editorSecret,
}: {
  streams: string[]
  allSelections: SelectionRow[]
  eligibleByStream: Record<string, EligibleCandidate[]>
  pausedByStream: Record<string, EligibleCandidate[]>
  employersByStream: Record<string, EmployerPickOption[]>
  releaseInfoByListId: Record<string, ReleaseInfo>
  editorSecret?: string
}) {
  // "" = «Все» — по умолчанию видны подборки всех стримов разом, фильтр по стриму опционален.
  const [streamFilter, setStreamFilter] = useState("")
  const [editing, setEditing] = useState<SelectionRow | "new" | null>(null)
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const visibleSelections = useMemo(
    () =>
      (streamFilter ? allSelections.filter((s) => s.stream === streamFilter) : allSelections)
        .slice()
        .sort((a, b) => toIsoDate(b.date).localeCompare(toIsoDate(a.date))),
    [allSelections, streamFilter],
  )

  async function handleDetach(selectionId: string) {
    setPendingAction(selectionId)
    setActionError(null)
    try {
      await detachSelection(selectionId)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Не удалось открепить подборку")
    } finally {
      setPendingAction(null)
    }
  }

  async function handleDelete(selectionId: string) {
    if (!confirm("Удалить подборку? Это необратимо.")) return
    setPendingAction(selectionId)
    setActionError(null)
    try {
      await deleteSelection(selectionId)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Не удалось удалить подборку")
    } finally {
      setPendingAction(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setStreamFilter("")}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              streamFilter === "" ? "bg-primary text-primary-foreground" : "border text-muted-foreground hover:bg-muted"
            }`}
          >
            Все
          </button>
          {streams.map((s) => (
            <button
              key={s}
              onClick={() => setStreamFilter(s)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                s === streamFilter ? "bg-primary text-primary-foreground" : "border text-muted-foreground hover:bg-muted"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <button
          onClick={() => setEditing("new")}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Plus className="size-3.5" />
          Подборка
        </button>
      </div>

      {actionError && (
        <div className="flex items-start gap-2.5 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <p className="text-sm font-medium text-destructive">{actionError}</p>
        </div>
      )}

      {visibleSelections.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          {streamFilter ? `Для стрима «${streamFilter}» пока нет подборок.` : "Подборок пока нет."} Нажмите «Подборка», чтобы подготовить первую.
        </div>
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden divide-y">
          {visibleSelections.map((s) => {
            const isDefault = s.employerTokens.length === 0
            const release = s.listId ? releaseInfoByListId[s.listId] : undefined
            const employerByToken = new Map((employersByStream[s.stream] ?? []).map((e) => [e.token, e]))
            const employerLabels = s.employerTokens.map((t) => {
              const e = employerByToken.get(t)
              return e ? `${e.name} (${e.company})` : t
            })
            return (
              <div key={s.selectionId} className="flex items-center gap-4 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary">
                      {s.stream || "—"}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${isDefault ? "bg-muted text-muted-foreground" : "bg-violet-50 text-violet-700 dark:bg-violet-900/20 dark:text-violet-400"}`}
                    >
                      {isDefault ? "Общая" : "Ограниченная"}
                    </span>
                    <span className="text-xs text-muted-foreground">{s.date}</span>
                    <span className="text-sm font-medium text-foreground">
                      {s.candidateIds.length} {candidatePlural(s.candidateIds.length)}
                    </span>
                    {!isDefault && (
                      <span className="truncate text-xs text-muted-foreground">
                        {employerLabels.slice(0, 3).join(", ")}{employerLabels.length > 3 ? ` и ещё ${employerLabels.length - 3}` : ""}
                      </span>
                    )}
                    <a
                      href={`/selection/${s.selectionId}${editorSecret ? `?secret=${editorSecret}` : ""}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Просмотреть →
                    </a>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {!release ? (
                      "В пуле — свободна для любого выпуска"
                    ) : release.sent ? (
                      `Отправлена в выпуске от ${release.date}`
                    ) : (
                      `Используется в неотправленном выпуске от ${release.date}`
                    )}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  {!release?.sent && (
                    <button
                      onClick={() => setEditing(s)}
                      className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      aria-label="Редактировать подборку"
                      title="Редактировать подборку"
                    >
                      <Pencil className="size-4" />
                    </button>
                  )}
                  {release && !release.sent && (
                    <button
                      onClick={() => handleDetach(s.selectionId)}
                      disabled={pendingAction === s.selectionId}
                      className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                      aria-label="Открепить от выпуска"
                      title="Открепить от выпуска — вернуть в пул"
                    >
                      <Unlink className="size-4" />
                    </button>
                  )}
                  {!release?.sent && (
                    <button
                      onClick={() => handleDelete(s.selectionId)}
                      disabled={pendingAction === s.selectionId}
                      className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                      aria-label="Удалить подборку"
                      title="Удалить подборку"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {editing && (
        <SelectionFormModal
          streams={streams}
          defaultStream={streamFilter}
          selection={editing === "new" ? undefined : editing}
          eligibleByStream={eligibleByStream}
          pausedByStream={pausedByStream}
          employersByStream={employersByStream}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function SelectionFormModal({
  streams,
  defaultStream,
  selection,
  eligibleByStream,
  pausedByStream,
  employersByStream,
  onClose,
}: {
  streams: string[]
  defaultStream: string
  selection?: SelectionRow
  eligibleByStream: Record<string, EligibleCandidate[]>
  pausedByStream: Record<string, EligibleCandidate[]>
  employersByStream: Record<string, EmployerPickOption[]>
  onClose: () => void
}) {
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle")
  const [errorMsg, setErrorMsg] = useState("")
  // Как и у рассылок раньше — сначала стрим, потом дата, потом состав. Стрим зафиксирован при
  // редактировании (смена стрима оторвала бы выбранных кандидатов/работодателей от смысла).
  const [stream, setStream] = useState(selection?.stream ?? defaultStream ?? streams[0] ?? "")
  const [date, setDate] = useState(selection ? toIsoDate(selection.date) : todayISO())
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(selection?.candidateIds ?? []))
  const [selectedEmployerTokens, setSelectedEmployerTokens] = useState<Set<string>>(new Set(selection?.employerTokens ?? []))
  const [pausedOpen, setPausedOpen] = useState(false)

  const eligible = eligibleByStream[stream] ?? []
  const paused = pausedByStream[stream] ?? []
  const employersForStream = employersByStream[stream] ?? []
  const candidateById = useMemo(() => {
    const all = [...eligible, ...paused]
    return new Map(all.map((c) => [c.id, c]))
  }, [eligible, paused])

  const employerGroups = useMemo(() => {
    const byCompany = new Map<string, EmployerPickOption[]>()
    for (const e of employersForStream) {
      const key = e.company || "Без компании"
      if (!byCompany.has(key)) byCompany.set(key, [])
      byCompany.get(key)!.push(e)
    }
    return [...byCompany.entries()].sort((a, b) => a[0].localeCompare(b[0], "ru"))
  }, [employersForStream])

  // The подборка may include candidates no longer in eligible/paused (status changed since) —
  // show them anyway so a save never silently drops them.
  const extraSelected = [...selectedIds].filter((id) => !candidateById.has(id))

  function handleStreamChange(next: string) {
    setStream(next)
    setSelectedIds(new Set())
    setSelectedEmployerTokens(new Set())
  }

  function toggleCandidate(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus("submitting")
    setErrorMsg("")
    try {
      const data = { date, candidateIds: [...selectedIds], employerTokens: [...selectedEmployerTokens] }
      if (selection) {
        await updateSelection(selection.selectionId, data)
      } else {
        await createSelection(stream, data)
      }
      setStatus("success")
    } catch (err) {
      setStatus("error")
      setErrorMsg(err instanceof Error ? err.message : "Не удалось сохранить подборку")
    }
  }

  const canSubmit = Boolean(stream.trim() && date.trim() && selectedIds.size > 0)

  return createPortal(
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className="flex min-h-full items-center justify-center p-4">
        <div role="dialog" aria-modal="true" aria-labelledby="selection-form-title" className="relative w-full max-w-lg rounded-2xl border bg-card shadow-xl">
          <div className="flex items-center justify-between border-b px-6 py-4">
            <h2 id="selection-form-title" className="text-base font-semibold text-card-foreground">
              {selection ? "Редактирование подборки" : "Новая подборка"}
            </h2>
            <button onClick={onClose} className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" aria-label="Закрыть">
              <X className="size-4" />
            </button>
          </div>

          {status === "success" ? (
            <div className="flex flex-col items-center px-6 py-12 text-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Check className="size-6" />
              </span>
              <h3 className="mt-4 text-lg font-semibold text-card-foreground">Подборка сохранена</h3>
              <button onClick={onClose} className="mt-6 rounded-lg bg-primary px-6 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90">
                Закрыть
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="max-h-[75vh] overflow-y-auto px-6 py-5">
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-card-foreground">
                      Стрим <span className="ml-1 text-primary">*</span>
                    </label>
                    {selection ? (
                      <p className="rounded-lg border bg-muted/30 px-3 py-2 text-sm text-foreground">{stream}</p>
                    ) : (
                      <select
                        value={stream}
                        onChange={(e) => handleStreamChange(e.target.value)}
                        required
                        className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                      >
                        <option value="">— выберите —</option>
                        {streams.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-card-foreground">
                      Дата <span className="ml-1 text-primary">*</span>
                    </label>
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      required
                      className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                </div>

                {stream && (
                  <>
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground">
                        Видна только этим работодателям ({selectedEmployerTokens.size} выбрано) — оставьте пустым для общей подборки
                      </p>
                      {employerGroups.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Нет подтверждённых подписчиков стрима «{stream}».</p>
                      ) : (
                        <div className="max-h-48 overflow-y-auto rounded-lg border divide-y">
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

                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground">Кандидаты ({selectedIds.size})</p>
                      {eligible.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Нет подходящих кандидатов — активных, с уже наступившей датой «Активен с», по стриму «{stream}».</p>
                      ) : (
                        <div className="max-h-64 overflow-y-auto rounded-lg border divide-y">
                          {eligible.map((c) => (
                            <CandidateRow key={c.id} candidate={c} checked={selectedIds.has(c.id)} onToggle={() => toggleCandidate(c.id)} />
                          ))}
                        </div>
                      )}
                    </div>

                    {paused.length > 0 && (
                      <div className="space-y-1.5">
                        <button type="button" onClick={() => setPausedOpen((v) => !v)} className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground">
                          {pausedOpen ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                          {pausedOpen ? "Скрыть кандидатов на паузе" : `Кандидаты на паузе, дата не наступила (${paused.length})`}
                        </button>
                        {pausedOpen && (
                          <div className="max-h-64 overflow-y-auto rounded-lg border divide-y">
                            {paused.map((c) => (
                              <CandidateRow key={c.id} candidate={c} checked={selectedIds.has(c.id)} onToggle={() => toggleCandidate(c.id)} />
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {extraSelected.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Ещё {extraSelected.length} {candidatePlural(extraSelected.length)} в подборке не из списка выше (статус изменился) — останутся при сохранении.
                      </p>
                    )}
                  </>
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
                {status === "submitting" ? "Сохраняем…" : "Сохранить"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
