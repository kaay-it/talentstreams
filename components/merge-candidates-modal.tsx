"use client"

import { useState } from "react"
import { createPortal } from "react-dom"
import { AlertCircle, X } from "lucide-react"
import { mergeCandidates, type MergeCandidatesInput } from "@/app/actions"
import type { Candidate } from "@/lib/db/candidates"

type ScalarField = "name" | "title" | "email" | "phone" | "level" | "countryPrimary" | "countryDesired" | "summary" | "coverLetter" | "activeSince"
type ArrayField = "stream" | "excludedCompanies" | "excludedStreams"
type FieldChoice = "survivor" | "other" | "union"

const SCALAR_FIELDS: { key: ScalarField; label: string }[] = [
  { key: "name", label: "Имя" },
  { key: "title", label: "Роль" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Телефон" },
  { key: "level", label: "Уровень" },
  { key: "countryPrimary", label: "Страна (текущая)" },
  { key: "countryDesired", label: "Страна (желаемая)" },
  { key: "activeSince", label: "Активен с" },
  { key: "summary", label: "Summary" },
  { key: "coverLetter", label: "Сопроводительное письмо" },
]

const ARRAY_FIELDS: { key: ArrayField; label: string }[] = [
  { key: "stream", label: "Стримы" },
  { key: "excludedCompanies", label: "Исключённые компании" },
  { key: "excludedStreams", label: "Исключённые стримы" },
]

function defaultFields(): MergeCandidatesInput["fields"] {
  return {
    name: "survivor", title: "survivor", email: "survivor", phone: "survivor",
    level: "survivor", countryPrimary: "survivor", countryDesired: "survivor",
    summary: "survivor", coverLetter: "survivor", activeSince: "survivor",
    stream: "survivor", excludedCompanies: "survivor", excludedStreams: "survivor",
  }
}

export function MergeCandidatesModal({
  candidateA,
  candidateB,
  onClose,
  onMerged,
}: {
  candidateA: Candidate
  candidateB: Candidate
  onClose: () => void
  onMerged: () => void
}) {
  const [survivorId, setSurvivorId] = useState(candidateA.id)
  const [fields, setFields] = useState(defaultFields())
  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle")
  const [errorMsg, setErrorMsg] = useState("")

  const survivor = survivorId === candidateA.id ? candidateA : candidateB
  const other = survivorId === candidateA.id ? candidateB : candidateA

  function setFieldChoice(key: ScalarField | ArrayField, choice: FieldChoice) {
    setFields((prev) => ({ ...prev, [key]: choice }))
  }

  async function handleSubmit() {
    if (!confirm("Объединить кандидатов? Это необратимо — профиль-неудачник будет удалён.")) return
    setStatus("submitting")
    setErrorMsg("")
    const result = await mergeCandidates({ survivorId, droppedId: other.id, fields })
    if (result.ok) {
      onMerged()
    } else {
      setStatus("error")
      setErrorMsg(result.error)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="merge-candidates-title"
          className="relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border bg-card shadow-xl"
        >
          <div className="flex shrink-0 items-center justify-between border-b px-6 py-4">
            <h2 id="merge-candidates-title" className="text-base font-semibold text-card-foreground">
              Объединение кандидатов
            </h2>
            <button onClick={onClose} className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" aria-label="Закрыть">
              <X className="size-4" />
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-card-foreground">Объединить в профиль:</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setSurvivorId(candidateA.id)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${survivorId === candidateA.id ? "border-primary bg-primary/5 font-medium text-primary" : "text-muted-foreground hover:bg-muted"}`}
                >
                  {candidateA.name}
                </button>
                <button
                  onClick={() => setSurvivorId(candidateB.id)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${survivorId === candidateB.id ? "border-primary bg-primary/5 font-medium text-primary" : "text-muted-foreground hover:bg-muted"}`}
                >
                  {candidateB.name}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Этот профиль останется (id сохранится), второй будет удалён — его резюме, подборки и запросы на контакт перейдут на оставшийся.
              </p>
            </div>

            <div className="divide-y overflow-hidden rounded-lg border">
              {SCALAR_FIELDS.map(({ key, label }) => {
                const survivorVal = survivor[key] || "—"
                const otherVal = other[key] || "—"
                if (survivorVal === otherVal) {
                  return (
                    <div key={key} className="flex items-center gap-3 px-4 py-2 text-sm opacity-60">
                      <span className="w-40 shrink-0 text-xs font-medium text-muted-foreground">{label}</span>
                      <span className="text-card-foreground">{survivorVal}</span>
                      <span className="text-xs text-muted-foreground">(совпадает)</span>
                    </div>
                  )
                }
                return (
                  <div key={key} className="flex items-start gap-3 px-4 py-2.5 text-sm">
                    <span className="w-40 shrink-0 pt-0.5 text-xs font-medium text-muted-foreground">{label}</span>
                    <div className="flex-1 space-y-1">
                      <label className="flex items-start gap-2">
                        <input type="radio" name={`field-${key}`} checked={fields[key] === "survivor"} onChange={() => setFieldChoice(key, "survivor")} className="mt-0.5 accent-primary" />
                        <span className="text-card-foreground">{survivorVal}</span>
                      </label>
                      <label className="flex items-start gap-2">
                        <input type="radio" name={`field-${key}`} checked={fields[key] === "other"} onChange={() => setFieldChoice(key, "other")} className="mt-0.5 accent-primary" />
                        <span className="text-card-foreground">{otherVal}</span>
                      </label>
                    </div>
                  </div>
                )
              })}

              {ARRAY_FIELDS.map(({ key, label }) => {
                const survivorVal = survivor[key]
                const otherVal = other[key]
                const union = [...new Set([...survivorVal, ...otherVal])]
                const same = survivorVal.length === otherVal.length && survivorVal.every((v) => otherVal.includes(v))
                if (same) {
                  return (
                    <div key={key} className="flex items-center gap-3 px-4 py-2 text-sm opacity-60">
                      <span className="w-40 shrink-0 text-xs font-medium text-muted-foreground">{label}</span>
                      <span className="text-card-foreground">{survivorVal.join(", ") || "—"}</span>
                      <span className="text-xs text-muted-foreground">(совпадает)</span>
                    </div>
                  )
                }
                return (
                  <div key={key} className="flex items-start gap-3 px-4 py-2.5 text-sm">
                    <span className="w-40 shrink-0 pt-0.5 text-xs font-medium text-muted-foreground">{label}</span>
                    <div className="flex-1 space-y-1">
                      <label className="flex items-start gap-2">
                        <input type="radio" name={`field-${key}`} checked={fields[key] === "survivor"} onChange={() => setFieldChoice(key, "survivor")} className="mt-0.5 accent-primary" />
                        <span className="text-card-foreground">{survivorVal.join(", ") || "—"}</span>
                      </label>
                      <label className="flex items-start gap-2">
                        <input type="radio" name={`field-${key}`} checked={fields[key] === "other"} onChange={() => setFieldChoice(key, "other")} className="mt-0.5 accent-primary" />
                        <span className="text-card-foreground">{otherVal.join(", ") || "—"}</span>
                      </label>
                      <label className="flex items-start gap-2">
                        <input type="radio" name={`field-${key}`} checked={fields[key] === "union"} onChange={() => setFieldChoice(key, "union")} className="mt-0.5 accent-primary" />
                        <span className="text-card-foreground">Объединить: {union.join(", ") || "—"}</span>
                      </label>
                    </div>
                  </div>
                )
              })}
            </div>

            {status === "error" && (
              <div className="flex items-start gap-2.5 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3">
                <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
                <p className="text-sm font-medium text-destructive">{errorMsg}</p>
              </div>
            )}
          </div>

          <div className="shrink-0 border-t px-6 py-4">
            <button
              onClick={handleSubmit}
              disabled={status === "submitting"}
              className="mx-auto block w-full max-w-md rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {status === "submitting" ? "Объединяем…" : "Объединить"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
