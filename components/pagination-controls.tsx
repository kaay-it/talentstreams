"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number] | "all"

const SELECT_CLASS =
  "rounded-md border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"

/** Shared footer for paginated editor tables (candidates, employers, …): page-size picker
 * (including "Все") + prev/next. Page count/clamping is the caller's job — this is purely
 * presentational, so every list screen with its own filters can reuse it. */
export function PaginationControls({
  page,
  totalPages,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: {
  page: number
  totalPages: number
  pageSize: PageSize
  onPageChange: (page: number) => void
  onPageSizeChange: (size: PageSize) => void
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-2.5">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Показывать по:</span>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(e.target.value === "all" ? "all" : (Number(e.target.value) as PageSize))}
          className={SELECT_CLASS}
        >
          {PAGE_SIZE_OPTIONS.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
          <option value="all">Все</option>
        </select>
      </div>

      {pageSize !== "all" && totalPages > 1 && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="flex size-7 items-center justify-center rounded-lg border text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40"
            aria-label="Предыдущая страница"
          >
            <ChevronLeft className="size-3.5" />
          </button>
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            Страница {page} из {totalPages}
          </span>
          <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="flex size-7 items-center justify-center rounded-lg border text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40"
            aria-label="Следующая страница"
          >
            <ChevronRight className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}
