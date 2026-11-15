"use client"

import { useState, useTransition } from "react"
import { Info, Loader2 } from "lucide-react"
import { getReleaseViewDetails, type ReleaseViewDetail } from "@/app/actions"
import type { ReleaseViewStats, ReleaseViewSource } from "@/lib/db/mailing-lists"

const SOURCE_LABEL: Record<ReleaseViewSource, string> = { email: "Email", tg: "Telegram", wa: "WhatsApp", unknown: "Неизвестно" }
const SOURCE_ORDER: ReleaseViewSource[] = ["email", "tg", "wa", "unknown"]

type ReleaseRow = {
  listId: string
  stream: string
  date: string
  stats: ReleaseViewStats
}

export function ReleaseStatsSection({ releases }: { releases: ReleaseRow[] }) {
  const noDataAtAll = releases.every((r) => r.stats.totalViews === 0)

  return (
    <div className="space-y-3">
      {releases.length > 0 && noDataAtAll && (
        <div className="flex items-start gap-2.5 rounded-lg border bg-muted/30 px-4 py-3">
          <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Переходов по ссылкам пока не было — данные появятся после реальных заходов работодателей.
          </p>
        </div>
      )}

      <div className="rounded-xl border bg-card overflow-hidden">
        {releases.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">Отправленных выпусков пока нет.</p>
        ) : (
          <>
            <div className="flex items-center gap-4 border-b bg-muted/30 px-4 py-2.5 text-xs font-medium text-muted-foreground">
              <span className="min-w-0 flex-1">Выпуск</span>
              <span className="w-20 shrink-0 text-right">Просмотров</span>
              <span className="w-28 shrink-0 text-right">Работодателей</span>
              <span className="w-56 shrink-0">По каналам</span>
            </div>
            {releases.map((r) => (
              <ReleaseRowDetails key={r.listId} release={r} />
            ))}
          </>
        )}
      </div>
    </div>
  )
}

function ReleaseRowDetails({ release }: { release: ReleaseRow }) {
  const [details, setDetails] = useState<ReleaseViewDetail[] | null>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleToggle(e: React.SyntheticEvent<HTMLDetailsElement>) {
    if (!e.currentTarget.open || details !== null || isPending) return
    startTransition(async () => {
      try {
        setDetails(await getReleaseViewDetails(release.listId))
      } catch (err) {
        setError(err instanceof Error ? err.message : "Не удалось загрузить детали")
      }
    })
  }

  const channels = SOURCE_ORDER.filter((s) => (release.stats.bySource[s] ?? 0) > 0)

  return (
    <details className="border-b last:border-b-0" onToggle={handleToggle}>
      <summary className="flex cursor-pointer select-none items-center gap-4 px-4 py-3 text-sm transition-colors hover:bg-muted/40">
        <span className="min-w-0 flex-1 truncate font-medium text-card-foreground">
          {release.stream} — {release.date}
        </span>
        <span className="w-20 shrink-0 text-right tabular-nums">{release.stats.totalViews}</span>
        <span className="w-28 shrink-0 text-right tabular-nums">{release.stats.distinctEmployers}</span>
        <span className="flex w-56 shrink-0 flex-wrap gap-1">
          {channels.length === 0 ? (
            <span className="text-xs text-muted-foreground">—</span>
          ) : (
            channels.map((s) => (
              <span key={s} className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                {SOURCE_LABEL[s]}: {release.stats.bySource[s]}
              </span>
            ))
          )}
        </span>
      </summary>

      <div className="border-t bg-muted/20 px-4 py-3">
        {error ? (
          <p className="text-xs text-destructive">{error}</p>
        ) : isPending || details === null ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Загрузка…
          </div>
        ) : details.length === 0 ? (
          <p className="text-xs text-muted-foreground">Просмотров нет.</p>
        ) : (
          <ul className="space-y-1.5">
            {details.map((d, i) => (
              <li key={`${d.employerToken}-${i}`} className="flex items-center gap-2 text-xs">
                <span className="min-w-0 flex-1 truncate text-card-foreground">
                  {d.employerName}
                  {d.company && <span className="text-muted-foreground"> ({d.company})</span>}
                </span>
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground">
                  {SOURCE_LABEL[d.source]}
                </span>
                <span className="shrink-0 text-muted-foreground/70">
                  {new Date(d.viewedAt).toLocaleString("ru-RU")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  )
}
