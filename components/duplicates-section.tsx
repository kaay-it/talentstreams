"use client"

import { useState } from "react"
import { AlertCircle, Download, Loader2, Merge, X } from "lucide-react"
import { findDuplicateCandidates, type DuplicatePair } from "@/app/actions"
import type { Candidate } from "@/lib/db/candidates"
import { MergeCandidatesModal } from "@/components/merge-candidates-modal"

function pairKey(p: DuplicatePair): string {
  return `${p.candidateAId}|${p.candidateBId}`
}

type ScanState =
  | { status: "idle" }
  | { status: "scanning" }
  | { status: "error"; message: string }
  | { status: "done"; pairs: DuplicatePair[]; candidatesById: Record<string, Candidate> }

export function DuplicatesSection() {
  const [scan, setScan] = useState<ScanState>({ status: "idle" })
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [mergingPair, setMergingPair] = useState<DuplicatePair | null>(null)

  async function handleScan() {
    setScan({ status: "scanning" })
    const result = await findDuplicateCandidates()
    setScan(result.ok ? { status: "done", pairs: result.pairs, candidatesById: result.candidatesById } : { status: "error", message: result.error })
  }

  function handleMerged(mergedPair: DuplicatePair) {
    setMergingPair(null)
    setScan((prev) => (prev.status === "done" ? { ...prev, pairs: prev.pairs.filter((p) => p !== mergedPair) } : prev))
  }

  const visiblePairs = scan.status === "done" ? scan.pairs.filter((p) => !dismissed.has(pairKey(p))) : []

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <button
          onClick={handleScan}
          disabled={scan.status === "scanning"}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {scan.status === "scanning" ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
          {scan.status === "scanning" ? "Ищем…" : "Найти дубли"}
        </button>
        {scan.status === "done" && (
          <span className="text-xs text-muted-foreground">Найдено пар: {visiblePairs.length}</span>
        )}
      </div>

      {scan.status === "error" && (
        <div className="flex items-start gap-2.5 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <p className="text-sm font-medium text-destructive">{scan.message}</p>
        </div>
      )}

      {scan.status === "done" && (
        visiblePairs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Дублей не найдено.</p>
        ) : (
          <div className="space-y-3">
            {visiblePairs.map((pair) => {
              const a = scan.candidatesById[pair.candidateAId]
              const b = scan.candidatesById[pair.candidateBId]
              if (!a || !b) return null
              return (
                <div key={pairKey(pair)} className="rounded-xl border bg-card p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-medium text-primary">{Math.round(pair.similarity * 100)}% совпадение</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setMergingPair(pair)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
                      >
                        <Merge className="size-3.5" />
                        Объединить
                      </button>
                      <button
                        onClick={() => setDismissed((prev) => new Set(prev).add(pairKey(pair)))}
                        className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
                      >
                        <X className="size-3.5" />
                        Не дубли
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-4">
                    {[a, b].map((c) => (
                      <div key={c.id} className="space-y-1">
                        <p className="text-sm font-medium text-card-foreground">{c.name}</p>
                        <p className="text-xs text-muted-foreground">{c.email || "—"} · {c.phone || "—"}</p>
                        {c.level && (
                          <span className="inline-flex items-center rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-medium text-teal-700 dark:bg-teal-900/20 dark:text-teal-400">
                            {c.level}
                          </span>
                        )}
                        {c.summary && <p className="line-clamp-2 text-xs text-muted-foreground">{c.summary}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )
      )}

      {mergingPair && scan.status === "done" && scan.candidatesById[mergingPair.candidateAId] && scan.candidatesById[mergingPair.candidateBId] && (
        <MergeCandidatesModal
          candidateA={scan.candidatesById[mergingPair.candidateAId]}
          candidateB={scan.candidatesById[mergingPair.candidateBId]}
          onClose={() => setMergingPair(null)}
          onMerged={() => handleMerged(mergingPair)}
        />
      )}
    </div>
  )
}
