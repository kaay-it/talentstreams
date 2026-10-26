"use client"

import { useTransition } from "react"
import { setContactRequestStatus } from "@/app/actions"
import type { ContactRequest, ContactRequestStatus } from "@/lib/db/contact-requests"

const CANDIDATE_STATUSES: ContactRequestStatus[] = [
  "Новый запрос",
  "Кандидату написали",
  "Кандидат не отвечает",
  "Связаться с Аленой",
  "Кандидату интересно",
  "Кандидату не интересно",
  "Контакты переданы",
]

const INQUIRY_STATUSES: ContactRequestStatus[] = [
  "Новый запрос",
  "Взяли в работу",
  "Завершён",
]

const STATUS_COLOR: Partial<Record<ContactRequestStatus, string>> = {
  "Новый запрос":           "bg-blue-100 text-blue-700",
  "Кандидату написали":     "bg-violet-100 text-violet-700",
  "Кандидат не отвечает":   "bg-amber-100 text-amber-700",
  "Связаться с Аленой":     "bg-rose-100 text-rose-700",
  "Кандидату интересно":    "bg-emerald-100 text-emerald-700",
  "Кандидату не интересно": "bg-slate-100 text-slate-500",
  "Контакты переданы":      "bg-green-100 text-green-700",
  "Взяли в работу":         "bg-violet-100 text-violet-700",
  "Завершён":               "bg-green-100 text-green-700",
}

type ProfileLabel = { name: string; title: string }

export function ContactRequestsSection({
  requests,
  profileLabels,
  editorSecret,
}: {
  requests: ContactRequest[]
  profileLabels: Map<string, ProfileLabel>
  editorSecret?: string
}) {
  const candidateRequests = requests.filter((r) => r.candidateId)
  const generalInquiries = requests.filter((r) => !r.candidateId)

  if (!requests.length) {
    return <p className="text-sm text-muted-foreground">Запросов пока нет.</p>
  }

  return (
    <div className="space-y-6">
      {generalInquiries.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground uppercase tracking-wide">Общие запросы</h2>
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="divide-y">
              {generalInquiries.map((req) => (
                <RequestRow key={req.id} req={req} statuses={INQUIRY_STATUSES} profileLabels={profileLabels} editorSecret={editorSecret} showCandidate={false} />
              ))}
            </div>
          </div>
        </div>
      )}

      {candidateRequests.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground uppercase tracking-wide">По кандидатам</h2>
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="divide-y">
              {candidateRequests.map((req) => (
                <RequestRow key={req.id} req={req} statuses={CANDIDATE_STATUSES} profileLabels={profileLabels} editorSecret={editorSecret} showCandidate />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function RequestRow({
  req,
  statuses,
  profileLabels,
  editorSecret,
  showCandidate,
}: {
  req: ContactRequest
  statuses: ContactRequestStatus[]
  profileLabels: Map<string, ProfileLabel>
  editorSecret?: string
  showCandidate: boolean
}) {
  const [isPending, startTransition] = useTransition()

  const handleStatusChange = (status: ContactRequestStatus) => {
    startTransition(async () => {
      await setContactRequestStatus(req.id, status)
    })
  }

  const date = req.timestamp ? new Date(req.timestamp).toLocaleDateString("ru-RU") : "—"
  const candidate = profileLabels.get(req.candidateId)
  const candidateName = candidate?.name ?? `#${req.candidateId.slice(0, 8)}`
  const cols = showCandidate ? "sm:grid-cols-4" : "sm:grid-cols-3"

  return (
    <div className={`px-5 py-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-6 ${isPending ? "opacity-60" : ""}`}>
      <div className={`flex-1 min-w-0 grid grid-cols-2 gap-x-6 gap-y-1 ${cols}`}>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Компания</p>
          <p className="text-sm font-medium truncate">{req.company || req.employerName || "—"}</p>
          <p className="text-xs text-muted-foreground truncate">{req.employerEmail}</p>
        </div>

        {showCandidate && (
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Кандидат</p>
            <a
              href={`/profile/${req.candidateId}${editorSecret ? `?secret=${editorSecret}` : ""}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block truncate text-sm font-medium text-card-foreground hover:text-primary hover:underline"
            >
              {candidateName}
            </a>
            {candidate?.title && <p className="text-xs text-muted-foreground truncate">{candidate.title}</p>}
          </div>
        )}

        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Стрим · Дата</p>
          <p className="text-sm">{req.stream || "—"}</p>
          <p className="text-xs text-muted-foreground">{date}</p>
        </div>

        <div className="min-w-0">
          <p className="text-xs text-muted-foreground mb-1">Статус</p>
          <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[req.status] ?? "bg-muted text-muted-foreground"}`}>
            {req.status}
          </span>
        </div>
      </div>

      <div className="shrink-0">
        <select
          defaultValue={req.status}
          disabled={isPending}
          onChange={(e) => handleStatusChange(e.target.value as ContactRequestStatus)}
          className="rounded-lg border bg-background px-2 py-1.5 text-xs text-foreground disabled:opacity-50 cursor-pointer"
        >
          {statuses.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>
    </div>
  )
}
