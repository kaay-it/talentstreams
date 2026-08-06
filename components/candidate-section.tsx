"use client"

import { useState, useTransition } from "react"
import { ChevronDown, ChevronRight, CheckCircle2, XCircle, ExternalLink, Loader2, Pencil } from "lucide-react"
import { approveCandidate, rejectCandidate } from "@/app/actions"
import { CandidateEditModal } from "@/components/candidate-edit-modal"
import type { Candidate } from "@/lib/sheets"

type LocalStatus = "approved" | "rejected" | null

function CandidateRow({ candidate }: { candidate: Candidate }) {
  const [isPending, startTransition] = useTransition()
  const [localStatus, setLocalStatus] = useState<LocalStatus>(null)
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

function CandidateGroup({
  title,
  candidates,
  defaultOpen,
  badge,
}: {
  title: string
  candidates: Candidate[]
  defaultOpen: boolean
  badge?: string
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3 text-sm font-medium text-card-foreground hover:bg-muted/50 transition-colors"
      >
        <span className="flex items-center gap-2">
          {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          {title}
          {badge && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
              {badge}
            </span>
          )}
        </span>
        <span className="text-xs text-muted-foreground">{candidates.length}</span>
      </button>

      {open && (
        <div className="border-t">
          {candidates.length === 0 ? (
            <p className="px-5 py-4 text-sm text-muted-foreground">Нет кандидатов</p>
          ) : (
            candidates.map((c) => <CandidateRow key={c.rowIndex} candidate={c} />)
          )}
        </div>
      )}
    </div>
  )
}

export function CandidateSection({
  pending,
  active,
  rejected,
}: {
  pending: Candidate[]
  active: Candidate[]
  rejected: Candidate[]
}) {
  return (
    <div className="space-y-3">
      <CandidateGroup
        title="На проверке"
        candidates={pending}
        defaultOpen={true}
        badge={pending.length > 0 ? String(pending.length) : undefined}
      />
      <CandidateGroup
        title="Активные"
        candidates={active}
        defaultOpen={pending.length === 0 && active.length > 0}
        badge={active.length > 0 ? String(active.length) : undefined}
      />
      <CandidateGroup title="Отклонённые" candidates={rejected} defaultOpen={false} />
    </div>
  )
}
