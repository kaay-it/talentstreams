import { notFound } from "next/navigation"
import { getActiveCandidates, getEligibleCandidatesForRelease, getPausedCandidatesForRelease } from "@/lib/db/candidates"
import { getStreams } from "@/lib/db/streams"
import { getEmployers, confirmedEmployersForStream, type EmployerPickOption } from "@/lib/db/employers"
import { getAllSelections, getMailingLists } from "@/lib/db/mailing-lists"
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

  const [streams, candidates, allEmployers, mailingLists, allSelections] = await Promise.all([
    getStreams(),
    getActiveCandidates(),
    getEmployers(),
    getMailingLists(),
    getAllSelections(),
  ])

  const releaseInfoByListId: Record<string, { date: string; sent: boolean }> = Object.fromEntries(
    mailingLists.map((l) => [l.listId, { date: l.date, sent: l.sentCampaignId !== null }]),
  )

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

  return (
    <div className="px-6 py-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">Подборки</h1>
      </div>

      <div className="mb-6 rounded-xl border bg-muted/30 px-5 py-4 text-sm text-muted-foreground">
        Подборка — набор кандидатов, подготовленный заранее для стрима и даты: общая (видна всем работодателям, у которых нет личной) или ограниченная — видна только выбранным работодателям, без гео-фильтра и исключений. Подборку выбирают, когда создают выпуск в разделе «Выпуски» — там её не редактируют, только отмечают.
      </div>

      <SelectionsSection
        streams={streams}
        allSelections={allSelections}
        eligibleByStream={eligibleByStream}
        pausedByStream={pausedByStream}
        employersByStream={employersByStream}
        releaseInfoByListId={releaseInfoByListId}
        editorSecret={editorSecret}
      />
    </div>
  )
}
