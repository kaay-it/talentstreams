"use client"

import { useMemo, useState, useTransition } from "react"
import { CheckCircle2, XCircle, Building2 } from "lucide-react"
import { confirmEmployer, rejectEmployer } from "@/app/actions"
import type { Employer, EmployerStatus } from "@/lib/sheets"

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

export function EmployerSection({ employers, streams }: { employers: Employer[]; streams: string[] }) {
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState<EmployerStatus | "">("")
  const [country, setCountry] = useState("")
  const [stream, setStream] = useState("")

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

  if (!employers.length) {
    return <p className="text-sm text-muted-foreground">Заявок пока нет.</p>
  }

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
        <span className="ml-auto text-xs text-muted-foreground shrink-0">
          {filtered.length} {employerPlural(filtered.length)}
        </span>
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        {filtered.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">Работодатели не найдены по заданным фильтрам.</p>
        ) : (
          <div className="divide-y">
            {filtered.map((e) => (
              <EmployerRow key={e.rowIndex} employer={e} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function EmployerRow({ employer }: { employer: Employer }) {
  const [isPending, startTransition] = useTransition()
  const [localStatus, setLocalStatus] = useState<"confirmed" | "rejected" | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleConfirm = () => {
    setError(null)
    startTransition(async () => {
      try {
        await confirmEmployer(employer.rowIndex, employer)
        setLocalStatus("confirmed")
      } catch (err) {
        setError(err instanceof Error ? err.message : "Неизвестная ошибка")
      }
    })
  }

  const handleReject = () => {
    setError(null)
    startTransition(async () => {
      try {
        await rejectEmployer(employer.rowIndex)
        setLocalStatus("rejected")
      } catch (err) {
        setError(err instanceof Error ? err.message : "Неизвестная ошибка")
      }
    })
  }

  return (
    <div className="flex flex-col gap-1 px-5 py-3">
      <div className="flex items-center gap-4">
        <Building2 className="size-4 shrink-0 text-muted-foreground" />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium truncate">
              {employer.name}
              {employer.company ? <span className="font-normal text-muted-foreground"> · {employer.company}</span> : null}
            </p>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_BADGE[employer.status]}`}>
              {employer.status}
            </span>
          </div>
          <p className="text-xs text-muted-foreground truncate">
            {employer.email}
            {employer.streams.length ? ` · ${employer.streams.join(", ")}` : ""}
            {employer.country ? ` · ${employer.country}` : ""}
            {employer.additionalCountries.length ? ` (+ ${employer.additionalCountries.join(", ")})` : ""}
          </p>
        </div>

        {employer.status === "На проверке" && !localStatus && (
          <div className="flex shrink-0 gap-2">
            <button
              onClick={handleConfirm}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
            >
              <CheckCircle2 className="size-3.5" />
              Подтвердить
            </button>
            <button
              onClick={handleReject}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
            >
              <XCircle className="size-3.5" />
              Отклонить
            </button>
          </div>
        )}

        {localStatus === "confirmed" && (
          <span className="shrink-0 text-xs text-emerald-600">Подтверждён ✓</span>
        )}
        {localStatus === "rejected" && (
          <span className="shrink-0 text-xs text-muted-foreground">Отклонён</span>
        )}
      </div>

      {error && (
        <p className="ml-8 text-xs text-destructive">{error}</p>
      )}
    </div>
  )
}

function employerPlural(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return "работодатель"
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "работодателя"
  return "работодателей"
}
