import { notFound } from "next/navigation"
import { getBillingPlans } from "@/app/actions"
import { BillingPlansSection } from "@/components/billing-plans-section"

export const dynamic = "force-dynamic"

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ secret?: string }>
}) {
  const { secret } = await searchParams
  const editorSecret = process.env.EDITOR_SECRET

  if (editorSecret && secret !== editorSecret) {
    notFound()
  }

  const plans = await getBillingPlans()

  return (
    <div className="px-6 py-8">
      <div className="mb-6">
        <h1 className="text-lg font-semibold">Биллинг</h1>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-card-foreground">Тарифы</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Каталог тарифных планов для подписки работодателей — пока только управление тарифами и
          ценами по валютам. Оформление подписки и реальная оплата ещё не подключены: нет
          мерчант-аккаунта ни в одном платёжном шлюзе.
        </p>
        <BillingPlansSection plans={plans} />
      </div>
    </div>
  )
}
