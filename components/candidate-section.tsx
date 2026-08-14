"use client"

import { useMemo, useState, useTransition } from "react"
import { CheckCircle2, XCircle, ExternalLink, Loader2, Pencil } from "lucide-react"
import { approveCandidate, rejectCandidate } from "@/app/actions"
import { CandidateEditModal } from "@/components/candidate-edit-modal"
import type { Candidate, CandidateStatus } from "@/lib/sheets"

const SELECT_CLASS =
  "rounded-md border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"

const STATUS_OPTIONS: { value: CandidateStatus | ""; label: string }[] = [
  { value: "", label: "Все статусы" },
  { value: "На проверке", label: "На проверке" },
  { value: "Активный", label: "Активные" },
  { value: "Отклонён", label: "Отклонённые" },
]

function CandidateRow({ candidate }: { candidate: Candidate }) {
  const [isPending, startTransition] = useTransition()
  const [localStatus, setLocalStatus] = useState<"approved" | "rejected" | null>(null)
  const [editing, setEditing] = useState(false)

  function handleApprove() {
    startTransition(async () => {
      setLocalStatus("approved")
      await approveCandidate(candidate.rowIndex)
    })
  }

  function handleReject() {
    startTransition(async () => {
      setLocalStatus("rejected")
      await rejectCandidate(candidate.rowIndex)
    })
  }

  const done = localStatus !== null

  return (
    <>
      {editing && <CandidateEditModal candidate={candidate} onClose={() => setEditing(false)} />}
      <div className={`border-b last:border-b-0 px-5 py-4 transition-opacity ${done ? "opacity-50" : ""}`}>
        <div className="flex items-start gap-4">
          <div className="flex-1 min-w-0">
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
              {candidate.activeSince && (
                <span className="text-xs text-muted-foreground">с {candidate.activeSince}</span>
              )}
            </div>
            <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              {candidate.email && <span>{candidate.email}</span>}
              {candidate.phone && <span>{candidate.phone}</span>}
              {candidate.timestamp && (
                <span>{new Date(candidate.timestamp).toLocaleDateString("ru-RU")}</span>
              )}
            </div>
            {candidate.coverLetter && (
              <p className="mt-2 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                {candidate.coverLetter}
              </p>
            )}
            {candidate.resumeUrl && (
              <a
                href={candidate.resumeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                Резюме <ExternalLink className="size-3" />
              </a>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setEditing(true)}
              disabled={isPending}
              className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
              aria-label="Редактировать"
            >
              <Pencil className="size-3.5" />
            </button>

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
                  onClick={handleReject}
                  disabled={isPending}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-destructive px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive hover:text-destructive-foreground disabled:opacity-50"
                >
                  {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <XCircle className="size-3.5" />}
                  Отклонить
                </button>
              </>
            )}

            {done && (
              <span className={`text-xs font-medium ${localStatus === "approved" ? "text-emerald-600" : "text-destructive"}`}>
                {localStatus === "approved" ? "Добавлен" : "Отклонён"}
              </span>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

export function CandidateSection({ candidates, streams }: { candidates: Candidate[]; streams: string[] }) {
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState<CandidateStatus | "">("")
  const [stream, setStream] = useState("")
  const [level, setLevel] = useState("")

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
        <span className="ml-auto text-xs text-muted-foreground shrink-0">
          {filtered.length} {candidatePlural(filtered.length)}
        </span>
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        {candidates.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">Кандидатов пока нет.</p>
        ) : filtered.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">Кандидаты не найдены по заданным фильтрам.</p>
        ) : (
          filtered.map((c) => <CandidateRow key={c.rowIndex} candidate={c} />)
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
