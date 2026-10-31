"use client"

import { useState, useMemo, useEffect } from "react"
import { createPortal } from "react-dom"
import { X, Check, AlertCircle, Pencil, Eye } from "lucide-react"
import { updateMailingList, getMailingListRecipients, getMailingListDetail, getSelectionsForStream } from "@/app/actions"
import type { EmployerPickOption } from "@/lib/db/employers"
import type { SelectionSummary } from "@/lib/db/mailing-lists"
import { CompanyGroup } from "@/components/picker-rows"
import { RosterTable, SelectionPickerRow, type RosterRow, type RosterKind } from "@/components/release-create-modal"

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
  employersForStream,
  readOnly,
}: {
  listId: string
  stream: string
  date: string
  employersForStream: EmployerPickOption[]
  readOnly: boolean
}) {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle")
  const [errorMsg, setErrorMsg] = useState("")

  const [dataLoaded, setDataLoaded] = useState(false)
  const [editDate, setEditDate] = useState(() => fromRuDate(date))
  // Both pickable (pool) and currently-attached подборки of this release's own stream, pre-checked
  // where attached — composition is never shown/editable here, see SelectionPickerRow/picker-rows.
  const [pickableSelections, setPickableSelections] = useState<SelectionSummary[]>([])
  const [selectedSelectionIds, setSelectedSelectionIds] = useState<Set<string>>(new Set())

  const [recipientMode, setRecipientMode] = useState<"all" | "selected">("all")
  const [selectedEmployerTokens, setSelectedEmployerTokens] = useState<Set<string>>(new Set())
  const [currentRecipients, setCurrentRecipients] = useState<EmployerPickOption[]>([])

  useEffect(() => {
    if (!open || dataLoaded) return
    let cancelled = false

    async function load() {
      const recipients = await getMailingListRecipients(listId)
      if (cancelled) return
      setCurrentRecipients(recipients)
      setSelectedEmployerTokens(new Set(recipients.map((e) => e.token)))
      setRecipientMode(recipients.length ? "selected" : "all")

      if (readOnly) {
        const detail = await getMailingListDetail(listId)
        if (cancelled || !detail) return
        const attached = [detail.default, ...detail.personal].filter((s): s is NonNullable<typeof s> => s !== null)
        setPickableSelections(
          attached.map((s) => ({
            selectionId: s.selectionId,
            streamId: 0,
            date,
            label: s.label,
            employerTokens: s.employerTokens,
            candidateIds: s.entries.map((e) => e.profile.id),
            listId,
          })),
        )
        setSelectedSelectionIds(new Set(attached.map((s) => s.selectionId)))
      } else {
        const all = await getSelectionsForStream(stream)
        if (cancelled) return
        const pickable = all.filter((s) => s.listId === null || s.listId === listId)
        setPickableSelections(pickable)
        setSelectedSelectionIds(new Set(pickable.filter((s) => s.listId === listId).map((s) => s.selectionId)))
      }

      setDataLoaded(true)
    }
    load()

    return () => {
      cancelled = true
    }
  }, [open, dataLoaded, listId, stream, readOnly])

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
    setDataLoaded(false)
    setEditDate(fromRuDate(date))
    setPickableSelections([])
    setSelectedSelectionIds(new Set())
    setRecipientMode("all")
    setSelectedEmployerTokens(new Set())
    setCurrentRecipients([])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus("submitting")
    setErrorMsg("")
    try {
      await updateMailingList(listId, {
        date: editDate,
        employerTokens: recipientMode === "selected" ? [...selectedEmployerTokens] : [],
        selectionIds: [...selectedSelectionIds],
      })
      setStatus("success")
    } catch (err) {
      setStatus("error")
      setErrorMsg(err instanceof Error ? err.message : "Не удалось сохранить изменения")
    }
  }

  const chosenSelections = pickableSelections.filter((s) => selectedSelectionIds.has(s.selectionId))
  const hasDefault = chosenSelections.some((s) => s.employerTokens.length === 0)
  const audience = recipientMode === "selected" ? employersForStream.filter((e) => selectedEmployerTokens.has(e.token)) : employersForStream
  const rosterRows: RosterRow[] = useMemo(
    () =>
      audience.map((employer) => {
        const personalMatch = chosenSelections.find((s) => s.employerTokens.includes(employer.token))
        const kind: RosterKind = personalMatch ? "personal" : hasDefault ? "default" : "missing"
        return { employer, kind }
      }),
    [audience, chosenSelections, hasDefault],
  )

  const canSubmit = Boolean(
    editDate.trim() && selectedSelectionIds.size > 0 &&
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
              ) : !dataLoaded ? (
                <p className="px-6 py-12 text-center text-sm text-muted-foreground">Загрузка…</p>
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
                        Кому отправлено письмо {recipientMode === "all" ? "— весь стрим" : `(${selectedEmployerTokens.size} выбрано)`}
                      </p>
                      {readOnly ? (
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
                        <p className="text-xs font-medium text-muted-foreground">
                          Подборки выпуска ({selectedSelectionIds.size})
                        </p>
                        {!readOnly && (
                          <a href="/editor/selections" className="text-xs font-medium text-primary hover:underline">
                            Подготовить ещё →
                          </a>
                        )}
                      </div>
                      {pickableSelections.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          {readOnly ? "Нет ни одной подборки." : "Нет подготовленных подборок для этого стрима — сначала создайте их в разделе «Подборки»."}
                        </p>
                      ) : (
                        <div className="max-h-64 overflow-y-auto rounded-lg border divide-y">
                          {pickableSelections.map((s) => (
                            <SelectionPickerRow
                              key={s.selectionId}
                              selection={s}
                              checked={selectedSelectionIds.has(s.selectionId)}
                              onToggle={() => toggleSelection(s.selectionId)}
                              readOnly={readOnly}
                            />
                          ))}
                        </div>
                      )}
                    </div>

                    <RosterTable rows={rosterRows} />
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
