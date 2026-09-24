"use client"

import { Fragment, useState, useTransition } from "react"
import { Layers, ArchiveRestore, ChevronDown, ChevronUp } from "lucide-react"
import { unarchiveStream } from "@/app/actions"
import type { StreamRecord } from "@/lib/db/streams"
import type { MailingListSummary } from "@/lib/db/mailing-lists"

const TYPE_STYLE: Record<string, string> = {
  Industry:   "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  Functional: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
}

type StreamMailingHistoryEntry = MailingListSummary & { sent: boolean }

export function ArchivedStreamsSection({
  streams,
  candidateCounts = {},
  subscriberCounts = {},
  mailingHistoryByStreamId = {},
}: {
  streams: StreamRecord[]
  candidateCounts?: Record<number, number>
  subscriberCounts?: Record<number, number>
  mailingHistoryByStreamId?: Record<number, StreamMailingHistoryEntry[]>
}) {
  const [open, setOpen] = useState(false)
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set())
  const [isPending, startTransition] = useTransition()

  if (!streams.length) return null

  const toggleExpanded = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const handleRestore = (id: number) => {
    startTransition(async () => { await unarchiveStream(id) })
  }

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        {open ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        {open ? "Скрыть архивные стримы" : `Архивные стримы (${streams.length})`}
      </button>

      {open && (
        <div className="mt-3 rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground w-8">ID</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Название</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground w-36">Тип</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground w-28">Кандидаты</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground w-28">Подписчики</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Описание</th>
                <th className="px-4 py-3 w-20" />
              </tr>
            </thead>
            <tbody>
              {streams.map((stream) => {
                const releases = mailingHistoryByStreamId[stream.id] ?? []
                const isExpanded = expandedIds.has(stream.id)
                return (
                  <Fragment key={stream.id}>
                    <tr className="border-b last:border-b-0 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3.5 font-mono text-xs text-muted-foreground">{stream.id}</td>
                      <td className="px-4 py-3.5 font-medium">
                        <div className="flex items-center gap-2">
                          <Layers className="size-3.5 text-muted-foreground/50 shrink-0" />
                          <span className="text-muted-foreground">{stream.name}</span>
                          {releases.length > 0 && (
                            <button
                              onClick={() => toggleExpanded(stream.id)}
                              title="История рассылок"
                              className="inline-flex items-center gap-0.5 rounded p-0.5 text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                            >
                              {isExpanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                              {releases.length}
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        {stream.type ? (
                          <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium opacity-60 ${TYPE_STYLE[stream.type] ?? "bg-muted text-muted-foreground"}`}>
                            {stream.type}
                          </span>
                        ) : <span className="text-muted-foreground/40">—</span>}
                      </td>
                      <td className="px-4 py-3.5 text-muted-foreground">{candidateCounts[stream.id] ?? 0}</td>
                      <td className="px-4 py-3.5 text-muted-foreground">{subscriberCounts[stream.id] ?? 0}</td>
                      <td className="px-4 py-3.5 text-muted-foreground">
                        {stream.description || <span className="text-muted-foreground/40">—</span>}
                      </td>
                      <td className="px-4 py-3.5">
                        <button
                          onClick={() => handleRestore(stream.id)}
                          disabled={isPending}
                          title="Вернуть в активные"
                          className="rounded-md p-1.5 text-muted-foreground/30 hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40"
                        >
                          <ArchiveRestore className="size-3.5" />
                        </button>
                      </td>
                    </tr>
                    {isExpanded && releases.length > 0 && (
                      <tr className="border-b bg-muted/10">
                        <td colSpan={7} className="px-4 py-2">
                          <ul className="space-y-1 pl-8">
                            {releases.map((r) => (
                              <li key={r.listId} className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span>{r.date}</span>
                                <span>·</span>
                                <span>{r.candidateCount} {candidatePlural(r.candidateCount)}</span>
                                {r.sent && <span className="ml-auto text-emerald-600">Отправлено</span>}
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
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
