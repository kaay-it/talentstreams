"use client"

import { useState } from "react"
import { previewCandidatesImport, importCandidatesFromSheets, type ImportPreview, type ImportResult, type ImportRow, type ImportSkipped } from "@/app/actions"
import { FileSpreadsheet, Loader2, CheckCircle2, AlertCircle } from "lucide-react"

type State =
  | { phase: "idle" }
  | { phase: "checking" }
  | { phase: "preview"; toImport: ImportRow[]; skippedDuplicate: ImportSkipped[]; skippedInvalid: ImportSkipped[] }
  | { phase: "importing" }
  | { phase: "success"; imported: ImportRow[]; skippedDuplicate: ImportSkipped[]; skippedInvalid: ImportSkipped[] }
  | { phase: "error"; message: string }

function RowList({ title, count, rows }: { title: string; count: number; rows: (ImportRow | ImportSkipped)[] }) {
  if (count === 0) {
    return <p className="text-xs text-muted-foreground">{title}: 0</p>
  }
  return (
    <details className="rounded-lg border px-3 py-2">
      <summary className="cursor-pointer text-xs font-medium text-card-foreground">
        {title} ({count})
      </summary>
      <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-xs text-muted-foreground">
        {rows.map((r, i) => (
          <li key={i}>
            Строка {r.row}: {r.name}
            {"reason" in r && <span className="text-muted-foreground"> — {r.reason}</span>}
          </li>
        ))}
      </ul>
    </details>
  )
}

export function ImportCandidatesButton() {
  const [state, setState] = useState<State>({ phase: "idle" })

  async function handleCheck() {
    setState({ phase: "checking" })
    const result: ImportPreview = await previewCandidatesImport()
    if (!result.ok) {
      setState({ phase: "error", message: result.error })
      return
    }
    setState({ phase: "preview", toImport: result.toImport, skippedDuplicate: result.skippedDuplicate, skippedInvalid: result.skippedInvalid })
  }

  async function handleImport() {
    setState({ phase: "importing" })
    const result: ImportResult = await importCandidatesFromSheets()
    if (!result.ok) {
      setState({ phase: "error", message: result.error })
      return
    }
    setState({ phase: "success", imported: result.imported, skippedDuplicate: result.skippedDuplicate, skippedInvalid: result.skippedInvalid })
  }

  if (state.phase === "idle" || state.phase === "checking") {
    return (
      <button
        onClick={handleCheck}
        disabled={state.phase === "checking"}
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {state.phase === "checking" ? <Loader2 className="size-4 animate-spin" /> : <FileSpreadsheet className="size-4" />}
        {state.phase === "checking" ? "Проверяем…" : "Проверить таблицу"}
      </button>
    )
  }

  if (state.phase === "preview") {
    return (
      <div className="w-full space-y-3 rounded-xl border bg-card p-4">
        <RowList title="Готово к импорту" count={state.toImport.length} rows={state.toImport} />
        <RowList title="Пропущено как дубликат" count={state.skippedDuplicate.length} rows={state.skippedDuplicate} />
        <RowList title="Пропущено — невалидные" count={state.skippedInvalid.length} rows={state.skippedInvalid} />
        <div className="flex gap-2">
          {state.toImport.length > 0 && (
            <button
              onClick={handleImport}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              Импортировать {state.toImport.length}
            </button>
          )}
          <button
            onClick={() => setState({ phase: "idle" })}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted"
          >
            {state.toImport.length > 0 ? "Отмена" : "Закрыть"}
          </button>
        </div>
      </div>
    )
  }

  if (state.phase === "importing") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Импортируем…
      </span>
    )
  }

  if (state.phase === "success") {
    return (
      <div className="w-full space-y-3 rounded-xl border bg-card p-4">
        <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-600">
          <CheckCircle2 className="size-4" />
          Импорт завершён
        </p>
        <RowList title="Импортировано" count={state.imported.length} rows={state.imported} />
        <RowList title="Пропущено как дубликат" count={state.skippedDuplicate.length} rows={state.skippedDuplicate} />
        <RowList title="Пропущено — невалидные" count={state.skippedInvalid.length} rows={state.skippedInvalid} />
        <button
          onClick={() => setState({ phase: "idle" })}
          className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted"
        >
          Готово
        </button>
      </div>
    )
  }

  return (
    <div className="w-full space-y-3">
      <p className="flex items-center gap-1.5 text-sm text-destructive">
        <AlertCircle className="size-4" />
        {state.message}
      </p>
      <button
        onClick={() => setState({ phase: "idle" })}
        className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted"
      >
        Попробовать снова
      </button>
    </div>
  )
}
