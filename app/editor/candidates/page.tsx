import { notFound } from "next/navigation"
import { getCandidates } from "@/lib/sheets"
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

  const candidates = await getCandidates()

  const pending = candidates.filter((c) => c.status === "На проверке")
  const active = candidates.filter((c) => c.status === "Активный")
  const rejected = candidates.filter((c) => c.status === "Отклонён")

  return (
    <div className="px-6 py-8 max-w-3xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Кандидаты</h1>
        <span className="rounded-full border px-3 py-1 text-xs text-muted-foreground">
          {pending.length} на проверке
        </span>
      </div>

      <CandidateSection pending={pending} active={active} rejected={rejected} />
    </div>
  )
}
