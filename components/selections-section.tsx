"use client"

import { useState, useMemo } from "react"
import { createPortal } from "react-dom"
import { Plus, Pencil, Trash2, Unlink, X, Check, AlertCircle, ChevronDown, ChevronUp } from "lucide-react"
import { createSelection, updateSelection, deleteSelection, detachSelection } from "@/app/actions"
import type { EmployerPickOption } from "@/lib/db/employers"
import type { SelectionSummary } from "@/lib/db/mailing-lists"
import { CandidateRow, CompanyGroup, candidatePlural, type EligibleCandidate } from "@/components/picker-rows"

type ReleaseInfo = { date: string; sent: boolean }

export function SelectionsSection({
  streams,
  eligibleByStream,
  pausedByStream,
  employersByStream,
  selectionsByStream,
  releaseInfoByListId,
  editorSecret,
}: {
  streams: string[]
  eligibleByStream: Record<string, EligibleCandidate[]>
  pausedByStream: Record<string, EligibleCandidate[]>
  employersByStream: Record<string, EmployerPickOption[]>
  selectionsByStream: Record<string, SelectionSummary[]>
  releaseInfoByListId: Record<string, ReleaseInfo>
  editorSecret?: string
}) {
  const [stream, setStream] = useState(streams[0] ?? "")
  const [editing, setEditing] = useState<SelectionSummary | "new" | null>(null)
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const selections = stream ? selectionsByStream[stream] ?? [] : []
  const candidateById = useMemo(() => {
    const all = [...(eligibleByStream[stream] ?? []), ...(pausedByStream[stream] ?? [])]
    return new Map(all.map((c) => [c.id, c]))
  }, [stream, eligibleByStream, pausedByStream])
  const employerByToken = useMemo(() => new Map((employersByStream[stream] ?? []).map((e) => [e.token, e])), [stream, employersByStream])

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
          {streams.map((s) => (
            <button
              key={s}
              onClick={() => setStream(s)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                s === stream ? "bg-primary text-primary-foreground" : "border text-muted-foreground hover:bg-muted"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        {stream && (
          <button
            onClick={() => setEditing("new")}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Plus className="size-3.5" />
            Подборка
          </button>
        )}
      </div>

      {actionError && (
        <div className="flex items-start gap-2.5 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <p className="text-sm font-medium text-destructive">{actionError}</p>
        </div>
      )}

      {!stream ? (
        <p className="text-sm text-muted-foreground">Нет активных стримов.</p>
      ) : selections.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          Для стрима «{stream}» пока нет подборок. Нажмите «Подборка», чтобы подготовить первую.
        </div>
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden divide-y">
          {selections.map((s) => {
            const isDefault = s.employerTokens.length === 0
            const release = s.listId ? releaseInfoByListId[s.listId] : undefined
            const employerNames = s.employerTokens.map((t) => employerByToken.get(t)?.name ?? t)
            return (
              <div key={s.selectionId} className="flex items-center gap-4 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${isDefault ? "bg-muted text-muted-foreground" : "bg-violet-50 text-violet-700 dark:bg-violet-900/20 dark:text-violet-400"}`}
                    >
                      {isDefault ? "Общая" : "Личная"}
                    </span>
                    <span className="text-sm font-medium text-foreground">
                      {s.candidateIds.length} {candidatePlural(s.candidateIds.length)}
                    </span>
                    {!isDefault && (
                      <span className="truncate text-xs text-muted-foreground">
                        {employerNames.slice(0, 3).join(", ")}{employerNames.length > 3 ? ` и ещё ${employerNames.length - 3}` : ""}
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
          stream={stream}
          selection={editing === "new" ? undefined : editing}
          eligible={eligibleByStream[stream] ?? []}
          paused={pausedByStream[stream] ?? []}
          employersForStream={employersByStream[stream] ?? []}
          candidateById={candidateById}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function SelectionFormModal({
  stream,
  selection,
  eligible,
  paused,
  employersForStream,
  candidateById,
  onClose,
}: {
  stream: string
  selection?: SelectionSummary
  eligible: EligibleCandidate[]
  paused: EligibleCandidate[]
  employersForStream: EmployerPickOption[]
  candidateById: Map<string, EligibleCandidate>
  onClose: () => void
}) {
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle")
  const [errorMsg, setErrorMsg] = useState("")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(selection?.candidateIds ?? []))
  const [selectedEmployerTokens, setSelectedEmployerTokens] = useState<Set<string>>(new Set(selection?.employerTokens ?? []))
  const [pausedOpen, setPausedOpen] = useState(false)

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
      const data = { candidateIds: [...selectedIds], employerTokens: [...selectedEmployerTokens] }
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

  const canSubmit = selectedIds.size > 0

  return createPortal(
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className="flex min-h-full items-center justify-center p-4">
        <div role="dialog" aria-modal="true" aria-labelledby="selection-form-title" className="relative w-full max-w-lg rounded-2xl border bg-card shadow-xl">
          <div className="flex items-center justify-between border-b px-6 py-4">
            <h2 id="selection-form-title" className="text-base font-semibold text-card-foreground">
              {selection ? "Редактирование подборки" : "Новая подборка"}: {stream}
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
