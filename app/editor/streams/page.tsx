import { notFound } from "next/navigation"
import { getStreamsDetailed } from "@/lib/db/streams"
import { getProfiles, getCandidatesForStream, isSheetsConfigured } from "@/lib/sheets"
import { getEmployers, confirmedEmployersForStream } from "@/lib/db/employers"
import { getMailingLists, type MailingListSummary } from "@/lib/db/mailing-lists"
import { getCampaigns } from "@/lib/sendpulse"
import { StreamsTable } from "@/components/streams-table"
import { ArchivedStreamsSection } from "@/components/archived-streams-section"

export const dynamic = "force-dynamic"

export default async function StreamsPage({
  searchParams,
}: {
  searchParams: Promise<{ secret?: string }>
}) {
  const { secret } = await searchParams
  const editorSecret = process.env.EDITOR_SECRET
  if (editorSecret && secret !== editorSecret) notFound()

  const [streams, candidates, allEmployers, mailingLists, campaigns] = await Promise.all([
    getStreamsDetailed(),
    isSheetsConfigured() ? getProfiles() : Promise.resolve([]),
    getEmployers(),
    getMailingLists(),
    getCampaigns(),
  ])

  const candidateCounts = Object.fromEntries(
    streams.map((s) => [s.id, getCandidatesForStream(candidates, s).length]),
  )
  const subscriberCounts = Object.fromEntries(
    streams.map((s) => [s.id, confirmedEmployersForStream(allEmployers, s).length]),
  )

  const campaignNames = new Set(campaigns.map((c) => c.name))
  const mailingHistoryByStreamId: Record<number, (MailingListSummary & { sent: boolean })[]> = {}
  for (const list of mailingLists) {
    if (list.streamId === null) continue
    const sent = campaignNames.has(`${list.stream} — ${list.date}`)
    ;(mailingHistoryByStreamId[list.streamId] ??= []).push({ ...list, sent })
  }
  const hasSentReleases: Record<number, boolean> = Object.fromEntries(
    streams.map((s) => [s.id, (mailingHistoryByStreamId[s.id] ?? []).some((l) => l.sent)]),
  )

  const activeStreams = streams.filter((s) => s.status === "Активный")
  const archivedStreams = streams.filter((s) => s.status === "Архивный")

  return (
    <div className="px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Стримы</h1>
        <span className="rounded-full border px-3 py-1 text-xs text-muted-foreground">
          {activeStreams.length} {streamPlural(activeStreams.length)}
        </span>
      </div>

      {activeStreams.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">
          Активные стримы не найдены в базе данных.
        </div>
      ) : (
        <StreamsTable
          streams={activeStreams}
          candidateCounts={candidateCounts}
          subscriberCounts={subscriberCounts}
          mailingHistoryByStreamId={mailingHistoryByStreamId}
          hasSentReleases={hasSentReleases}
        />
      )}

      <div className="mt-4">
        <ArchivedStreamsSection
          streams={archivedStreams}
          candidateCounts={candidateCounts}
          subscriberCounts={subscriberCounts}
          mailingHistoryByStreamId={mailingHistoryByStreamId}
        />
      </div>
    </div>
  )
}

function streamPlural(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return "стрим"
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "стрима"
  return "стримов"
}
