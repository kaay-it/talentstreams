"use client"

import { useState, useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { X, Check, Paperclip, Loader2 } from "lucide-react"
import { updateCandidate } from "@/app/actions"
import { ADDITIONAL_COUNTRIES } from "@/components/employer-registration-modal"
import type { Candidate } from "@/lib/sheets"

const inputCls =
  "w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"

/** activeSince is stored as ru-RU locale text ("21.07.2026") to match approveCandidate(); <input type="date"> needs ISO. */
function toISODate(ruDate: string): string {
  const m = ruDate.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (!m) return ""
  const [, d, mo, y] = m
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`
}
function toRuDate(isoDate: string): string {
  const m = isoDate.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return ""
  const [, y, mo, d] = m
  return `${d}.${mo}.${y}`
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-card-foreground">
        {label}
        {required && <span className="ml-1 text-primary">*</span>}
      </label>
      {children}
    </div>
  )
}

export function CandidateEditModal({
  candidate,
  streams,
  onClose,
}: {
  candidate: Candidate
  streams: string[]
  onClose: () => void
}) {
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle")
  const [errorMsg, setErrorMsg] = useState("")

  const [name, setName] = useState(candidate.name)
  const [email, setEmail] = useState(candidate.email)
  const [phone, setPhone] = useState(candidate.phone)
  const [resumeMode, setResumeMode] = useState<"file" | "url">(
    candidate.resumeUrl ? "url" : "file",
  )
  const [resumeFile, setResumeFile] = useState<File | null>(null)
  const [resumeUrl, setResumeUrl] = useState(candidate.resumeUrl)
  const [coverLetter, setCoverLetter] = useState(candidate.coverLetter)
  const [level, setLevel] = useState(candidate.level)
  const [selectedStreams, setSelectedStreams] = useState<string[]>(candidate.stream)
  const [countryPrimary, setCountryPrimary] = useState(candidate.countryPrimary)
  const [countryDesired, setCountryDesired] = useState(candidate.countryDesired)
  const [activeSince, setActiveSince] = useState(toISODate(candidate.activeSince))

  function toggleStream(s: string) {
    setSelectedStreams((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))
  }

  const fileInputRef = useRef<HTMLInputElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    document.body.style.overflow = "hidden"
    nameRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = ""
      document.removeEventListener("keydown", onKey)
    }
  }, [onClose])

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setResumeFile(e.target.files?.[0] ?? null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus("submitting")
    setErrorMsg("")
    try {
      let finalUrl = resumeUrl
      if (resumeMode === "file" && resumeFile) {
        const fd = new FormData()
        fd.append("file", resumeFile)
        const res = await fetch("/api/upload", { method: "POST", body: fd })
        const json = await res.json() as { url?: string; error?: string }
        if (!res.ok || !json.url) throw new Error(json.error ?? "Ошибка загрузки файла")
        finalUrl = json.url
      }
      await updateCandidate(candidate.rowIndex, {
        name,
        email,
        phone,
        resumeUrl: finalUrl,
        coverLetter,
        stream: selectedStreams,
        level,
        countryPrimary,
        countryDesired,
        activeSince: toRuDate(activeSince),
      })
      setStatus("success")
    } catch (err) {
      setStatus("error")
      setErrorMsg(err instanceof Error ? err.message : "Не удалось сохранить изменения")
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-candidate-title"
          className="relative w-full max-w-lg rounded-2xl border bg-card shadow-xl"
        >
          <div className="flex items-center justify-between border-b px-6 py-4">
            <h2 id="edit-candidate-title" className="text-base font-semibold text-card-foreground">
              Редактировать кандидата
            </h2>
            <button
              onClick={onClose}
              className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Закрыть"
            >
              <X className="size-4" />
            </button>
          </div>

          {status === "success" ? (
            <div className="flex flex-col items-center px-6 py-12 text-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Check className="size-6" />
              </span>
              <h3 className="mt-4 text-lg font-semibold text-card-foreground">Сохранено</h3>
              <p className="mt-2 text-sm text-muted-foreground">Данные кандидата обновлены.</p>
              <button
                onClick={onClose}
                className="mt-6 rounded-lg bg-primary px-6 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                Закрыть
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5 px-6 py-5">
              <Field label="Имя" required>
                <input
                  ref={nameRef}
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Иван Иванов"
                  className={inputCls}
                />
              </Field>

              <Field label="Email" required>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className={inputCls}
                />
              </Field>

              <Field label="Телефон">
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+_ ___ ___ ____"
                  className={inputCls}
                />
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Уровень">
                  <input
                    type="text"
                    value={level}
                    onChange={(e) => setLevel(e.target.value)}
                    placeholder="Junior / Middle / Senior"
                    className={inputCls}
                  />
                </Field>
                <Field label="Активен с">
                  <input
                    type="date"
                    value={activeSince}
                    onChange={(e) => setActiveSince(e.target.value)}
                    className={inputCls}
                  />
                </Field>
              </div>

              <Field label="Стримы">
                {streams.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {streams.map((s) => {
                      const selected = selectedStreams.includes(s)
                      return (
                        <button
                          key={s}
                          type="button"
                          onClick={() => toggleStream(s)}
                          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                            selected
                              ? "border-primary bg-primary/10 text-primary"
                              : "text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground"
                          }`}
                        >
                          {s}
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Стримы не настроены</p>
                )}
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Страна (текущая)">
                  <select value={countryPrimary} onChange={(e) => setCountryPrimary(e.target.value)} className={inputCls}>
                    <option value="">— не указано —</option>
                    {ADDITIONAL_COUNTRIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Страна (желаемая)">
                  <select value={countryDesired} onChange={(e) => setCountryDesired(e.target.value)} className={inputCls}>
                    <option value="">— не указано —</option>
                    {ADDITIONAL_COUNTRIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </Field>
              </div>

              <Field label="Резюме">
                <div className="space-y-2">
                  <div className="flex rounded-lg border p-0.5 text-sm">
                    <button
                      type="button"
                      onClick={() => { setResumeMode("file"); setResumeUrl("") }}
                      className={`flex-1 rounded-md py-1.5 text-center transition-colors ${resumeMode === "file" ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      Загрузить файл
                    </button>
                    <button
                      type="button"
                      onClick={() => { setResumeMode("url"); setResumeFile(null); if (fileInputRef.current) fileInputRef.current.value = "" }}
                      className={`flex-1 rounded-md py-1.5 text-center transition-colors ${resumeMode === "url" ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      Указать ссылку
                    </button>
                  </div>

                  {resumeMode === "file" ? (
                    <label className={`flex cursor-pointer items-center gap-2.5 rounded-lg border bg-background px-3 py-2 text-sm transition-colors hover:bg-muted ${status === "submitting" ? "pointer-events-none opacity-60" : ""}`}>
                      {status === "submitting" && resumeFile ? (
                        <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
                      ) : (
                        <Paperclip className="size-4 shrink-0 text-muted-foreground" />
                      )}
                      <span className={`min-w-0 truncate ${resumeFile ? "text-foreground" : "text-muted-foreground"}`}>
                        {resumeFile ? resumeFile.name : "PDF, DOC, DOCX, RTF, ODT · до 5 МБ"}
                      </span>
                      {resumeFile && status !== "submitting" && (
                        <Check className="ml-auto size-4 shrink-0 text-emerald-500" />
                      )}
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,.doc,.docx,.rtf,.odt"
                        onChange={handleFileChange}
                        className="sr-only"
                      />
                    </label>
                  ) : (
                    <input
                      type="url"
                      value={resumeUrl}
                      onChange={(e) => setResumeUrl(e.target.value)}
                      placeholder="https://..."
                      className={inputCls}
                    />
                  )}
                </div>
              </Field>

              <Field label="Сопроводительное письмо">
                <textarea
                  value={coverLetter}
                  onChange={(e) => setCoverLetter(e.target.value)}
                  placeholder="О себе, опыте и навыках..."
                  rows={4}
                  className={`${inputCls} resize-none`}
                />
              </Field>

              {status === "error" && (
                <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {errorMsg}
                </p>
              )}

              <button
                type="submit"
                disabled={status === "submitting"}
                className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {status === "submitting" ? "Сохранение…" : "Сохранить"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
