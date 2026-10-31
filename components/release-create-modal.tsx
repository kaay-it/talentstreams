"use client"

import { useState, useMemo, useRef, useEffect } from "react"
import { createPortal } from "react-dom"
import { X, Check, AlertCircle, AlertTriangle, Plus, Users, ExternalLink, ChevronDown, ChevronUp } from "lucide-react"
import { createMailingList } from "@/app/actions"
import type { EmployerPickOption } from "@/lib/db/employers"

export type EligibleCandidate = {
  id: string
  name: string
  title: string
  level: string
  /** ru-RU text ("21.07.2026") or "" if never set (always eligible). */
  activeSince: string
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

export function CandidateRow({
  candidate,
  checked,
  onToggle,
  readOnly,
}: {
  candidate: EligibleCandidate
  checked: boolean
  onToggle: () => void
  readOnly?: boolean
}) {
  return (
    <label className={`flex items-center gap-2.5 px-3 py-2 text-sm ${readOnly ? "" : "cursor-pointer hover:bg-muted/40"}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={readOnly ? undefined : onToggle}
        disabled={readOnly}
        className="size-4 shrink-0 accent-primary"
      />
      <span className="min-w-0 flex-1 truncate">
        <span className="font-medium text-foreground">{candidate.name || candidate.id}</span>
        {candidate.title && <span className="text-muted-foreground"> · {candidate.title}</span>}
      </span>
      {candidate.level && (
        <span className="shrink-0 rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-medium text-teal-700 dark:bg-teal-900/20 dark:text-teal-400">
          {candidate.level}
        </span>
      )}
      {candidate.activeSince && (
        <span className="shrink-0 text-[11px] text-muted-foreground">Активен с {candidate.activeSince}</span>
      )}
    </label>
  )
}

function subscriberPlural(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return "подписчик"
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "подписчика"
  return "подписчиков"
}

export function EmployerPickerRow({
  employer,
  checked,
  onToggle,
  readOnly,
}: {
  employer: EmployerPickOption
  checked: boolean
  onToggle: () => void
  readOnly?: boolean
}) {
  return (
    <label className={`flex items-center gap-2.5 px-3 py-2 pl-9 text-sm ${readOnly ? "" : "cursor-pointer hover:bg-muted/40"}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={readOnly ? undefined : onToggle}
        disabled={readOnly}
        className="size-4 shrink-0 accent-primary"
      />
      <span className="min-w-0 flex-1 truncate">
        <span className="font-medium text-foreground">{employer.name}</span>
        <span className="text-muted-foreground"> · {employer.email}</span>
      </span>
    </label>
  )
}

export function CompanyGroup({
  company,
  employers,
  selectedTokens,
  onToggleEmployer,
  onToggleCompany,
  readOnly,
}: {
  company: string
  employers: EmployerPickOption[]
  selectedTokens: Set<string>
  onToggleEmployer: (token: string) => void
  onToggleCompany: (tokens: string[], checkAll: boolean) => void
  readOnly?: boolean
}) {
  const tokens = employers.map((e) => e.token)
  const selectedCount = tokens.filter((t) => selectedTokens.has(t)).length
  const allSelected = selectedCount === tokens.length
  const checkboxRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (checkboxRef.current) checkboxRef.current.indeterminate = selectedCount > 0 && !allSelected
  }, [selectedCount, allSelected])

  return (
    <>
      <div className="flex items-center gap-2.5 bg-muted/30 px-3 py-1.5 text-sm">
        <input
          ref={checkboxRef}
          type="checkbox"
          checked={allSelected}
          onChange={readOnly ? undefined : () => onToggleCompany(tokens, !allSelected)}
          disabled={readOnly}
          className="size-4 shrink-0 accent-primary"
        />
        <span className="font-semibold text-foreground">{company}</span>
        <span className="text-xs text-muted-foreground">({selectedCount}/{tokens.length})</span>
      </div>
      {employers.map((e) => (
        <EmployerPickerRow
          key={e.token}
          employer={e}
          checked={selectedTokens.has(e.token)}
          onToggle={() => onToggleEmployer(e.token)}
          readOnly={readOnly}
        />
      ))}
    </>
  )
}

