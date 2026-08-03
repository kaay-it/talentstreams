"use client"

import { useState, useTransition } from "react"
import { ChevronDown, ChevronUp, CheckCircle2, XCircle, Building2 } from "lucide-react"
import { confirmEmployer, rejectEmployer } from "@/app/actions"
import type { Employer } from "@/lib/sheets"

export function EmployerSection({ employers }: { employers: Employer[] }) {
  const pending = employers.filter((e) => e.status === "На проверке")
  const rejected = employers.filter((e) => e.status === "Отклонён")
  const confirmed = employers.filter((e) => e.status === "Подтверждён")

  if (!employers.length) return (
    <p className="text-sm text-muted-foreground">Заявок пока нет.</p>
  )

  return (
    <div className="space-y-2">
      <EmployerGroup title="На проверке" employers={pending} defaultOpen />
      <EmployerGroup title="Отклонён" employers={rejected} defaultOpen={false} />
      <EmployerGroup title="Подтверждён" employers={confirmed} defaultOpen={false} />
    </div>
  )
}

function EmployerGroup({ title, employers, defaultOpen }: {
  title: string
  employers: Employer[]
  defaultOpen: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-5 py-3 text-sm font-medium hover:bg-muted/50 transition-colors"
      >
        <span>
          {title}{" "}
          <span className="font-normal text-muted-foreground">({employers.length})</span>
        </span>
        {open
          ? <ChevronUp className="size-4 text-muted-foreground" />
          : <ChevronDown className="size-4 text-muted-foreground" />
        }
      </button>

      {open && (
        <div className="border-t">
          {employers.length === 0
            ? <p className="px-5 py-3 text-sm text-muted-foreground">Нет работодателей.</p>
            : <div className="divide-y">
                {employers.map((e) => (
                  <EmployerRow key={e.rowIndex} employer={e} />
                ))}
              </div>
          }
        </div>
      )}
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
          <p className="text-sm font-medium truncate">
            {employer.name}
            {employer.company ? <span className="font-normal text-muted-foreground"> · {employer.company}</span> : null}
          </p>
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
