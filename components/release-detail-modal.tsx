"use client"

import { useState, useMemo, useEffect } from "react"
import { createPortal } from "react-dom"
import { X, Check, AlertCircle, AlertTriangle, Pencil, Eye, Users } from "lucide-react"
import { updateMailingList, getMailingListRecipients } from "@/app/actions"
import type { EmployerPickOption } from "@/lib/db/employers"
import { CandidateRow, EmployerPickerRow, CompanyGroup, type EligibleCandidate } from "@/components/release-create-modal"

const inputCls =
  "w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"

/** Inverse of release-create-modal.tsx's toRuDate() — ru-RU "21.07.2026" -> ISO "2026-07-21"
 * for seeding an <input type="date">. */
function fromRuDate(ruDate: string): string {
  const m = ruDate.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
  if (!m) return ""
  const [, d, mo, y] = m
  return `${y}-${mo}-${d}`
}

export function ReleaseDetailModal({
  listId,
  stream,
  date,
  candidateIds,
  candidateNames,
  eligible,
  paused,
  employersForStream,
  readOnly,
}: {
  listId: string
  stream: string
  date: string
  candidateIds: string[]
  candidateNames: string[]
  eligible: EligibleCandidate[]
  paused: EligibleCandidate[]
  employersForStream: EmployerPickOption[]
  readOnly: boolean
}) {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle")
  const [errorMsg, setErrorMsg] = useState("")

  const [editDate, setEditDate] = useState(() => fromRuDate(date))
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(candidateIds))
  const [recipientMode, setRecipientMode] = useState<"all" | "selected">("all")
  const [selectedEmployerTokens, setSelectedEmployerTokens] = useState<Set<string>>(new Set())
  const [recipientsLoaded, setRecipientsLoaded] = useState(false)
  const [currentRecipients, setCurrentRecipients] = useState<EmployerPickOption[]>([])

  useEffect(() => {
    if (!open || recipientsLoaded) return
    let cancelled = false
    getMailingListRecipients(listId).then((recipients) => {
      if (cancelled) return
      setCurrentRecipients(recipients)
      setSelectedEmployerTokens(new Set(recipients.map((e) => e.token)))
      setRecipientMode(recipients.length ? "selected" : "all")
      setRecipientsLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [open, recipientsLoaded, listId])

  const employerGroups = useMemo(() => {
    const byCompany = new Map<string, EmployerPickOption[]>()
    for (const e of employersForStream) {
      const key = e.company || "Без компании"
      if (!byCompany.has(key)) byCompany.set(key, [])
      byCompany.get(key)!.push(e)
    }
    return [...byCompany.entries()].sort((a, b) => a[0].localeCompare(b[0], "ru"))
  }, [employersForStream])

  const viewRecipientGroups = useMemo(() => {
    const byCompany = new Map<string, EmployerPickOption[]>()
    for (const e of currentRecipients) {
      const key = e.company || "Без компании"
      if (!byCompany.has(key)) byCompany.set(key, [])
      byCompany.get(key)!.push(e)
    }
    return [...byCompany.entries()].sort((a, b) => a[0].localeCompare(b[0], "ru"))
  }, [currentRecipients])

  function toggleCandidate(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Only ever touches eligible (by-date) candidates — paused ones stay manual-only,
  // so a bulk select/deselect never silently adds or removes a candidate the editor
  // chose to include/exclude by hand despite the pause.
  function selectAllEligible() {
    setSelectedIds((prev) => new Set([...prev, ...eligible.map((c) => c.id)]))
  }

  function deselectAllEligible() {
    setSelectedIds((prev) => {
      const eligibleIds = new Set(eligible.map((c) => c.id))
      return new Set([...prev].filter((id) => !eligibleIds.has(id)))
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
    setEditDate(fromRuDate(date))
    setSelectedIds(new Set(candidateIds))
    setRecipientMode("all")
    setSelectedEmployerTokens(new Set())
    setRecipientsLoaded(false)
    setCurrentRecipients([])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus("submitting")
    setErrorMsg("")
    try {
      await updateMailingList(listId, {
        date: editDate,
        candidateIds: [...selectedIds],
        employerTokens: recipientMode === "selected" ? [...selectedEmployerTokens] : [],
      })
      setStatus("success")
    } catch (err) {
      setStatus("error")
      setErrorMsg(err instanceof Error ? err.message : "Не удалось сохранить изменения")
    }
  }

  const canSubmit = Boolean(
    editDate.trim() && selectedIds.size > 0 &&
    (recipientMode === "all" || selectedEmployerTokens.size > 0),
  )

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label={readOnly ? "Просмотреть выпуск" : "Редактировать выпуск"}
        title={readOnly ? "Просмотреть выпуск" : "Редактировать выпуск"}
      >
        {readOnly ? <Eye className="size-4" /> : <Pencil className="size-4" />}
      </button>

      {open && createPortal(
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} aria-hidden="true" />
          <div className="flex min-h-full items-center justify-center p-4">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="release-detail-title"
              className="relative w-full max-w-xl rounded-2xl border bg-card shadow-xl"
            >
              <div className="flex items-center justify-between border-b px-6 py-4">
                <h2 id="release-detail-title" className="text-base font-semibold text-card-foreground">
                  {readOnly ? "Просмотр выпуска" : "Редактирование выпуска"}: {stream}
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
                  <h3 className="mt-4 text-lg font-semibold text-card-foreground">Изменения сохранены</h3>
                  <button
                    onClick={handleClose}
                    className="mt-6 rounded-lg bg-primary px-6 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
                  >
                    Закрыть
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="max-h-[75vh] overflow-y-auto px-6 py-5">
                  <div className="space-y-5">
                    {readOnly ? (
                      <p className="text-sm text-muted-foreground">Дата: {date}</p>
                    ) : (
                      <div className="max-w-[12rem]">
                        <label className="mb-1.5 block text-sm font-medium text-card-foreground">
                          Дата рассылки <span className="text-primary">*</span>
                        </label>
                        <input
                          type="date"
                          value={editDate}
                          onChange={(e) => setEditDate(e.target.value)}
                          required
                          className={inputCls}
                        />
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground">
                        Получатели {readOnly && !recipientsLoaded ? "" : recipientMode === "all" ? "— весь стрим" : `(${selectedEmployerTokens.size} выбрано)`}
                      </p>
                      {!recipientsLoaded ? (
                        <p className="text-sm text-muted-foreground">Загрузка…</p>
                      ) : readOnly ? (
                        currentRecipients.length === 0 ? (
                          <p className="text-sm text-muted-foreground">Весь стрим «{stream}» (все подтверждённые подписчики).</p>
                        ) : (
                          <div className="max-h-64 overflow-y-auto rounded-lg border divide-y">
                            {viewRecipientGroups.map(([company, employers]) => (
                              <CompanyGroup
                                key={company}
                                company={company}
                                employers={employers}
                                selectedTokens={selectedEmployerTokens}
                                onToggleEmployer={() => {}}
                                onToggleCompany={() => {}}
                                readOnly
                              />
                            ))}
                          </div>
                        )
                      ) : (
                        <>
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
                          {recipientMode === "selected" && (
                            employerGroups.length === 0 ? (
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
                            )
                          )}
                        </>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                          <Users className="size-3.5" />
                          Кандидаты ({readOnly ? candidateNames.length : selectedIds.size})
                        </p>
                        {!readOnly && eligible.length > 0 && (
                          <div className="flex gap-2 text-xs">
                            <button type="button" onClick={selectAllEligible} className="text-primary hover:underline">
                              Выбрать всех
                            </button>
                            <button type="button" onClick={deselectAllEligible} className="text-muted-foreground hover:underline">
                              Снять выделение
                            </button>
                          </div>
                        )}
                      </div>
                      {readOnly ? (
                        <div className="max-h-64 overflow-y-auto rounded-lg border divide-y">
                          {candidateNames.map((name) => (
                            <p key={name} className="px-3 py-2 text-sm text-foreground">{name}</p>
                          ))}
                        </div>
                      ) : (
                        <>
                          {eligible.length > 0 && (selectedIds.size < 6 || selectedIds.size > 10) && (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600">
                              <AlertTriangle className="size-3" />
                              {selectedIds.size < 6 ? "Мало кандидатов (менее 6)" : "Много кандидатов (более 10)"}
                            </span>
                          )}
                          <div className="max-h-64 overflow-y-auto rounded-lg border divide-y">
                            {eligible.map((c) => (
                              <CandidateRow
                                key={c.id}
                                candidate={c}
                                checked={selectedIds.has(c.id)}
                                onToggle={() => toggleCandidate(c.id)}
                              />
                            ))}
                            {paused.map((c) => (
                              <CandidateRow
                                key={c.id}
                                candidate={c}
                                checked={selectedIds.has(c.id)}
                                onToggle={() => toggleCandidate(c.id)}
                              />
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {status === "error" && (
                    <div className="mt-5 flex items-start gap-2.5 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3">
                      <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
                      <p className="text-sm font-medium text-destructive">{errorMsg}</p>
                    </div>
                  )}

                  {readOnly ? (
                    <button
                      type="button"
                      onClick={handleClose}
                      className="mt-5 w-full rounded-lg border py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted"
                    >
                      Закрыть
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={status === "submitting" || !canSubmit}
                      className="mt-5 w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {status === "submitting" ? "Сохраняем…" : "Сохранить"}
                    </button>
                  )}
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
