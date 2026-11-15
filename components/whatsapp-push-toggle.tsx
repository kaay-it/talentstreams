"use client"

import { useState, useTransition } from "react"
import { setWhatsAppPushEnabled, sendWhatsAppTestMessage } from "@/app/actions"
import { AlertCircle, Check, Loader2, Send } from "lucide-react"

export function WhatsAppPushToggle({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [isTogglePending, startToggleTransition] = useTransition()
  const [toggleError, setToggleError] = useState<string | null>(null)

  const [phone, setPhone] = useState("")
  const [testStatus, setTestStatus] = useState<"idle" | "sending" | "sent" | "error">("idle")
  const [testError, setTestError] = useState("")

  function handleToggle() {
    const next = !enabled
    setEnabled(next)
    startToggleTransition(async () => {
      try {
        await setWhatsAppPushEnabled(next)
      } catch (err) {
        setEnabled(!next)
        setToggleError(err instanceof Error ? err.message : "Не удалось изменить настройку")
      }
    })
  }

  async function handleTestSend() {
    setTestStatus("sending")
    setTestError("")
    try {
      const ok = await sendWhatsAppTestMessage(phone.trim())
      setTestStatus(ok ? "sent" : "error")
      if (!ok) setTestError("SendPulse вернул ошибку — подробности в логах сервера")
    } catch (err) {
      setTestStatus("error")
      setTestError(err instanceof Error ? err.message : "Неизвестная ошибка")
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <label className="flex items-center gap-2.5 text-sm text-card-foreground">
          <input
            type="checkbox"
            checked={enabled}
            onChange={handleToggle}
            disabled={isTogglePending}
            className="size-4 shrink-0 accent-primary"
          />
          Отправлять автоматически при рассылке выпуска
        </label>
        {toggleError && (
          <div className="flex items-start gap-2.5 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3">
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
            <p className="text-sm font-medium text-destructive">{toggleError}</p>
          </div>
        )}
      </div>

      <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
        <p className="text-xs text-muted-foreground">
          Тестовая отправка работает независимо от переключателя выше — с примерными данными, не
          с реальным выпуском.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="tel"
            placeholder="Номер телефона, например 998901234567"
            value={phone}
            onChange={(e) => { setPhone(e.target.value); setTestStatus("idle") }}
            className="min-w-[220px] flex-1 rounded-md border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            onClick={handleTestSend}
            disabled={!phone.trim() || testStatus === "sending"}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            {testStatus === "sending" ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : testStatus === "sent" ? (
              <Check className="size-3.5 text-emerald-600" />
            ) : (
              <Send className="size-3.5" />
            )}
            {testStatus === "sent" ? "Отправлено" : "Отправить тестовое"}
          </button>
        </div>
        {testStatus === "error" && <p className="text-xs text-destructive">{testError}</p>}
      </div>
    </div>
  )
}
