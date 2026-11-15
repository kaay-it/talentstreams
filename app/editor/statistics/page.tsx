import { notFound } from "next/navigation"
import { getMailingLists, getReleaseViewStatsByList, type ReleaseViewStats } from "@/lib/db/mailing-lists"
import { ReleaseStatsSection } from "@/components/release-stats-section"

export const dynamic = "force-dynamic"

export default async function StatisticsPage({
  searchParams,
}: {
  searchParams: Promise<{ secret?: string }>
}) {
  const { secret } = await searchParams
  const editorSecret = process.env.EDITOR_SECRET

  if (editorSecret && secret !== editorSecret) {
    notFound()
  }

  const [lists, statsByList] = await Promise.all([getMailingLists(), getReleaseViewStatsByList()])

  const emptyStats: ReleaseViewStats = { totalViews: 0, distinctEmployers: 0, bySource: {} }
  const sent = lists
    .filter((l) => l.sentCampaignId !== null)
    .sort((a, b) => (b.sentCampaignId ?? 0) - (a.sentCampaignId ?? 0))
    .map((l) => ({ ...l, stats: statsByList.get(l.listId) ?? emptyStats }))

  return (
    <div className="px-6 py-8">
      <div className="mb-6">
        <h1 className="text-lg font-semibold">Статистика</h1>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-card-foreground">Просмотры выпусков по каналам</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Реальные заходы работодателей на страницу выпуска — надёжнее трекинг-пикселя SendPulse
          (блокировка картинок даёт ложный «не открыл» даже у вовлечённого работодателя). Источник —
          с какой ссылки пришли: письмо, Telegram-бот или WhatsApp-шаблон.
        </p>
        <ReleaseStatsSection releases={sent} />
      </div>
    </div>
  )
}
