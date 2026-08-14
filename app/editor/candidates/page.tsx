import { notFound } from "next/navigation"
import { getCandidates } from "@/lib/sheets"
import { getStreams } from "@/lib/db/streams"
import { CandidateSection } from "@/components/candidate-section"

export const dynamic = "force-dynamic"

export default async function CandidatesPage({
  searchParams,
}: {
  searchParams: Promise<{ secret?: string }>
}) {
  const { secret } = await searchParams
  const editorSecret = process.env.EDITOR_SECRET

  if (editorSecret && secret !== editorSecret) {
    notFound()
  }

  const [candidates, streams] = await Promise.all([getCandidates(), getStreams()])
  const pendingCount = candidates.filter((c) => c.status === "На проверке").length

  return (
    <div className="px-6 py-8 max-w-3xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Кандидаты</h1>
        <span className="rounded-full border px-3 py-1 text-xs text-muted-foreground">
          {pendingCount} на проверке
        </span>
      </div>

      <CandidateSection candidates={candidates} streams={streams} />
    </div>
  )
}
