import { notFound } from "next/navigation"
import { Info } from "lucide-react"
import { getContactRequests, getProfiles } from "@/lib/sheets"
import { ContactRequestsSection } from "@/components/contact-requests-section"

export const dynamic = "force-dynamic"

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ secret?: string }>
}) {
  const { secret } = await searchParams
  const editorSecret = process.env.EDITOR_SECRET

  if (editorSecret && secret !== editorSecret) notFound()

  const [requests, profiles] = await Promise.all([getContactRequests(), getProfiles()])

  const profileTitles = new Map(profiles.map((p) => [p.id, p.title || p.name || p.id]))

  const newCount = requests.filter((r) => r.status === "Новый запрос").length

  return (
    <div className="px-6 py-8 max-w-5xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Запросы на контакт</h1>
        <div className="flex items-center gap-2">
          {newCount > 0 && (
            <span className="rounded-full bg-blue-600 px-2.5 py-0.5 text-xs font-medium text-white">
              {newCount} новых
            </span>
          )}
          <span className="rounded-full border px-3 py-1 text-xs text-muted-foreground">
            {requests.length} всего
          </span>
        </div>
      </div>

      <div className="mb-6 flex items-start gap-2 rounded-xl border bg-muted/30 px-5 py-4 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" />
        <p>
          Запросы поступают когда работодатель нажимает «Хочу связаться» на странице подборки.
          Смените статус через выпадающий список — изменение сохраняется в Google Sheets.
        </p>
      </div>

      <ContactRequestsSection requests={requests} profileTitles={profileTitles} />
    </div>
  )
}
