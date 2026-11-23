"use client"

import { useState, useTransition } from "react"
import { createPortal } from "react-dom"
import { Plus, Pencil, Trash2, X, AlertCircle, Loader2 } from "lucide-react"
import { createBillingPlan, updateBillingPlan, deleteBillingPlan, setPlanPrice, deletePlanPrice } from "@/app/actions"
import type { BillingPlan, BillingCurrency, PlanPrice } from "@/lib/db/billing"

const CURRENCIES: BillingCurrency[] = ["KZT", "UZS", "KGS", "USD"]

function planPlural(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return "план"
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "плана"
  return "планов"
}

export function BillingPlansSection({ plans }: { plans: BillingPlan[] }) {
  const [formPlan, setFormPlan] = useState<BillingPlan | "new" | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleDelete(id: number) {
    setError(null)
    startTransition(async () => {
      const result = await deleteBillingPlan(id)
      if (!result.ok) setError(result.error)
      setDeletingId(null)
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{plans.length} {planPlural(plans.length)}</span>
        <button
          onClick={() => setFormPlan("new")}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Plus className="size-3.5" />
          Добавить план
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2.5 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <p className="text-sm font-medium text-destructive">{error}</p>
        </div>
      )}

      <div className="rounded-xl border bg-card overflow-hidden">
        {plans.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">Тарифов пока нет.</p>
        ) : (
          plans.map((plan) => (
            <div key={plan.id} className="flex items-start justify-between gap-3 border-b px-4 py-3 last:border-b-0">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-card-foreground">{plan.name}</span>
                  {!plan.isActive && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Скрыт</span>
                  )}
                </div>
                {plan.description && <p className="text-xs text-muted-foreground">{plan.description}</p>}
                <div className="flex flex-wrap gap-1.5">
                  {plan.prices.length === 0 ? (
                    <span className="text-xs text-muted-foreground">Цена не задана</span>
                  ) : (
                    plan.prices.map((p) => (
                      <span key={p.currency} className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                        {p.currency} {p.amount.toLocaleString("ru-RU")}
                      </span>
                    ))
                  )}
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                {deletingId === plan.id ? (
                  <>
                    <button
                      onClick={() => handleDelete(plan.id)}
                      disabled={isPending}
                      className="inline-flex items-center gap-1 rounded-lg bg-destructive px-2.5 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                      {isPending ? <Loader2 className="size-3 animate-spin" /> : "Да, удалить"}
                    </button>
                    <button onClick={() => setDeletingId(null)} className="rounded-lg border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted">
                      Отмена
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={() => setFormPlan(plan)} className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" aria-label="Редактировать">
                      <Pencil className="size-3.5" />
                    </button>
                    <button onClick={() => setDeletingId(plan.id)} className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive" aria-label="Удалить">
                      <Trash2 className="size-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {formPlan !== null && (
        <BillingPlanFormModal plan={formPlan === "new" ? null : formPlan} onClose={() => setFormPlan(null)} />
      )}
    </div>
  )
}

function BillingPlanFormModal({ plan, onClose }: { plan: BillingPlan | null; onClose: () => void }) {
  const [name, setName] = useState(plan?.name ?? "")
  const [description, setDescription] = useState(plan?.description ?? "")
  const [isActive, setIsActive] = useState(plan?.isActive ?? true)
  const [prices, setPrices] = useState<PlanPrice[]>(plan?.prices ?? [])
  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle")
  const [error, setError] = useState("")

  function addPriceRow() {
    const unused = CURRENCIES.find((c) => !prices.some((p) => p.currency === c))
    if (!unused) return
    setPrices((prev) => [...prev, { currency: unused, amount: 0 }])
  }

  function updatePriceRow(index: number, patch: Partial<PlanPrice>) {
    setPrices((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)))
  }

  function removePriceRow(index: number) {
    setPrices((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleSubmit() {
    if (!name.trim()) {
      setStatus("error")
      setError("Введите название плана")
      return
    }
    setStatus("submitting")
    setError("")

    if (!plan) {
      const result = await createBillingPlan(name, description, prices)
      if (!result.ok) {
        setStatus("error")
        setError(result.error)
        return
      }
    } else {
      const result = await updateBillingPlan(plan.id, { name, description, isActive })
      if (!result.ok) {
        setStatus("error")
        setError(result.error)
        return
      }
      const nextCurrencies = new Set(prices.map((p) => p.currency))
      const removed = plan.prices.filter((p) => !nextCurrencies.has(p.currency))
      await Promise.all([
        ...prices.map((p) => setPlanPrice(plan.id, p.currency, p.amount)),
        ...removed.map((p) => deletePlanPrice(plan.id, p.currency)),
      ])
    }
    onClose()
  }

  return createPortal(
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className="flex min-h-full items-center justify-center p-4">
        <div role="dialog" aria-modal="true" className="relative w-full max-w-lg rounded-2xl border bg-card p-6 shadow-xl">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-card-foreground">{plan ? "Редактировать план" : "Новый план"}</h2>
            <button onClick={onClose} className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" aria-label="Закрыть">
              <X className="size-4" />
            </button>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Название</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Описание</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full resize-none rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {plan && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="size-4 accent-primary" />
                Активен (виден при выборе плана)
              </label>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Цены по валютам</label>
              <div className="space-y-2">
                {prices.map((p, i) => (
                  <div key={p.currency} className="flex items-center gap-2">
                    <select
                      value={p.currency}
                      onChange={(e) => updatePriceRow(i, { currency: e.target.value as BillingCurrency })}
                      className="rounded-md border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      {CURRENCIES.map((c) => (
                        <option key={c} value={c} disabled={prices.some((other, j) => j !== i && other.currency === c)}>
                          {c}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={0}
                      value={p.amount}
                      onChange={(e) => updatePriceRow(i, { amount: Number(e.target.value) })}
                      className="flex-1 rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <button onClick={() => removePriceRow(i)} className="flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive" aria-label="Убрать валюту">
                      <X className="size-3.5" />
                    </button>
                  </div>
                ))}
                {prices.length < CURRENCIES.length && (
                  <button onClick={addPriceRow} className="inline-flex items-center gap-1.5 text-xs font-medium text-primary transition-opacity hover:opacity-80">
                    <Plus className="size-3.5" />
                    Добавить валюту
                  </button>
                )}
              </div>
            </div>

            {status === "error" && (
              <div className="flex items-start gap-2.5 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3">
                <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
                <p className="text-sm font-medium text-destructive">{error}</p>
              </div>
            )}
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted">
              Отмена
            </button>
            <button
              onClick={handleSubmit}
              disabled={status === "submitting"}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {status === "submitting" && <Loader2 className="size-3.5 animate-spin" />}
              Сохранить
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
