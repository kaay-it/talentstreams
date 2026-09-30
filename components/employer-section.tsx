"use client"

import { useMemo, useState, useTransition } from "react"
import { CheckCircle2, XCircle, Ban, Trash2, Pencil, Plus, Send, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react"
import { confirmEmployer, rejectEmployer, deleteEmployer } from "@/app/actions"
import { EmployerEditModal } from "@/components/employer-edit-modal"
import { EmployerCreateModal } from "@/components/employer-create-modal"
import type { Employer, EmployerStatus } from "@/lib/db/employers"

const SELECT_CLASS =
  "rounded-md border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"

const STATUS_OPTIONS: { value: EmployerStatus | ""; label: string }[] = [
  { value: "", label: "Все статусы" },
  { value: "На проверке", label: "На проверке" },
  { value: "Подтверждён", label: "Подтверждённые" },
  { value: "Отклонён", label: "Отклонённые" },
]

const STATUS_BADGE: Record<EmployerStatus, string> = {
  "На проверке": "bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400",
  "Подтверждён": "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  "Отклонён": "bg-muted text-muted-foreground",
}

/** Подтверждённые вперёд, остальные статусы равноценны между собой — используется и для
 * сортировки по статусу, и для дефолтной сортировки (см. EmployerSection). */
const STATUS_RANK: Record<EmployerStatus, number> = {
  "Подтверждён": 0,
  "На проверке": 1,
  "Отклонён": 1,
}

type SortField = "timestamp" | "status"

/** employer.timestamp — ISO-строка (row.timestamp.toISOString(), lib/db/employers.ts), всегда заполнена. */
function parseIsoDate(s: string): number | null {
  if (!s) return null
  const t = new Date(s).getTime()
  return Number.isNaN(t) ? null : t
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

export function EmployerSection({
  employers,
  streams,
  telegramConnectedTokens,
}: {
  employers: Employer[]
  streams: string[]
  telegramConnectedTokens: string[]
}) {
  const telegramConnected = useMemo(() => new Set(telegramConnectedTokens), [telegramConnectedTokens])
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState<EmployerStatus | "">("")
  const [country, setCountry] = useState("")
  const [stream, setStream] = useState("")
  const [creating, setCreating] = useState(false)
  const [sortField, setSortField] = useState<SortField | null>(null)
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortField(field)
      setSortDir("asc")
    }
  }

  const countries = useMemo(
    () => Array.from(new Set(employers.map((e) => e.country).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [employers],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return employers.filter((e) => {
      if (status && e.status !== status) return false
      if (country && e.country !== country) return false
      if (stream && !e.streams.some((s) => s.trim().toLowerCase() === stream.toLowerCase())) return false
      if (q) {
        const haystack = `${e.name} ${e.company} ${e.email}`.toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [employers, search, status, country, stream])

  const sorted = useMemo(() => {
    if (!sortField) {
      // По умолчанию: сначала подтверждённые, внутри группы — по дате регистрации от старых к новым.
      return [...filtered].sort((a, b) => {
        const rankDiff = STATUS_RANK[a.status] - STATUS_RANK[b.status]
        if (rankDiff !== 0) return rankDiff
        const ta = parseIsoDate(a.timestamp)
        const tb = parseIsoDate(b.timestamp)
        if (ta === null && tb === null) return 0
        if (ta === null) return 1
        if (tb === null) return -1
        return ta - tb
      })
    }
    const getValue = sortField === "timestamp"
      ? (e: Employer) => parseIsoDate(e.timestamp)
      : (e: Employer) => STATUS_RANK[e.status]
    return filtered
      .map((e, i) => ({ e, i, v: getValue(e) }))
      .sort((a, b) => {
        if (a.v === null && b.v === null) return a.i - b.i
        if (a.v === null) return 1
        if (b.v === null) return -1
        return sortDir === "asc" ? a.v - b.v : b.v - a.v
      })
      .map((x) => x.e)
  }, [filtered, sortField, sortDir])

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          placeholder="Поиск по имени, компании, email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={`${SELECT_CLASS} flex-1 min-w-[200px]`}
        />
        <select value={status} onChange={(e) => setStatus(e.target.value as EmployerStatus | "")} className={SELECT_CLASS}>
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select value={country} onChange={(e) => setCountry(e.target.value)} className={SELECT_CLASS}>
          <option value="">Все страны</option>
          {countries.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select value={stream} onChange={(e) => setStream(e.target.value)} className={SELECT_CLASS}>
          <option value="">Все стримы</option>
          {streams.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground shrink-0">
          {filtered.length} {employerPlural(filtered.length)}
        </span>
        <button
          onClick={() => setCreating(true)}
          className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Plus className="size-3.5" />
          Добавить работодателя
        </button>
      </div>

      {creating && <EmployerCreateModal streams={streams} onClose={() => setCreating(false)} />}

      <div className="rounded-xl border bg-card overflow-hidden">
        {employers.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">Заявок пока нет.</p>
        ) : filtered.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">Работодатели не найдены по заданным фильтрам.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] text-left text-sm">
              <thead>
                <tr className="border-b bg-muted/30 text-xs font-medium text-muted-foreground">
                  <th className="whitespace-nowrap px-4 py-2.5 font-medium">Работодатель</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-medium">Контакты</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-medium">Стримы</th>
                  <th className="whitespace-nowrap px-4 py-2.5 font-medium">Страна</th>
                  <SortableHeader label="Статус" field="status" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <SortableHeader label="Дата регистрации" field="timestamp" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <th className="whitespace-nowrap px-4 py-2.5 font-medium text-right">Действия</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((e) => (
                  <EmployerRow key={e.token} employer={e} streams={streams} telegramConnected={telegramConnected.has(e.token)} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function EmployerRow({
  employer,
  streams,
  telegramConnected,
}: {
  employer: Employer
  streams: string[]
  telegramConnected: boolean
}) {
  const [isPending, startTransition] = useTransition()
  const [localStatus, setLocalStatus] = useState<"confirmed" | "rejected" | "disabled" | "deleted" | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)

  const handleConfirm = () => {
    setError(null)
    startTransition(async () => {
      try {
        await confirmEmployer(employer.token, employer)
        setLocalStatus("confirmed")
      } catch (err) {
        setError(err instanceof Error ? err.message : "Неизвестная ошибка")
      }
    })
  }

  const handleReject = (result: "rejected" | "disabled") => {
    setError(null)
    startTransition(async () => {
      try {
        await rejectEmployer(employer.token)
        setLocalStatus(result)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Неизвестная ошибка")
      }
    })
  }

  const handleDelete = () => {
    setError(null)
    startTransition(async () => {
      try {
        await deleteEmployer(employer.token)
        setLocalStatus("deleted")
        setConfirmingDelete(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Неизвестная ошибка")
        setConfirmingDelete(false)
      }
    })
  }

  const done = localStatus !== null

  return (
    <>
      {editing && (
        <EmployerEditModal employer={employer} streams={streams} onClose={() => setEditing(false)} />
      )}
      <tr className={`border-b last:border-b-0 align-top transition-opacity ${done ? "opacity-50" : ""}`}>
        <td className="px-4 py-3">
          <p className="text-sm font-medium text-card-foreground">{employer.name}</p>
          {employer.company && <p className="mt-0.5 text-xs text-muted-foreground">{employer.company}</p>}
        </td>

        <td className="px-4 py-3 text-xs text-muted-foreground">
          <div className="space-y-0.5">
            {employer.email && <p className="truncate">{employer.email}</p>}
            {employer.phone && <p className="truncate">{employer.phone}</p>}
          </div>
        </td>

        <td className="px-4 py-3">
          <div className="flex flex-wrap gap-1">
            {employer.streams.map((s) => (
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
          {employer.country || "—"}
          {employer.additionalCountries.length ? ` (+ ${employer.additionalCountries.join(", ")})` : ""}
        </td>

        <td className="px-4 py-3">
          <div className="flex flex-wrap items-center gap-1">
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_BADGE[employer.status]}`}>
              {employer.status}
            </span>
            {telegramConnected && (
              <span
                title="Подключён к Telegram-боту"
                className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:bg-sky-900/30 dark:text-sky-400"
              >
                <Send className="size-3" />
                Telegram
              </span>
            )}
          </div>
        </td>

        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
          {employer.timestamp ? new Date(employer.timestamp).toLocaleDateString("ru-RU") : "—"}
        </td>

        <td className="px-4 py-3">
          {confirmingDelete ? (
            <div className="flex items-center justify-end gap-2 whitespace-nowrap">
              <span className="text-xs font-medium text-destructive">Удалить работодателя?</span>
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
            <div className="flex flex-col items-end gap-1">
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

                {employer.status === "На проверке" && !done && (
                  <>
                    <button
                      onClick={handleConfirm}
                      disabled={isPending}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
                    >
                      <CheckCircle2 className="size-3.5" />
                      Подтвердить
                    </button>
                    <button
                      onClick={() => handleReject("rejected")}
                      disabled={isPending}
                      className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
                    >
                      <XCircle className="size-3.5" />
                      Отклонить
                    </button>
                  </>
                )}

                {employer.status === "Подтверждён" && !done && (
                  <button
                    onClick={() => handleReject("disabled")}
                    disabled={isPending}
                    className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium text-amber-600 transition-colors hover:bg-amber-500/10 disabled:opacity-50"
                  >
                    <Ban className="size-3.5" />
                    Отключить
                  </button>
                )}

                {employer.status === "Отклонён" && !done && (
                  <button
                    onClick={handleConfirm}
                    disabled={isPending}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
                  >
                    <CheckCircle2 className="size-3.5" />
                    Подтвердить
                  </button>
                )}

                {localStatus === "confirmed" && (
                  <span className="text-xs text-emerald-600">Подтверждён ✓</span>
                )}
                {localStatus === "rejected" && (
                  <span className="text-xs text-muted-foreground">Отклонён</span>
                )}
                {localStatus === "disabled" && (
                  <span className="text-xs text-muted-foreground">Отключён — отписан от рассылки</span>
                )}
                {localStatus === "deleted" && (
                  <span className="text-xs text-muted-foreground">Удалён</span>
                )}

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
              {error && <p className="text-xs text-destructive">{error}</p>}
            </div>
          )}
        </td>
      </tr>
    </>
  )
}

function employerPlural(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return "работодатель"
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "работодателя"
  return "работодателей"
}
