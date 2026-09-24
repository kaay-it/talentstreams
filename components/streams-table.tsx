"use client"

import { Fragment, useState, useTransition } from "react"
import { Layers, Pencil, Check, X, Copy, CheckCheck, Trash2, Plus, Archive, ChevronDown, ChevronUp } from "lucide-react"
import { updateStream, createStream, deleteStream, archiveStream } from "@/app/actions"
import type { StreamRecord } from "@/lib/db/streams"
import type { MailingListSummary } from "@/lib/db/mailing-lists"

const STREAM_TYPES = ["Industry", "Functional"]

const TYPE_STYLE: Record<string, string> = {
  Industry:   "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  Functional: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
}

const EMPTY_FORM = { name: "", type: "Industry", description: "" }

type StreamMailingHistoryEntry = MailingListSummary & { sent: boolean }

export function StreamsTable({
  streams,
  candidateCounts = {},
  subscriberCounts = {},
  mailingHistoryByStreamId = {},
  hasSentReleases = {},
}: {
  streams: StreamRecord[]
  candidateCounts?: Record<number, number>
  subscriberCounts?: Record<number, number>
  mailingHistoryByStreamId?: Record<number, StreamMailingHistoryEntry[]>
  hasSentReleases?: Record<number, boolean>
}) {
  const [editingId, setEditingId]   = useState<number | null>(null)
  const [editData, setEditData]     = useState<typeof EMPTY_FORM | null>(null)
  const [showAdd, setShowAdd]       = useState(false)
  const [addData, setAddData]       = useState(EMPTY_FORM)
  const [copied, setCopied]         = useState<string | null>(null)
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set())
  const [isPending, startTransition] = useTransition()

  const startEdit = (s: StreamRecord) => {
    setShowAdd(false)
    setEditingId(s.id)
    setEditData({ name: s.name, type: s.type, description: s.description })
  }

  const cancelEdit = () => { setEditingId(null); setEditData(null) }

  const saveEdit = (id: number) => {
    if (!editData?.name.trim()) return
    startTransition(async () => {
      await updateStream(id, editData)
      setEditingId(null)
      setEditData(null)
    })
  }

  const handleDelete = (id: number) => {
    startTransition(async () => { await deleteStream(id) })
  }

  const handleArchive = (id: number) => {
    startTransition(async () => { await archiveStream(id) })
  }

  const toggleExpanded = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const openAdd = () => { cancelEdit(); setShowAdd(true); setAddData(EMPTY_FORM) }

  const saveAdd = () => {
    if (!addData.name.trim()) return
    startTransition(async () => {
      await createStream(addData)
      setShowAdd(false)
      setAddData(EMPTY_FORM)
    })
  }

  const copyName = (name: string, key: string) => {
    navigator.clipboard.writeText(name).then(() => {
      setCopied(key)
      setTimeout(() => setCopied(null), 1500)
    })
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground w-8">ID</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Название</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground w-36">Тип</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground w-28" title="Активные кандидаты, чей тег совпадает с названием стрима (TASK-27)">Кандидаты</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground w-28" title="Подтверждённые работодатели, подписанные на этот стрим">Подписчики</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Описание</th>
              <th className="px-4 py-3 w-24" />
            </tr>
          </thead>
          <tbody>
            {streams.map((stream) => {
              const isEditing = editingId === stream.id
              const releases = mailingHistoryByStreamId[stream.id] ?? []
              const locked = hasSentReleases[stream.id] ?? false
              const isExpanded = expandedIds.has(stream.id)
              return (
                <Fragment key={stream.id}>
                  <tr
                    className={`border-b last:border-b-0 transition-colors ${isEditing ? "bg-muted/30" : "hover:bg-muted/20"} ${isPending && isEditing ? "opacity-60" : ""}`}
                  >
                    {isEditing ? (
                      <>
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{stream.id}</td>
                        <td className="px-4 py-2">
                          <input
                            autoFocus
                            value={editData?.name ?? ""}
                            onChange={(e) => setEditData((d) => d && { ...d, name: e.target.value })}
                            onKeyDown={(e) => { if (e.key === "Enter") saveEdit(stream.id); if (e.key === "Escape") cancelEdit() }}
                            disabled={isPending || locked}
                            title={locked ? "У стрима уже есть отправленные рассылки — переименование недоступно, можно только архивировать" : undefined}
                            className="w-full rounded-md border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <select
                            value={editData?.type ?? ""}
                            onChange={(e) => setEditData((d) => d && { ...d, type: e.target.value })}
                            disabled={isPending}
                            className="w-full rounded-md border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                          >
                            {STREAM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </td>
                        <td className="px-4 py-3.5 text-muted-foreground">
                          {candidateCounts[stream.id] ?? 0}
                        </td>
                        <td className="px-4 py-3.5 text-muted-foreground">
                          {subscriberCounts[stream.id] ?? 0}
                        </td>
                        <td className="px-4 py-2">
                          <input
                            value={editData?.description ?? ""}
                            onChange={(e) => setEditData((d) => d && { ...d, description: e.target.value })}
                            onKeyDown={(e) => { if (e.key === "Enter") saveEdit(stream.id); if (e.key === "Escape") cancelEdit() }}
                            disabled={isPending}
                            className="w-full rounded-md border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-1">
                            <button onClick={() => saveEdit(stream.id)} disabled={isPending || !editData?.name.trim()} title="Сохранить (Enter)" className="rounded-md p-1.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 disabled:opacity-40 transition-colors">
                              <Check className="size-4" />
                            </button>
                            <button onClick={cancelEdit} disabled={isPending} title="Отмена (Esc)" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted transition-colors">
                              <X className="size-4" />
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3.5 font-mono text-xs text-muted-foreground">{stream.id}</td>
                        <td className="px-4 py-3.5 font-medium">
                          <div className="flex items-center gap-2">
                            <Layers className="size-3.5 text-primary shrink-0" />
                            <span>{stream.name}</span>
                            <button onClick={() => copyName(stream.name, `name-${stream.id}`)} title="Скопировать название" className="rounded p-0.5 text-muted-foreground/30 hover:text-muted-foreground transition-colors">
                              {copied === `name-${stream.id}` ? <CheckCheck className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
                            </button>
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
                            <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${TYPE_STYLE[stream.type] ?? "bg-muted text-muted-foreground"}`}>
                              {stream.type}
                            </span>
                          ) : <span className="text-muted-foreground/40">—</span>}
                        </td>
                        <td className="px-4 py-3.5">
                          {candidateCounts[stream.id] ? (
                            <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                              {candidateCounts[stream.id]}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/40">0</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          {subscriberCounts[stream.id] ? (
                            <span className="inline-flex items-center rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-medium text-sky-700 dark:bg-sky-900/30 dark:text-sky-400">
                              {subscriberCounts[stream.id]}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/40">0</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-muted-foreground">
                          {stream.description || <span className="text-muted-foreground/40">—</span>}
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-1">
                            <button onClick={() => startEdit(stream)} title="Редактировать" className="rounded-md p-1.5 text-muted-foreground/30 hover:text-muted-foreground hover:bg-muted transition-colors">
                              <Pencil className="size-3.5" />
                            </button>
                            <button onClick={() => handleArchive(stream.id)} disabled={isPending} title="Архивировать" className="rounded-md p-1.5 text-muted-foreground/30 hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40">
                              <Archive className="size-3.5" />
                            </button>
                            {!locked && (
                              <button onClick={() => handleDelete(stream.id)} disabled={isPending} title="Удалить" className="rounded-md p-1.5 text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-40">
                                <Trash2 className="size-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </>
                    )}
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
                              {r.sent && (
                                <span className="ml-auto text-emerald-600">Отправлено</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}

            {showAdd && (
              <tr className="border-t bg-muted/20">
                <td className="px-4 py-2 font-mono text-xs text-muted-foreground/40">new</td>
                <td className="px-4 py-2">
                  <input
                    autoFocus
                    placeholder="Название"
                    value={addData.name}
                    onChange={(e) => setAddData((d) => ({ ...d, name: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === "Enter") saveAdd(); if (e.key === "Escape") setShowAdd(false) }}
                    disabled={isPending}
                    className="w-full rounded-md border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                  />
                </td>
                <td className="px-4 py-2">
                  <select
                    value={addData.type}
                    onChange={(e) => setAddData((d) => ({ ...d, type: e.target.value }))}
                    disabled={isPending}
                    className="w-full rounded-md border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                  >
                    {STREAM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </td>
                <td className="px-4 py-3.5 text-muted-foreground/40">—</td>
                <td className="px-4 py-3.5 text-muted-foreground/40">—</td>
                <td className="px-4 py-2">
                  <input
                    placeholder="Описание"
                    value={addData.description}
                    onChange={(e) => setAddData((d) => ({ ...d, description: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === "Enter") saveAdd(); if (e.key === "Escape") setShowAdd(false) }}
                    disabled={isPending}
                    className="w-full rounded-md border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                  />
                </td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-1">
                    <button onClick={saveAdd} disabled={isPending || !addData.name.trim()} title="Добавить (Enter)" className="rounded-md p-1.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 disabled:opacity-40 transition-colors">
                      <Check className="size-4" />
                    </button>
                    <button onClick={() => setShowAdd(false)} disabled={isPending} title="Отмена (Esc)" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted transition-colors">
                      <X className="size-4" />
                    </button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {!showAdd && (
        <button
          onClick={openAdd}
          className="flex items-center gap-2 rounded-lg border border-dashed px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors w-full justify-center"
        >
          <Plus className="size-4" />
          Добавить стрим
        </button>
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
