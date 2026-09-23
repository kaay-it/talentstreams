"use client"

import { useMemo, useState, useTransition } from "react"
import { CheckCircle2, XCircle, Ban, Trash2, FileText, Link as LinkIcon, Loader2, Pencil, Plus, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react"
import { approveCandidate, rejectCandidate, deleteCandidate, type ResumeVersion } from "@/app/actions"
import { CandidateEditModal } from "@/components/candidate-edit-modal"
import { CandidateCreateModal } from "@/components/candidate-create-modal"
import { withDownloadFilename } from "@/lib/blob"
import type { Candidate, CandidateStatus } from "@/lib/sheets"

const SELECT_CLASS =
  "rounded-md border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"

const STATUS_OPTIONS: { value: CandidateStatus | ""; label: string }[] = [
  { value: "", label: "Все статусы" },
  { value: "На проверке", label: "На проверке" },
  { value: "Активный", label: "Активные" },
  { value: "Отклонён", label: "Отклонённые" },
]

const MAX_CHIPS = 3

type SortField = "timestamp" | "activeSince"

/** candidate.timestamp is written as new Date().toISOString() but can be left empty on manually-entered rows. */
function parseIsoDate(s: string): number | null {
  if (!s) return null
  const t = new Date(s).getTime()
  return Number.isNaN(t) ? null : t
}

/** candidate.activeSince is stored as ru-RU text ("21.07.2026"), not ISO — see toRuDate() in candidate-edit-modal.tsx. */
function parseRuDate(s: string): number | null {
  const m = s.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (!m) return null
  const [, d, mo, y] = m
  return new Date(Number(y), Number(mo) - 1, Number(d)).getTime()
}

function SortableHeader({
  label,
  field,
  sortField,
  sortDir,
  onSort,
}: {
  label: string
  field: SortField
  sortField: SortField | null
  sortDir: "asc" | "desc"
  onSort: (field: SortField) => void
}) {
  const active = sortField === field
  return (
    <th className="whitespace-nowrap px-4 py-2.5 font-medium">
      <button
        type="button"
        onClick={() => onSort(field)}
        className={`inline-flex items-center gap-1 transition-colors hover:text-foreground ${active ? "text-foreground" : ""}`}
      >
        {label}
        {active ? (
          sortDir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />
        ) : (
          <ArrowUpDown className="size-3 opacity-40" />
        )}
      </button>
    </th>
  )
}

function ResumeChips({ items }: { items: ResumeVersion[] }) {
  if (!items.length) return <span className="text-xs text-muted-foreground">—</span>
  const shown = items.slice(0, MAX_CHIPS)
  const rest = items.slice(MAX_CHIPS)
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map((v) => (
        <a
          key={v.id}
          href={v.kind === "file" ? withDownloadFilename(v.url, v.filename) : v.url}
          target="_blank"
          rel="noopener noreferrer"
          title={v.kind === "file" ? v.filename || "Файл" : v.url}
          className="inline-flex max-w-[9rem] items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
        >
          {v.kind === "file" ? (
            <FileText className="size-3 shrink-0" />
          ) : (
            <LinkIcon className="size-3 shrink-0" />
          )}
          <span className="truncate">
            {v.kind === "file" ? v.filename || "Файл" : v.url.replace(/^https?:\/\//, "")}
          </span>
        </a>
      ))}
      {rest.length > 0 && (
        <span
          title={rest.map((v) => (v.kind === "file" ? v.filename || "Файл" : v.url)).join("\n")}
          className="inline-flex items-center rounded-full border border-dashed px-2 py-0.5 text-[11px] text-muted-foreground"
        >
          +{rest.length}
        </span>
      )}
    </div>
  )
}

function CandidateRow({
  candidate,
  streams,
  files,
  links,
}: {
  candidate: Candidate
  streams: string[]
  files: ResumeVersion[]
  links: ResumeVersion[]
}) {
  const [isPending, startTransition] = useTransition()
  const [localStatus, setLocalStatus] = useState<"approved" | "rejected" | "disabled" | "deleted" | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [editing, setEditing] = useState(false)

  function handleApprove() {
    startTransition(async () => {
      setLocalStatus("approved")
      await approveCandidate(candidate.rowIndex, candidate.activeSince)
    })
  }

  function handleReject(result: "rejected" | "disabled") {
    startTransition(async () => {
      setLocalStatus(result)
      await rejectCandidate(candidate.rowIndex)
    })
  }

  function handleDelete() {
    startTransition(async () => {
      try {
        await deleteCandidate(candidate.rowIndex, candidate.id)
        setLocalStatus("deleted")
        setConfirmingDelete(false)
      } catch {
        setConfirmingDelete(false)
      }
    })
  }

  const done = localStatus !== null

  return (
    <>
      {editing && <CandidateEditModal candidate={candidate} streams={streams} onClose={() => setEditing(false)} />}
      <tr className={`border-b last:border-b-0 align-top transition-opacity ${done ? "opacity-50" : ""}`}>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm text-card-foreground">{candidate.name}</span>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                candidate.status === "На проверке"
                  ? "bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400"
                  : candidate.status === "Активный"
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {candidate.status}
            </span>
          </div>
          {candidate.title && (
            <p className="mt-0.5 text-xs text-muted-foreground">{candidate.title}</p>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {candidate.level && (
              <span className="inline-flex items-center rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-medium text-teal-700 dark:bg-teal-900/20 dark:text-teal-400">
                {candidate.level}
              </span>
            )}
            {candidate.stream.map((s) => (
              <span
                key={s}
                className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
              >
                {s}
              </span>
            ))}
          </div>
        </td>

        <td className="px-4 py-3 text-xs text-muted-foreground">
          <div className="space-y-0.5">
            {candidate.email && <p className="truncate">{candidate.email}</p>}
            {candidate.phone && <p className="truncate">{candidate.phone}</p>}
          </div>
        </td>

        <td className="px-4 py-3">
          <ResumeChips items={files} />
        </td>

        <td className="px-4 py-3">
          <ResumeChips items={links} />
        </td>

        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
          {candidate.timestamp ? new Date(candidate.timestamp).toLocaleDateString("ru-RU") : "—"}
        </td>

        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
          {candidate.activeSince || "—"}
        </td>

        <td className="px-4 py-3">
          {confirmingDelete ? (
            <div className="flex items-center justify-end gap-2 whitespace-nowrap">
              <span className="text-xs font-medium text-destructive">Удалить кандидата?</span>
              <button
                onClick={handleDelete}
                disabled={isPending}
                className="inline-flex items-center gap-1.5 rounded-lg bg-destructive px-3 py-1.5 text-xs font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50"
              >
                <Trash2 className="size-3.5" />
                Да, удалить
              </button>
              <button
                onClick={() => setConfirmingDelete(false)}
                disabled={isPending}
                className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
              >
                Отмена
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-end gap-2 whitespace-nowrap">
              {!done && (
                <button
                  onClick={() => setEditing(true)}
                  disabled={isPending}
                  className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
                  aria-label="Редактировать"
                >
                  <Pencil className="size-3.5" />
                </button>
              )}

              {candidate.status === "На проверке" && !done && (
                <>
                  <button
                    onClick={handleApprove}
                    disabled={isPending}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-600 px-3 py-1.5 text-xs font-medium text-emerald-600 transition-colors hover:bg-emerald-600 hover:text-white disabled:opacity-50"
                  >
                    {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
                    Добавить
                  </button>
                  <button
                    onClick={() => handleReject("rejected")}
                    disabled={isPending}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-destructive px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive hover:text-destructive-foreground disabled:opacity-50"
                  >
                    {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <XCircle className="size-3.5" />}
                    Отклонить
                  </button>
                </>
              )}

              {candidate.status === "Активный" && !done && (
                <button
                  onClick={() => handleReject("disabled")}
                  disabled={isPending}
                  className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium text-amber-600 transition-colors hover:bg-amber-500/10 disabled:opacity-50"
                >
                  {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Ban className="size-3.5" />}
                  Отключить
                </button>
              )}

              {candidate.status === "Отклонён" && !done && (
                <button
                  onClick={handleApprove}
                  disabled={isPending}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
                >
                  {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
                  Подтвердить
                </button>
              )}

              {localStatus === "approved" && <span className="text-xs font-medium text-emerald-600">Добавлен</span>}
              {localStatus === "rejected" && <span className="text-xs font-medium text-destructive">Отклонён</span>}
              {localStatus === "disabled" && <span className="text-xs font-medium text-muted-foreground">Отключён</span>}
              {localStatus === "deleted" && <span className="text-xs font-medium text-muted-foreground">Удалён</span>}

              {!done && (
                <button
                  onClick={() => setConfirmingDelete(true)}
                  disabled={isPending}
                  className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                  aria-label="Удалить"
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </div>
          )}
        </td>
      </tr>
    </>
  )
}

export function CandidateSection({
  candidates,
  streams,
  resumeHistory,
}: {
  candidates: Candidate[]
  streams: string[]
  resumeHistory: Record<string, ResumeVersion[]>
}) {
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState<CandidateStatus | "">("")
  const [stream, setStream] = useState("")
  const [level, setLevel] = useState("")
  const [creating, setCreating] = useState(false)
  const [sortField, setSortField] = useState<SortField | null>(null)
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortField(field)
      setSortDir("desc")
    }
  }

  const levels = useMemo(
    () => Array.from(new Set(candidates.map((c) => c.level).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [candidates],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return candidates.filter((c) => {
      if (status && c.status !== status) return false
      if (level && c.level !== level) return false
      if (stream && !c.stream.some((s) => s.trim().toLowerCase() === stream.toLowerCase())) return false
      if (q) {
        const haystack = `${c.name} ${c.email} ${c.phone}`.toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [candidates, search, status, stream, level])

  const sorted = useMemo(() => {
    if (!sortField) return filtered
    const getValue = sortField === "timestamp"
      ? (c: Candidate) => parseIsoDate(c.timestamp)
      : (c: Candidate) => parseRuDate(c.activeSince)
    // Stable-ish: rows without a parseable date always sort to the end, regardless of direction.
    return filtered
      .map((c, i) => ({ c, i, v: getValue(c) }))
      .sort((a, b) => {
        if (a.v === null && b.v === null) return a.i - b.i
        if (a.v === null) return 1
        if (b.v === null) return -1
        return sortDir === "asc" ? a.v - b.v : b.v - a.v
      })
      .map((x) => x.c)
  }, [filtered, sortField, sortDir])

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          placeholder="Поиск по имени, email, телефону"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={`${SELECT_CLASS} flex-1 min-w-[200px]`}
        />
        <select value={status} onChange={(e) => setStatus(e.target.value as CandidateStatus | "")} className={SELECT_CLASS}>
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select value={stream} onChange={(e) => setStream(e.target.value)} className={SELECT_CLASS}>
          <option value="">Все стримы</option>
          {streams.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select value={level} onChange={(e) => setLevel(e.target.value)} className={SELECT_CLASS}>
          <option value="">Все уровни</option>
          {levels.map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground shrink-0">
          {filtered.length} {candidatePlural(filtered.length)}
        </span>
        <button
          onClick={() => setCreating(true)}
          className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Plus className="size-3.5" />
          Добавить кандидата
        </button>
      </div>

      {creating && <CandidateCreateModal streams={streams} onClose={() => setCreating(false)} />}

      <div className="rounded-xl border bg-card overflow-hidden">
        {candidates.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">Кандидатов пока нет.</p>
        ) : filtered.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">Кандидаты не найдены по заданным фильтрам.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] text-left text-sm">
              <thead>
                <tr className="border-b bg-muted/30 text-xs font-medium text-muted-foreground">
                  <th className="whitespace-nowrap px-4 py-2.5 font-medium">Кандидат</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-medium">Контакты</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-medium">Файлы</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-medium">Ссылки</th>
                  <SortableHeader label="Дата регистрации" field="timestamp" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <SortableHeader label="Активен с" field="activeSince" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <th className="whitespace-nowrap px-4 py-2.5 font-medium text-right">Действия</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((c) => {
                  const history = resumeHistory[c.id] ?? []
                  return (
                    <CandidateRow
                      key={c.rowIndex}
                      candidate={c}
                      streams={streams}
                      files={history.filter((v) => v.kind === "file")}
                      links={history.filter((v) => v.kind === "link")}
                    />
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
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
