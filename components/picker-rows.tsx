"use client"

import { useRef, useEffect } from "react"
import type { EmployerPickOption } from "@/lib/db/employers"

export type EligibleCandidate = {
  id: string
  name: string
  title: string
  level: string
  summary: string
  /** ru-RU text ("21.07.2026") or "" if never set (always eligible). */
  activeSince: string
}

/** Three-line row — ФИО / уровень / роли (title split on " / ", same convention as
 * profile-view.tsx and candidate-entry-card.tsx) — plus a summary column, so a manager picking
 * candidates by what they remember about them (not by surname) has enough to go on without
 * leaving the picker. */
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
  const roles = candidate.title.split(" / ").map((r) => r.trim()).filter(Boolean)
  return (
    <label className={`flex items-start gap-3 px-3 py-2.5 text-sm ${readOnly ? "" : "cursor-pointer hover:bg-muted/40"}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={readOnly ? undefined : onToggle}
        disabled={readOnly}
        className="mt-1 size-4 shrink-0 accent-primary"
      />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-medium text-foreground">{candidate.name || candidate.id}</span>
          {candidate.activeSince && (
            <span className="shrink-0 text-[11px] text-muted-foreground">Активен с {candidate.activeSince}</span>
          )}
        </div>
        {candidate.level && (
          <div>
            <span className="inline-flex items-center rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-medium text-teal-700 dark:bg-teal-900/20 dark:text-teal-400">
              {candidate.level}
            </span>
          </div>
        )}
        {roles.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {roles.map((role) => (
              <span key={role} className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground">
                {role}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="w-72 shrink-0 border-l pl-3 text-xs leading-relaxed text-muted-foreground line-clamp-3">
        {candidate.summary || "—"}
      </div>
    </label>
  )
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

export function candidatePlural(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return "кандидат"
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "кандидата"
  return "кандидатов"
}

export function subscriberPlural(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return "подписчик"
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "подписчика"
  return "подписчиков"
}
