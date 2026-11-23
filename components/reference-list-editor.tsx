"use client"

import { useState, useTransition } from "react"
import { Pencil, Check, X, Trash2, Plus } from "lucide-react"

export type ReferenceListItem = { id: number; label: string; hint?: string }

/**
 * Shared simple reference-list editor (TASK-66) — used for both the industries list and the
 * company-size categories in /editor/settings. The two are nearly identical tables (label +
 * optional hint, inline edit/add/delete, no type/status/counts columns like streams-table.tsx
 * has), so one component covers both rather than duplicating ~150 lines twice.
 */
export function ReferenceListEditor({
  items,
  showHint,
  addAction,
  updateAction,
  deleteAction,
  addButtonLabel = "Добавить",
  labelPlaceholder = "Название",
  hintPlaceholder = "Подсказка",
}: {
  items: ReferenceListItem[]
  showHint: boolean
  addAction: (label: string, hint: string) => Promise<void>
  updateAction: (id: number, label: string, hint: string) => Promise<void>
  deleteAction: (id: number) => Promise<void>
  addButtonLabel?: string
  labelPlaceholder?: string
  hintPlaceholder?: string
}) {
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editData, setEditData] = useState<{ label: string; hint: string } | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [addData, setAddData] = useState({ label: "", hint: "" })
  const [isPending, startTransition] = useTransition()

  const startEdit = (item: ReferenceListItem) => {
    setShowAdd(false)
    setEditingId(item.id)
    setEditData({ label: item.label, hint: item.hint ?? "" })
  }

  const cancelEdit = () => { setEditingId(null); setEditData(null) }

  const saveEdit = (id: number) => {
    if (!editData?.label.trim()) return
    startTransition(async () => {
      await updateAction(id, editData.label, editData.hint)
      setEditingId(null)
      setEditData(null)
    })
  }

  const handleDelete = (id: number) => {
    startTransition(async () => { await deleteAction(id) })
  }

  const openAdd = () => { cancelEdit(); setShowAdd(true); setAddData({ label: "", hint: "" }) }

  const saveAdd = () => {
    if (!addData.label.trim()) return
    startTransition(async () => {
      await addAction(addData.label, addData.hint)
      setShowAdd(false)
      setAddData({ label: "", hint: "" })
    })
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Название</th>
              {showHint && <th className="px-4 py-3 text-left font-medium text-muted-foreground">Подсказка</th>}
              <th className="px-4 py-3 w-20" />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const isEditing = editingId === item.id
              return (
                <tr key={item.id} className={`border-b last:border-b-0 transition-colors ${isEditing ? "bg-muted/30" : "hover:bg-muted/20"} ${isPending && isEditing ? "opacity-60" : ""}`}>
                  {isEditing ? (
                    <>
                      <td className="px-4 py-2">
                        <input
                          autoFocus
                          value={editData?.label ?? ""}
                          onChange={(e) => setEditData((d) => d && { ...d, label: e.target.value })}
                          onKeyDown={(e) => { if (e.key === "Enter" && !showHint) saveEdit(item.id); if (e.key === "Escape") cancelEdit() }}
                          disabled={isPending}
                          className="w-full rounded-md border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                        />
                      </td>
                      {showHint && (
                        <td className="px-4 py-2">
                          <input
                            value={editData?.hint ?? ""}
                            onChange={(e) => setEditData((d) => d && { ...d, hint: e.target.value })}
                            onKeyDown={(e) => { if (e.key === "Enter") saveEdit(item.id); if (e.key === "Escape") cancelEdit() }}
                            disabled={isPending}
                            className="w-full rounded-md border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                          />
                        </td>
                      )}
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1">
                          <button onClick={() => saveEdit(item.id)} disabled={isPending || !editData?.label.trim()} title="Сохранить (Enter)" className="rounded-md p-1.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 disabled:opacity-40 transition-colors">
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
                      <td className="px-4 py-3.5 font-medium">{item.label}</td>
                      {showHint && <td className="px-4 py-3.5 text-muted-foreground">{item.hint || <span className="text-muted-foreground/40">—</span>}</td>}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1">
                          <button onClick={() => startEdit(item)} title="Редактировать" className="rounded-md p-1.5 text-muted-foreground/30 hover:text-muted-foreground hover:bg-muted transition-colors">
                            <Pencil className="size-3.5" />
                          </button>
                          <button onClick={() => handleDelete(item.id)} disabled={isPending} title="Удалить" className="rounded-md p-1.5 text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-40">
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
                <td className="px-4 py-2">
                  <input
                    autoFocus
                    placeholder={labelPlaceholder}
                    value={addData.label}
                    onChange={(e) => setAddData((d) => ({ ...d, label: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === "Enter" && !showHint) saveAdd(); if (e.key === "Escape") setShowAdd(false) }}
                    disabled={isPending}
                    className="w-full rounded-md border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                  />
                </td>
                {showHint && (
                  <td className="px-4 py-2">
                    <input
                      placeholder={hintPlaceholder}
                      value={addData.hint}
                      onChange={(e) => setAddData((d) => ({ ...d, hint: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === "Enter") saveAdd(); if (e.key === "Escape") setShowAdd(false) }}
                      disabled={isPending}
                      className="w-full rounded-md border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                    />
                  </td>
                )}
                <td className="px-4 py-2">
                  <div className="flex items-center gap-1">
                    <button onClick={saveAdd} disabled={isPending || !addData.label.trim()} title="Добавить (Enter)" className="rounded-md p-1.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 disabled:opacity-40 transition-colors">
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
          {addButtonLabel}
        </button>
      )}
    </div>
  )
}