/** An in-progress personal ("личная") selection being built in the create/edit form — not yet a
 * real selection row until the release is saved (selectionId is only set once it is, which lets
 * the roster/block link out to /selection/[selectionId] for an already-saved one). */
export type DraftSelection = {
  key: string
  selectionId?: string
  candidateIds: Set<string>
  employerTokens: Set<string>
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
 * ReleaseCreateModal (built from in-progress form state), ReleaseDetailModal's edit mode (same),
 * and its readOnly mode (from already-saved selections). */
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

/** One personal selection's editor block — its own employer picker + candidate picker, reusing
 * the exact same CompanyGroup/CandidateRow pieces as the main form. `readOnly` renders it exactly
 * like ReleaseDetailModal's sent-release view (no checkboxes toggle, no remove button). */
export function PersonalSelectionBlock({
  draft,
  index,
  eligible,
  paused,
  employerGroups,
  onToggleCandidate,
  onToggleEmployer,
  onToggleCompany,
  onRemove,
  viewHref,
  readOnly,
}: {
  draft: DraftSelection
  index: number
  eligible: EligibleCandidate[]
  paused: EligibleCandidate[]
  employerGroups: [string, EmployerPickOption[]][]
  onToggleCandidate: (id: string) => void
  onToggleEmployer: (token: string) => void
  onToggleCompany: (tokens: string[], checkAll: boolean) => void
  onRemove?: () => void
  viewHref?: string
  readOnly?: boolean
}) {
  return (
    <div className="space-y-2.5 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">
          Личная подборка {index + 1} ({draft.candidateIds.size} {candidatePlural(draft.candidateIds.size)}, {draft.employerTokens.size} {subscriberPlural(draft.employerTokens.size)})
        </p>
        <div className="flex shrink-0 items-center gap-3">
          {viewHref && (
            <a href={viewHref} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-primary hover:underline">
              Просмотреть →
            </a>
          )}
          {!readOnly && onRemove && (
            <button type="button" onClick={onRemove} className="text-xs font-medium text-destructive hover:underline">
              Удалить
            </button>
          )}
        </div>
      </div>
      <div className="space-y-1">
        <p className="text-[11px] font-medium text-muted-foreground">Кому видна</p>
        {employerGroups.length === 0 ? (
          <p className="text-xs text-muted-foreground">Нет подтверждённых подписчиков стрима, которых можно выбрать.</p>
        ) : (
          <div className="max-h-36 overflow-y-auto rounded-lg border divide-y">
            {employerGroups.map(([company, employers]) => (
              <CompanyGroup
                key={company}
                company={company}
                employers={employers}
                selectedTokens={draft.employerTokens}
                onToggleEmployer={onToggleEmployer}
                onToggleCompany={onToggleCompany}
                readOnly={readOnly}
              />
            ))}
          </div>
        )}
      </div>
      <div className="space-y-1">
        <p className="text-[11px] font-medium text-muted-foreground">Кандидаты</p>
        <div className="max-h-36 overflow-y-auto rounded-lg border divide-y">
          {[...eligible, ...paused].map((c) => (
            <CandidateRow
              key={c.id}
              candidate={c}
              checked={draft.candidateIds.has(c.id)}
              onToggle={() => onToggleCandidate(c.id)}
              readOnly={readOnly}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

export function ReleaseCreateModal({
  streams,
  eligibleByStream,
  pausedByStream,
  subscriberCountByStream,
  employersByStream,
  editorSecret,
}: {
  streams: string[]
  eligibleByStream: Record<string, EligibleCandidate[]>
  pausedByStream: Record<string, EligibleCandidate[]>
  subscriberCountByStream: Record<string, number>
  employersByStream: Record<string, EmployerPickOption[]>
  editorSecret?: string
}) {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle")
  const [errorMsg, setErrorMsg] = useState("")
  const [createdListId, setCreatedListId] = useState("")

  const [stream, setStream] = useState("")
  const [date, setDate] = useState(todayISO())
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [pausedOpen, setPausedOpen] = useState(false)
  const [recipientMode, setRecipientMode] = useState<"all" | "selected">("selected")
  const [selectedEmployerTokens, setSelectedEmployerTokens] = useState<Set<string>>(new Set())
  const [personalSelections, setPersonalSelections] = useState<DraftSelection[]>([])

  const eligible = stream ? eligibleByStream[stream] ?? [] : []
  const paused = stream ? pausedByStream[stream] ?? [] : []
  const subscriberCount = stream ? subscriberCountByStream[stream] ?? 0 : 0
  const employersForStream = stream ? employersByStream[stream] ?? [] : []
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
    setSelectedIds(new Set((eligibleByStream[next] ?? []).map((c) => c.id)))
    setPausedOpen(false)
    setRecipientMode("selected")
    setSelectedEmployerTokens(new Set())
    setPersonalSelections([])
  }

  function addPersonalSelection() {
    setPersonalSelections((prev) => [...prev, { key: crypto.randomUUID(), candidateIds: new Set(), employerTokens: new Set() }])
  }

  function removePersonalSelection(key: string) {
    setPersonalSelections((prev) => prev.filter((s) => s.key !== key))
  }

  function togglePersonalCandidate(key: string, id: string) {
    setPersonalSelections((prev) =>
      prev.map((s) => {
        if (s.key !== key) return s
        const next = new Set(s.candidateIds)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return { ...s, candidateIds: next }
      }),
    )
  }

  function togglePersonalEmployer(key: string, token: string) {
    setPersonalSelections((prev) =>
      prev.map((s) => {
        if (s.key !== key) return s
        const next = new Set(s.employerTokens)
        if (next.has(token)) next.delete(token)
        else next.add(token)
        return { ...s, employerTokens: next }
      }),
    )
  }

  function togglePersonalCompany(key: string, tokens: string[], checkAll: boolean) {
    setPersonalSelections((prev) =>
      prev.map((s) => {
        if (s.key !== key) return s
        const next = new Set(s.employerTokens)
        for (const t of tokens) {
          if (checkAll) next.add(t)
          else next.delete(t)
        }
        return { ...s, employerTokens: next }
      }),
    )
  }

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
    setCreatedListId("")
    setStream("")
    setDate(todayISO())
    setSelectedIds(new Set())
    setPausedOpen(false)
    setRecipientMode("selected")
    setSelectedEmployerTokens(new Set())
    setPersonalSelections([])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus("submitting")
    setErrorMsg("")
    try {
      const result = await createMailingList({
        stream,
        date,
        candidateIds: [...selectedIds],
        employerTokens: recipientMode === "selected" ? [...selectedEmployerTokens] : [],
        personalSelections: personalSelections
          .filter((s) => s.candidateIds.size > 0 && s.employerTokens.size > 0)
          .map((s) => ({ candidateIds: [...s.candidateIds], employerTokens: [...s.employerTokens] })),
      })
      setCreatedListId(result.listId)
      setStatus("success")
    } catch (err) {
      setStatus("error")
      setErrorMsg(err instanceof Error ? err.message : "Не удалось создать рассылку")
    }
  }

  const totalCandidateCount = useMemo(
    () => new Set([...selectedIds, ...personalSelections.flatMap((s) => [...s.candidateIds])]).size,
    [selectedIds, personalSelections],
  )
  const hasAnySelection = selectedIds.size > 0 || personalSelections.some((s) => s.candidateIds.size > 0 && s.employerTokens.size > 0)
  const canSubmit = Boolean(
    stream.trim() && date.trim() && hasAnySelection &&
    (recipientMode === "all" || selectedEmployerTokens.size > 0),
  )

  // Audience this release would actually be sent to — the chosen narrow recipients, or every
  // confirmed subscriber if going out to the whole stream — crossed with the default/personal
  // selections being built, so a gap (nobody covers this employer) is visible before saving.
  const audience = recipientMode === "selected" ? employersForStream.filter((e) => selectedEmployerTokens.has(e.token)) : employersForStream
  const hasDefault = selectedIds.size > 0
  const rosterRows: RosterRow[] = useMemo(
    () =>
      audience.map((employer) => {
        const personalMatch = personalSelections.find((s) => s.employerTokens.has(employer.token))
        const kind: RosterKind = personalMatch ? "personal" : hasDefault ? "default" : "missing"
        return { employer, kind }
      }),
    [audience, personalSelections, hasDefault],
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
                    {totalCandidateCount} {candidatePlural(totalCandidateCount)} добавлено в выпуск «{stream}» на {toRuDate(date)}.
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
                          Получатели выпуска ({selectedEmployerTokens.size} выбрано)
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
                      <div className="space-y-3">
                        {eligible.length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            Нет подходящих кандидатов — активных, с уже наступившей датой «Активен с», по стриму «{stream}».
                          </p>
                        ) : (
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-medium text-muted-foreground">
                                Подборка по умолчанию — видна всем без личной ({selectedIds.size} из {eligible.length})
                              </p>
                              <div className="flex gap-2 text-xs">
                                <button type="button" onClick={selectAllEligible} className="text-primary hover:underline">
                                  Выбрать всех
                                </button>
                                <button type="button" onClick={deselectAllEligible} className="text-muted-foreground hover:underline">
                                  Снять выделение
                                </button>
                              </div>
                            </div>
                            <div className="max-h-64 overflow-y-auto rounded-lg border divide-y">
                              {eligible.map((c) => (
                                <CandidateRow
                                  key={c.id}
                                  candidate={c}
                                  checked={selectedIds.has(c.id)}
                                  onToggle={() => toggleCandidate(c.id)}
                                />
                              ))}
                            </div>
                          </div>
                        )}

                        {paused.length > 0 && (
                          <div className="space-y-1.5">
                            <button
                              type="button"
                              onClick={() => setPausedOpen((v) => !v)}
                              className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                            >
                              {pausedOpen ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                              {pausedOpen ? "Скрыть кандидатов на паузе" : `Кандидаты на паузе, дата не наступила (${paused.length})`}
                            </button>
                            {pausedOpen && (
                              <>
                                <p className="text-xs text-muted-foreground">
                                  Дата «Активен с» ещё не наступила — можно включить вручную, если подходящих кандидатов не хватает.
                                </p>
                                <div className="max-h-64 overflow-y-auto rounded-lg border divide-y">
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
                        )}
                      </div>
                    )}

                    {stream && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-medium text-muted-foreground">Личные подборки — видны только выбранным работодателям, без гео-фильтра</p>
                          <button
                            type="button"
                            onClick={addPersonalSelection}
                            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                          >
                            <Plus className="size-3" />
                            Личная подборка
                          </button>
                        </div>
                        {personalSelections.map((draft, i) => (
                          <PersonalSelectionBlock
                            key={draft.key}
                            draft={draft}
                            index={i}
                            eligible={eligible}
                            paused={paused}
                            employerGroups={employerGroups}
                            onToggleCandidate={(id) => togglePersonalCandidate(draft.key, id)}
                            onToggleEmployer={(token) => togglePersonalEmployer(draft.key, token)}
                            onToggleCompany={(tokens, checkAll) => togglePersonalCompany(draft.key, tokens, checkAll)}
                            onRemove={() => removePersonalSelection(draft.key)}
                          />
                        ))}
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
