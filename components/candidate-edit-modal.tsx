"use client"

import { useState, useEffect, useRef, useTransition } from "react"
import { createPortal } from "react-dom"
import { X, Check, Paperclip, Loader2, FileText, Link as LinkIcon, Plus, Trash2, CheckCircle2, OctagonX } from "lucide-react"
import { updateCandidate, getCandidateResumeHistory, deleteCandidateResumeVersion, getCandidateMailingHistory, searchCompanies, type ResumeVersion, type CandidateMailingHistoryEntry } from "@/app/actions"
import { ADDITIONAL_COUNTRIES } from "@/components/employer-registration-modal"
import { withDownloadFilename } from "@/lib/blob"
import type { Candidate } from "@/lib/db/candidates"

const inputCls =
  "w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"

// Must match SEARCH_MIN_LENGTH in lib/db/companies.ts — searchCompanies() ignores shorter queries anyway.
const SEARCH_MIN_LENGTH = 3

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

function ResumeVersionRow({
  version,
  candidateId,
  isCurrent,
  onDeleted,
}: {
  version: ResumeVersion
  candidateId: string
  isCurrent: boolean
  onDeleted: (id: string) => void
}) {
  const [isPending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState(false)

  function handleDelete() {
    startTransition(async () => {
      await deleteCandidateResumeVersion(candidateId, version.id)
      onDeleted(version.id)
    })
  }

  return (
    <li className="flex items-center gap-2 px-3 py-1.5 text-xs">
      {version.kind === "file" ? (
        <FileText className="size-3.5 shrink-0 text-muted-foreground" />
      ) : (
        <LinkIcon className="size-3.5 shrink-0 text-muted-foreground" />
      )}
      <span
        title={version.kind === "file" ? version.filename || "Файл" : version.url}
        className="min-w-0 flex-1 truncate text-foreground"
      >
        {version.kind === "file" ? version.filename || "Файл" : version.url}
      </span>
      <span className="shrink-0 text-muted-foreground">
        {new Date(version.createdAt).toLocaleDateString("ru-RU")}
      </span>

      {confirming ? (
        <span className="flex shrink-0 items-center gap-1.5">
          <span className="font-medium text-destructive">Удалить?</span>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isPending}
            className="font-medium text-destructive hover:underline disabled:opacity-50"
          >
            Да
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={isPending}
            className="text-muted-foreground hover:underline disabled:opacity-50"
          >
            Отмена
          </button>
        </span>
      ) : (
        <>
          <a
            href={version.kind === "file" ? withDownloadFilename(version.url, version.filename) : version.url}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 font-medium text-primary hover:underline"
          >
            Открыть
          </a>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={isCurrent}
            title={isCurrent ? "Это текущее резюме — сначала загрузите новую версию" : "Удалить"}
            className="flex shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:text-destructive disabled:cursor-not-allowed disabled:opacity-30"
          >
            <Trash2 className="size-3.5" />
          </button>
        </>
      )}
    </li>
  )
}

function ResumeVersionList({
  items,
  candidateId,
  currentResumeUrl,
  onDeleted,
}: {
  items: ResumeVersion[]
  candidateId: string
  currentResumeUrl: string
  onDeleted: (id: string) => void
}) {
  return (
    <ul className="divide-y rounded-lg border">
      {items.map((v) => (
        <ResumeVersionRow
          key={v.id}
          version={v}
          candidateId={candidateId}
          isCurrent={v.url === currentResumeUrl}
          onDeleted={onDeleted}
        />
      ))}
    </ul>
  )
}

/** Free-text multi-value chip input (company/industry names — not a fixed list like streams or
 * countries). Type a value, Enter or comma commits it as a chip; Backspace on an empty draft
 * removes the last chip; blur also commits whatever's left typed, so nothing is silently lost. */
/** Free-text multi-value chip input — optionally backed by a suggestions dropdown (onSearch,
 * debounced, SEARCH_MIN_LENGTH floor — same convention as CompanyAutocompleteInput). Picking a
 * suggestion or typing a brand-new value and pressing Enter/comma are both valid; a suggestion
 * click uses onMouseDown+preventDefault so it registers before the input's onBlur-commit fires. */
