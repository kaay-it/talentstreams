"use client"

import { useState, useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { X, Check, AlertCircle } from "lucide-react"
import { updateEmployer, type EmployerData } from "@/app/actions"
import {
  CONTACT_OPTIONS,
  MAX_STREAMS,
  PRIMARY_COUNTRIES,
  ADDITIONAL_COUNTRIES,
  ANY_COUNTRY,
} from "@/components/employer-registration-modal"
import type { Employer } from "@/lib/sheets"

type ContactMethod = EmployerData["primaryContact"]

const inputCls =
  "w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string
  required?: boolean
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-card-foreground">
        {label}
        {required && <span className="ml-1 text-primary">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

export function EmployerEditModal({
  employer,
  streams,
  onClose,
}: {
  employer: Employer
  streams: string[]
  onClose: () => void
}) {
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle")
  const [errorMsg, setErrorMsg] = useState("")

  const [name, setName] = useState(employer.name)
  const [company, setCompany] = useState(employer.company)
  const [email, setEmail] = useState(employer.email)
  const [phone, setPhone] = useState(employer.phone)
  const [primaryContact, setPrimaryContact] = useState<ContactMethod>(
    (employer.primaryContact || "email") as ContactMethod,
  )
  const [telegram, setTelegram] = useState(employer.telegram)
  const [linkedin, setLinkedin] = useState(employer.linkedin)
  const [selectedStreams, setSelectedStreams] = useState<string[]>(employer.streams)
  const [country, setCountry] = useState(employer.country)
  const [additionalCountries, setAdditionalCountries] = useState<string[]>(employer.additionalCountries)

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

  function toggleAdditionalCountry(c: string) {
    setAdditionalCountries((prev) => {
      if (c === ANY_COUNTRY) {
        return prev.includes(ANY_COUNTRY) ? [] : [ANY_COUNTRY]
      }
      const withoutAny = prev.filter((x) => x !== ANY_COUNTRY)
      return withoutAny.includes(c)
        ? withoutAny.filter((x) => x !== c)
        : [...withoutAny, c]
    })
  }

  function toggleStream(s: string) {
    setSelectedStreams((prev) => {
      if (prev.includes(s)) return prev.filter((x) => x !== s)
      if (prev.length >= MAX_STREAMS) return prev
      return [...prev, s]
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus("submitting")
    setErrorMsg("")
    try {
      await updateEmployer(employer.rowIndex, {
        name,
        company,
        email,
        phone,
        primaryContact,
        telegram,
        linkedin,
        streams: selectedStreams,
        country,
        additionalCountries,
      })
      setStatus("success")
    } catch (err) {
      setStatus("error")
      setErrorMsg(err instanceof Error ? err.message : "Не удалось сохранить изменения")
    }
  }

  const canSubmit =
    name.trim().length > 0 &&
    selectedStreams.length > 0 &&
    (primaryContact !== "telegram" || telegram.trim()) &&
    (primaryContact !== "linkedin" || linkedin.trim())

  const anySelected = additionalCountries.includes(ANY_COUNTRY)
  const additionalHint = anySelected
    ? "Рассматривает кандидатов из любой страны"
    : additionalCountries.length
    ? `Выбрано: ${additionalCountries.length}`
    : "Необязательно — если рассматривает кандидатов из нескольких стран"

  return createPortal(
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-employer-title"
          className="relative w-full max-w-2xl rounded-2xl border bg-card shadow-xl"
        >
          <div className="flex items-center justify-between border-b px-6 py-4">
            <h2 id="edit-employer-title" className="text-base font-semibold text-card-foreground">
              Редактировать работодателя
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
              <p className="mt-2 text-sm text-muted-foreground">Данные работодателя обновлены.</p>
              <button
                onClick={onClose}
                className="mt-6 rounded-lg bg-primary px-6 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                Закрыть
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5 px-6 py-5">

              <div className="grid grid-cols-2 gap-4">
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
                <Field label="Компания">
                  <input
                    type="text"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    placeholder="ООО Пример"
                    className={inputCls}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Email" required>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    className={inputCls}
                  />
                </Field>
                <Field label="Телефон" required>
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+_ ___ ___ ____"
                    className={inputCls}
                  />
                </Field>
              </div>

              <Field label="Предпочтительный способ связи" required>
                <div className="flex gap-2">
                  {CONTACT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setPrimaryContact(opt.value)}
                      className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                        primaryContact === opt.value
                          ? "border-primary bg-primary/10 text-primary"
                          : "text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </Field>

              {primaryContact === "telegram" && (
                <Field label="Telegram" required>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 select-none text-sm text-muted-foreground">
                      @
                    </span>
                    <input
                      type="text"
                      required
                      value={telegram}
                      onChange={(e) => setTelegram(e.target.value.replace(/^@+/, ""))}
                      placeholder="username"
                      className={`${inputCls} pl-7`}
                    />
                  </div>
                </Field>
              )}

              {primaryContact === "linkedin" && (
                <Field label="LinkedIn" required>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 select-none text-sm text-muted-foreground">
                      in/
                    </span>
                    <input
                      type="text"
                      required
                      value={linkedin}
                      onChange={(e) => setLinkedin(e.target.value.replace(/^(https?:\/\/)?(www\.)?linkedin\.com\/in\/?/, ""))}
                      placeholder="username"
                      className={`${inputCls} pl-9`}
                    />
                  </div>
                </Field>
              )}

              <div className="grid grid-cols-2 gap-4 items-start">
                <Field
                  label="Стримы для рассылки"
                  required
                  hint={
                    selectedStreams.length === 0
                      ? `Выберите от 1 до ${MAX_STREAMS}`
                      : selectedStreams.length === MAX_STREAMS
                      ? `Выбрано максимум (${MAX_STREAMS})`
                      : undefined
                  }
                >
                  {streams.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {streams.map((s) => {
                        const selected = selectedStreams.includes(s)
                        const disabled = !selected && selectedStreams.length >= MAX_STREAMS
                        return (
                          <button
                            key={s}
                            type="button"
                            onClick={() => toggleStream(s)}
                            disabled={disabled}
                            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                              selected
                                ? "border-primary bg-primary/10 text-primary"
                                : disabled
                                ? "cursor-not-allowed opacity-35"
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

                <Field label="Страна нахождения" hint="Страна, в которой работает компания">
                  <select
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className={inputCls}
                  >
                    <option value="">— выберите —</option>
                    {PRIMARY_COUNTRIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </Field>
              </div>

              <Field label="Дополнительные страны" hint={additionalHint}>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => toggleAdditionalCountry(ANY_COUNTRY)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      anySelected
                        ? "border-primary bg-primary/10 text-primary"
                        : "text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground"
                    }`}
                  >
                    Любая
                  </button>
                  {ADDITIONAL_COUNTRIES.filter((c) => c !== country).map((c) => {
                    const selected = additionalCountries.includes(c)
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => toggleAdditionalCountry(c)}
                        disabled={anySelected}
                        className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                          selected
                            ? "border-primary bg-primary/10 text-primary"
                            : anySelected
                            ? "cursor-not-allowed opacity-35"
                            : "text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground"
                        }`}
                      >
                        {c}
                      </button>
                    )
                  })}
                </div>
              </Field>

              {status === "error" && (
                <div className="flex items-start gap-2.5 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3">
                  <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
                  <p className="text-sm font-medium text-destructive">{errorMsg}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={status === "submitting" || !canSubmit}
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
