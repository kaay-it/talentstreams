import "server-only"
import { eq, and, inArray, count } from "drizzle-orm"
import { db } from "./index"
import { billingPlans, planPrices, employerSubscriptions } from "./schema"

/** ISO 4217 codes this app currently bills in — employers pay from several Central Asian
 * countries, each with its own currency (and, per TASK-62's research, its own separate
 * payment-gateway merchant account — Freedom Pay is three distinct national services, not one
 * pan-regional gateway). Plain text column in the DB, checked only at the application boundary —
 * same pattern as CandidateStatus/EmployerStatus. */
export type BillingCurrency = "KZT" | "UZS" | "KGS" | "USD"

export type SubscriptionStatus = "active" | "past_due" | "canceled" | "trialing"

export type PlanPrice = { currency: BillingCurrency; amount: number }

export type BillingPlan = {
  id: number
  name: string
  description: string
  isActive: boolean
  prices: PlanPrice[]
}

function toPlanPrice(row: typeof planPrices.$inferSelect): PlanPrice {
  return { currency: row.currency as BillingCurrency, amount: row.amount }
}

export async function getBillingPlans(): Promise<BillingPlan[]> {
  const [plans, prices] = await Promise.all([
    db.select().from(billingPlans),
    db.select().from(planPrices),
  ])
  const pricesByPlan = new Map<number, PlanPrice[]>()
  for (const p of prices) {
    const list = pricesByPlan.get(p.planId) ?? []
    list.push(toPlanPrice(p))
    pricesByPlan.set(p.planId, list)
  }
  return plans.map((plan) => ({
    id: plan.id,
    name: plan.name,
    description: plan.description,
    isActive: plan.isActive,
    prices: pricesByPlan.get(plan.id) ?? [],
  }))
}

export async function getActiveBillingPlans(): Promise<BillingPlan[]> {
  const plans = await getBillingPlans()
  return plans.filter((p) => p.isActive)
}

/** Creates a plan and all its initial prices in one call — one plan rarely makes sense without
 * at least one price, same reasoning as createCandidateRecord() taking every field at once rather
 * than a two-step create-then-fill. */
export async function createBillingPlan(name: string, description: string, prices: PlanPrice[]): Promise<number> {
  const [row] = await db.insert(billingPlans).values({ name, description }).returning({ id: billingPlans.id })
  if (prices.length > 0) {
    await db.insert(planPrices).values(prices.map((p) => ({ planId: row.id, currency: p.currency, amount: p.amount })))
  }
  return row.id
}

export async function updateBillingPlan(id: number, data: { name?: string; description?: string; isActive?: boolean }): Promise<void> {
  await db.update(billingPlans).set(data).where(eq(billingPlans.id, id))
}

/** Upsert — a plan has at most one price per currency (unique(planId, currency)). */
export async function setPlanPrice(planId: number, currency: BillingCurrency, amount: number): Promise<void> {
  await db
    .insert(planPrices)
    .values({ planId, currency, amount })
    .onConflictDoUpdate({ target: [planPrices.planId, planPrices.currency], set: { amount } })
}

export async function deletePlanPrice(planId: number, currency: BillingCurrency): Promise<void> {
  await db.delete(planPrices).where(and(eq(planPrices.planId, planId), eq(planPrices.currency, currency)))
}

/** Whether any subscription on this plan is still in a billable state — the guard itself (and
 * the friendly error it produces) belongs in app/actions.ts, same separation as
 * streamHasSentReleases()/updateStream() in that file: this module only answers the yes/no
 * question, it doesn't decide what to do with the answer. */
export async function planHasActiveSubscriptions(planId: number): Promise<boolean> {
  const [row] = await db
    .select({ n: count() })
    .from(employerSubscriptions)
    .where(and(eq(employerSubscriptions.planId, planId), inArray(employerSubscriptions.status, ["active", "past_due", "trialing"])))
  return (row?.n ?? 0) > 0
}

export async function deleteBillingPlanRecord(id: number): Promise<void> {
  await db.delete(billingPlans).where(eq(billingPlans.id, id))
}
