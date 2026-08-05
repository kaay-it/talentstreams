"use client"

import { useState, useTransition } from "react"
import { Layers, Pencil, Check, X, Copy, CheckCheck, Trash2, Plus } from "lucide-react"
import { updateStream, createStream, deleteStream } from "@/app/actions"
import type { StreamRecord } from "@/lib/db/streams"

const STREAM_TYPES = ["Industry", "Functional"]

const TYPE_STYLE: Record<string, string> = {
  Industry:   "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  Functional: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
}

const EMPTY_FORM = { name: "", type: "Industry", description: "" }

export function StreamsTable({ streams }: { streams: StreamRecord[] }) {
  const [editingId, setEditingId]   = useState<number | null>(null)
  const [editData, setEditData]     = useState<typeof EMPTY_FORM | null>(null)
  const [showAdd, setShowAdd]       = useState(false)
  const [addData, setAddData]       = useState(EMPTY_FORM)
  const [copied, setCopied]         = useState<string | null>(null)
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
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Описание</th>
              <th className="px-4 py-3 w-20" />
            </tr>
          </thead>
          <tbody>
            {streams.map((stream) => {
              const isEditing = editingId === stream.id
              return (
                <tr
                  key={stream.id}
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
                          disabled={isPending}
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
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        {stream.type ? (
                          <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${TYPE_STYLE[stream.type] ?? "bg-muted text-muted-foreground"}`}>
                            {stream.type}
                          </span>
                        ) : <span className="text-muted-foreground/40">—</span>}
                      </td>
                      <td className="px-4 py-3.5 text-muted-foreground">
                        {stream.description || <span className="text-muted-foreground/40">—</span>}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1">
                          <button onClick={() => startEdit(stream)} title="Редактировать" className="rounded-md p-1.5 text-muted-foreground/30 hover:text-muted-foreground hover:bg-muted transition-colors">
                            <Pencil className="size-3.5" />
                          </button>
                          <button onClick={() => handleDelete(stream.id)} disabled={isPending} title="Удалить" className="rounded-md p-1.5 text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-40">
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
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