function TagsInput({
  values,
  onChange,
  placeholder,
  onSearch,
}: {
  values: string[]
  onChange: (values: string[]) => void
  placeholder?: string
  onSearch?: (query: string) => Promise<string[]>
}) {
  const [draft, setDraft] = useState("")
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!onSearch) return
    const query = draft.trim()
    if (query.length < SEARCH_MIN_LENGTH) {
      setSuggestions([])
      return
    }
    let active = true
    const timer = setTimeout(() => {
      onSearch(query).then((rows) => {
        if (active) setSuggestions(rows.filter((r) => !values.includes(r)))
      })
    }, 200)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [draft, onSearch, values])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onClickOutside)
    return () => document.removeEventListener("mousedown", onClickOutside)
  }, [])

  function commitValue(v: string) {
    const trimmed = v.trim()
    if (trimmed && !values.includes(trimmed)) onChange([...values, trimmed])
    setDraft("")
    setSuggestions([])
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault()
      commitValue(draft)
    } else if (e.key === "Backspace" && !draft && values.length) {
      onChange(values.slice(0, -1))
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border bg-background px-2 py-1.5 focus-within:ring-2 focus-within:ring-primary/30">
        {values.map((v, i) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-foreground">
            {v}
            <button
              type="button"
              onClick={() => onChange(values.filter((_, idx) => idx !== i))}
              className="text-muted-foreground transition-colors hover:text-destructive"
              aria-label={`Удалить «${v}»`}
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          type="text"
          value={draft}
          onChange={(e) => { setDraft(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          onBlur={() => commitValue(draft)}
          placeholder={values.length ? undefined : placeholder}
          autoComplete="off"
          className="min-w-[8rem] flex-1 border-0 bg-transparent p-1 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
      </div>
      {open && suggestions.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border bg-card py-1 shadow-lg">
          {suggestions.map((s) => (
            <li key={s}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); commitValue(s) }}
                className="block w-full px-3 py-1.5 text-left text-sm text-card-foreground hover:bg-muted"
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Field({
  label,
  required,
  full,
  danger,
  children,
}: {
  label: string
  required?: boolean
  full?: boolean
  danger?: boolean
  children: React.ReactNode
}) {
  return (
    <div className={`space-y-1.5 ${full ? "col-span-2" : ""} ${danger ? "rounded-lg border border-destructive/40 bg-destructive/5 p-3" : ""}`}>
      <label className={`flex items-center gap-1.5 text-sm font-medium ${danger ? "text-destructive" : "text-card-foreground"}`}>
        {danger && <OctagonX className="size-4 shrink-0" />}
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
  const [title, setTitle] = useState(candidate.title)
  const [email, setEmail] = useState(candidate.email)
  const [phone, setPhone] = useState(candidate.phone)

  // "none" = keep the current resume as-is; "file"/"link" = adding a new version to replace it.
  const [resumeAction, setResumeAction] = useState<"none" | "file" | "link">("none")
  const [resumeFile, setResumeFile] = useState<File | null>(null)
  const [newResumeUrl, setNewResumeUrl] = useState("")

  const [coverLetter, setCoverLetter] = useState(candidate.coverLetter)
  const [level, setLevel] = useState(candidate.level)
  const [selectedStreams, setSelectedStreams] = useState<string[]>(candidate.stream)
  const [countryPrimary, setCountryPrimary] = useState(candidate.countryPrimary)
  const [countryDesired, setCountryDesired] = useState(candidate.countryDesired)
  const [activeSince, setActiveSince] = useState(toISODate(candidate.activeSince))
  const [summary, setSummary] = useState(candidate.summary)
  const [excludedCompanies, setExcludedCompanies] = useState<string[]>(candidate.excludedCompanies)
  const [excludedStreams, setExcludedStreams] = useState<string[]>(candidate.excludedStreams)

  const [resumeHistory, setResumeHistory] = useState<ResumeVersion[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const resumeFiles = resumeHistory.filter((v) => v.kind === "file")
  const resumeLinks = resumeHistory.filter((v) => v.kind === "link")
  // candidates has no resumeUrl column — candidateResumes (newest first) is the only source of
  // truth, so the current resume is simply its first entry.
  const currentResumeUrl = resumeHistory[0]?.url ?? ""

  useEffect(() => {
    if (!candidate.id) return
    setHistoryLoading(true)
    getCandidateResumeHistory(candidate.id)
      .then(setResumeHistory)
      .catch(() => setResumeHistory([]))
      .finally(() => setHistoryLoading(false))
  }, [candidate.id])

  const [mailingHistory, setMailingHistory] = useState<CandidateMailingHistoryEntry[]>([])
  const [mailingHistoryLoading, setMailingHistoryLoading] = useState(false)

  useEffect(() => {
    if (!candidate.id) return
    setMailingHistoryLoading(true)
    getCandidateMailingHistory(candidate.id)
      .then(setMailingHistory)
      .catch(() => setMailingHistory([]))
      .finally(() => setMailingHistoryLoading(false))
  }, [candidate.id])

  function toggleStream(s: string) {
    setSelectedStreams((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))
  }

  function handleResumeVersionDeleted(id: string) {
    setResumeHistory((prev) => prev.filter((v) => v.id !== id))
  }

  function cancelResumeAction() {
    setResumeAction("none")
    setResumeFile(null)
    setNewResumeUrl("")
    if (fileInputRef.current) fileInputRef.current.value = ""
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
      let finalUrl = currentResumeUrl
      let uploadedFilename: string | undefined

      if (resumeAction === "file" && resumeFile) {
        const fd = new FormData()
        fd.append("file", resumeFile)
        const res = await fetch("/api/upload", { method: "POST", body: fd })
        const json = await res.json() as { url?: string; error?: string }
        if (!res.ok || !json.url) throw new Error(json.error ?? "Ошибка загрузки файла")
        finalUrl = json.url
        uploadedFilename = resumeFile.name
      } else if (resumeAction === "link" && newResumeUrl.trim()) {
        finalUrl = newResumeUrl.trim()
      }

      const resumeVersionChanged = Boolean(finalUrl && finalUrl !== currentResumeUrl)
      const result = await updateCandidate(candidate.id, {
        candidateId: candidate.id,
        name,
        email,
        phone,
        resumeUrl: finalUrl,
        resumeVersionChanged,
        resumeFilename: uploadedFilename,
        coverLetter,
        stream: selectedStreams,
        level,
        countryPrimary,
        countryDesired,
        activeSince: toRuDate(activeSince),
        title,
        summary,
        excludedCompanies,
        excludedStreams,
      })
      if (result.ok) {
        setStatus("success")
      } else {
        setStatus("error")
        setErrorMsg(result.error)
      }
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
          className="relative w-full max-w-2xl rounded-2xl border bg-card shadow-xl"
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
            <form onSubmit={handleSubmit} className="max-h-[75vh] overflow-y-auto px-6 py-5">
              <div className="grid grid-cols-2 gap-x-4 gap-y-5">
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

                <Field label="Роль">
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Product Manager"
                    className={inputCls}
                  />
                </Field>

                <Field label="Email">
                  <input
                    type="email"
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
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={activeSince}
                      onChange={(e) => setActiveSince(e.target.value)}
                      className={inputCls}
                    />
                    {activeSince && (
                      <button
                        type="button"
                        onClick={() => setActiveSince("")}
                        title="Очистить дату — кандидат не будет ограничен по дате"
                        className="shrink-0 rounded-lg border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
                      >
                        Очистить
                      </button>
                    )}
                  </div>
                </Field>

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

                <Field label="Стримы" full>
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

                <Field label="Исключённые компании" full danger>
                  <TagsInput
                    values={excludedCompanies}
                    onChange={setExcludedCompanies}
                    placeholder="Например: ООО Пример — Enter чтобы добавить"
                    onSearch={async (query) => (await searchCompanies(query)).map((c) => c.name)}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Кандидат не попадёт в подборку работодателю, у которого «Компания» совпадает посимвольно — сверяйтесь с разделом «Компании».
                  </p>
                </Field>

                <Field label="Исключённые стримы" full danger>
                  <TagsInput
                    values={excludedStreams}
                    onChange={setExcludedStreams}
                    placeholder="Точное название стрима — Enter чтобы добавить"
                    onSearch={async (query) => streams.filter((s) => s.toLowerCase().includes(query.toLowerCase()))}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Сверяется со стримами работодателя — выберите из подсказки или впишите точное название.
                  </p>
                </Field>

                {candidate.id && (
                  <Field label="История рассылок" full>
                    {mailingHistoryLoading ? (
                      <p className="text-xs text-muted-foreground">Загрузка истории рассылок…</p>
                    ) : mailingHistory.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        Кандидат ещё не попадал ни в один выпуск.
                      </p>
                    ) : (
                      <ul className="divide-y rounded-lg border">
                        {mailingHistory.map((entry) => (
                          <li key={entry.listId} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                            <span className="shrink-0 text-muted-foreground">{entry.date}</span>
                            <span className="min-w-0 flex-1 truncate text-foreground">{entry.stream}</span>
                            {entry.sent ? (
                              <span className="inline-flex shrink-0 items-center gap-1 text-emerald-600">
                                <CheckCircle2 className="size-3.5" />
                                Отправлено
                              </span>
                            ) : (
                              <span className="shrink-0 text-muted-foreground">Не отправлено</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </Field>
                )}

                <Field label="Summary" full>
                  <textarea
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    placeholder="Анонимное описание кандидата — это единственное, что увидит работодатель на карточке подборки, кроме роли, уровня и страны."
                    rows={3}
                    className={`${inputCls} resize-none`}
                  />
                </Field>

                <Field label="Резюме" full>
                  <div className="space-y-3">
                    {resumeAction === "none" && (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setResumeAction("file")}
                          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                        >
                          <Plus className="size-3.5" />
                          Добавить файл
                        </button>
                        <button
                          type="button"
                          onClick={() => setResumeAction("link")}
                          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                        >
                          <Plus className="size-3.5" />
                          Добавить ссылку
                        </button>
                      </div>
                    )}

                    {resumeAction === "file" && (
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <label className={`flex flex-1 cursor-pointer items-center gap-2.5 rounded-lg border bg-background px-3 py-2 text-sm transition-colors hover:bg-muted ${status === "submitting" ? "pointer-events-none opacity-60" : ""}`}>
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
                          <button
                            type="button"
                            onClick={cancelResumeAction}
                            className="shrink-0 rounded-lg border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
                          >
                            Отмена
                          </button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Старое резюме не удаляется — остаётся в истории версий ниже.
                        </p>
                      </div>
                    )}

                    {resumeAction === "link" && (
                      <div className="flex items-center gap-2">
                        <input
                          type="url"
                          autoFocus
                          value={newResumeUrl}
                          onChange={(e) => setNewResumeUrl(e.target.value)}
                          placeholder="https://..."
                          className={inputCls}
                        />
                        <button
                          type="button"
                          onClick={cancelResumeAction}
                          className="shrink-0 rounded-lg border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
                        >
                          Отмена
                        </button>
                      </div>
                    )}

                    {candidate.id && (
                      <div className="space-y-3 pt-1">
                        {historyLoading ? (
                          <p className="text-xs text-muted-foreground">Загрузка истории резюме…</p>
                        ) : resumeHistory.length === 0 ? (
                          <p className="text-xs text-muted-foreground">
                            История резюме появится здесь после следующей загрузки нового файла или ссылки.
                          </p>
                        ) : (
                          <div className="space-y-3">
                            {resumeFiles.length > 0 && (
                              <div className="space-y-1.5">
                                <p className="text-xs font-medium text-muted-foreground">
                                  Файлы ({resumeFiles.length})
                                </p>
                                <ResumeVersionList
                                  items={resumeFiles}
                                  candidateId={candidate.id}
                                  currentResumeUrl={currentResumeUrl}
                                  onDeleted={handleResumeVersionDeleted}
                                />
                              </div>
                            )}
                            {resumeLinks.length > 0 && (
                              <div className="space-y-1.5">
                                <p className="text-xs font-medium text-muted-foreground">
                                  Ссылки ({resumeLinks.length})
                                </p>
                                <ResumeVersionList
                                  items={resumeLinks}
                                  candidateId={candidate.id}
                                  currentResumeUrl={currentResumeUrl}
                                  onDeleted={handleResumeVersionDeleted}
                                />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </Field>

                <Field label="Сопроводительное письмо" full>
                  <textarea
                    value={coverLetter}
                    onChange={(e) => setCoverLetter(e.target.value)}
                    placeholder="О себе, опыте и навыках..."
                    rows={3}
                    className={`${inputCls} resize-none`}
                  />
                </Field>
              </div>

              {status === "error" && (
                <p className="mt-5 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {errorMsg}
                </p>
              )}

              <button
                type="submit"
                disabled={status === "submitting"}
                className="mt-5 w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
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
