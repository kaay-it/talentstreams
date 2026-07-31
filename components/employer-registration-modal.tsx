"use client"

import { useState, useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { X, Check, AlertCircle } from "lucide-react"
import { registerEmployer, type EmployerData } from "@/app/actions"

const CONTACT_OPTIONS = [
  { value: "email", label: "Email" },
  { value: "telegram", label: "Telegram" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "linkedin", label: "LinkedIn" },
] as const

const MAX_STREAMS = 2

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

export function EmployerRegistrationModal({ streams }: { streams: string[] }) {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle")
  const [errorMsg, setErrorMsg] = useState("")

  const [name, setName] = useState("")
  const [company, setCompany] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [primaryContact, setPrimaryContact] = useState<ContactMethod>("email")
  const [telegram, setTelegram] = useState("")
  const [linkedin, setLinkedin] = useState("")
  const [selectedStreams, setSelectedStreams] = useState<string[]>([])

  const emailRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    document.body.style.overflow = "hidden"
    emailRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose()
    }
    document.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = ""
      document.removeEventListener("keydown", onKey)
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleClose() {
    setOpen(false)
    setStatus("idle")
    setErrorMsg("")
    setName("")
    setCompany("")
    setEmail("")
    setPhone("")
    setPrimaryContact("email")
    setTelegram("")
    setLinkedin("")
    setSelectedStreams([])
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
    try {
      await registerEmployer({ name, company, email, phone, primaryContact, telegram, linkedin, streams: selectedStreams })
      setStatus("success")
    } catch (err) {
      setStatus("error")
      setErrorMsg(err instanceof Error ? err.message : "Не удалось отправить заявку. Попробуйте позже.")
    }
  }

  const canSubmit =
    name.trim().length > 0 &&
    selectedStreams.length > 0 &&
    (primaryContact !== "telegram" || telegram.trim()) &&
    (primaryContact !== "linkedin" || linkedin.trim())

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
      >
        Подписаться на рассылку
      </button>

      {open && createPortal(
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} aria-hidden="true" />
          <div className="flex min-h-full items-center justify-center p-4">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="reg-modal-title"
              className="relative w-full max-w-md rounded-2xl border bg-card shadow-xl"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b px-6 py-4">
                <h2 id="reg-modal-title" className="text-base font-semibold text-card-foreground">
                  Подписаться на рассылку
                </h2>
                <button
                  onClick={handleClose}
                  className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label="Закрыть"
                >
                  <X className="size-4" />
                </button>
              </div>

              {/* Success state */}
              {status === "success" ? (
                <div className="flex flex-col items-center px-6 py-12 text-center">
                  <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Check className="size-6" />
                  </span>
                  <h3 className="mt-4 text-lg font-semibold text-card-foreground">Заявка отправлена</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Мы свяжемся с вами удобным способом в ближайшее время.
                  </p>
                  <button
                    onClick={handleClose}
                    className="mt-6 rounded-lg bg-primary px-6 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
                  >
                    Закрыть
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5 px-6 py-5">
                  <Field label="Имя" required>
                    <input
                      ref={emailRef}
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
                    {status === "submitting" ? "Отправка…" : "Отправить заявку"}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
