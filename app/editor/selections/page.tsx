import { notFound } from "next/navigation"
import { getActiveCandidates, getEligibleCandidatesForRelease, getPausedCandidatesForRelease } from "@/lib/db/candidates"
import { getStreams, getStreamsDetailed } from "@/lib/db/streams"
import { getEmployers, confirmedEmployersForStream, type EmployerPickOption } from "@/lib/db/employers"
import { getSelectionsForStream, getMailingLists, type SelectionSummary } from "@/lib/db/mailing-lists"
import { SelectionsSection } from "@/components/selections-section"
import type { EligibleCandidate } from "@/components/picker-rows"

export const dynamic = "force-dynamic"

export default async function SelectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ secret?: string }>
}) {
  const { secret } = await searchParams
  const editorSecret = process.env.EDITOR_SECRET

  if (editorSecret && secret !== editorSecret) {
    notFound()
  }

  const [streams, streamsDetailed, candidates, allEmployers, mailingLists] = await Promise.all([
    getStreams(),
    getStreamsDetailed(),
    getActiveCandidates(),
    getEmployers(),
    getMailingLists(),
  ])

  const releaseInfoByListId: Record<string, { date: string; sent: boolean }> = Object.fromEntries(
    mailingLists.map((l) => [l.listId, { date: l.date, sent: l.sentCampaignId !== null }]),
  )

  const streamIdByName = new Map(streamsDetailed.map((s) => [s.name, s.id]))

  const eligibleByStream: Record<string, EligibleCandidate[]> = Object.fromEntries(
    streams.map((name) => [
      name,
      getEligibleCandidatesForRelease(candidates, { name }).map((c) => ({
        id: c.id,
        name: c.name,
        title: c.title,
        level: c.level,
        activeSince: c.activeSince,
      })),
    ]),
  )
  const pausedByStream: Record<string, EligibleCandidate[]> = Object.fromEntries(
    streams.map((name) => [
      name,
      getPausedCandidatesForRelease(candidates, { name }).map((c) => ({
        id: c.id,
        name: c.name,
        title: c.title,
        level: c.level,
        activeSince: c.activeSince,
      })),
    ]),
  )
  const employersByStream: Record<string, EmployerPickOption[]> = Object.fromEntries(
    streams.map((name) => [
      name,
      confirmedEmployersForStream(allEmployers, { name }).map((e) => ({ token: e.token, name: e.name, email: e.email, company: e.company })),
    ]),
  )
  const selectionsByStream: Record<string, SelectionSummary[]> = Object.fromEntries(
    await Promise.all(
      streams.map(async (name) => {
        const streamId = streamIdByName.get(name)
        return [name, streamId !== undefined ? await getSelectionsForStream(streamId) : []] as const
      }),
    ),
  )

  return (
    <div className="px-6 py-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">Подборки</h1>
      </div>

      <div className="mb-6 rounded-xl border bg-muted/30 px-5 py-4 text-sm text-muted-foreground">
        Подборка — набор кандидатов, подготовленный заранее для стрима: общая (видна всем работодателям, у которых нет личной) или личная (видна только выбранным работодателям, без гео-фильтра и исключений). Подборку выбирают, когда создают выпуск в разделе «Выпуски» — там её не редактируют, только отмечают.
      </div>

      <SelectionsSection
        streams={streams}
        eligibleByStream={eligibleByStream}
        pausedByStream={pausedByStream}
        employersByStream={employersByStream}
        selectionsByStream={selectionsByStream}
        releaseInfoByListId={releaseInfoByListId}
        editorSecret={editorSecret}
      />
    </div>
  )
}
