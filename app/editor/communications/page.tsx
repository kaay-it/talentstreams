import { notFound } from "next/navigation"
import { CandidateDigestSection } from "@/components/candidate-digest-section"
import { ReleaseFollowUpSection } from "@/components/release-follow-up-section"
import { getCandidateDigestRuns, getReleaseFollowUpRuns } from "@/app/actions"

export const dynamic = "force-dynamic"

export default async function CommunicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ secret?: string }>
}) {
  const { secret } = await searchParams
  const editorSecret = process.env.EDITOR_SECRET

  if (editorSecret && secret !== editorSecret) {
    notFound()
  }

  const [digestRuns, followUpRuns] = await Promise.all([
    getCandidateDigestRuns(),
    getReleaseFollowUpRuns(),
  ])

  return (
    <div className="px-6 py-8">
      <div className="mb-6">
        <h1 className="text-lg font-semibold">Коммуникации</h1>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-card-foreground">Ежемесячный дайджест кандидатам</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          «Сколько работодателей увидели ваше резюме» — письмо всем подтверждённым кандидатам
          с email. Автоматическое расписание — в разделе «Настройки».
        </p>
        <CandidateDigestSection initialRuns={digestRuns} />
      </div>

      <div className="mt-10 space-y-3">
        <h2 className="text-sm font-semibold text-card-foreground">Фоллоу-ап после рассылки работодателям</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Через 2–14 дней после отправки каждого выпуска: тем, кто открыл письмо, но не оставил
          заявку — просьба дать обратную связь по подборке; тем, кто письмо вообще не открыл —
          персональное напоминание со ссылкой на тот же выпуск. Автоматическое расписание —
          в разделе «Настройки».
        </p>
        <ReleaseFollowUpSection initialRuns={followUpRuns} />
      </div>
    </div>
  )
}
