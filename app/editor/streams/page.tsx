import { notFound } from "next/navigation"
import { getStreamsDetailed } from "@/lib/db/streams"
import { StreamsTable } from "@/components/streams-table"

export const dynamic = "force-dynamic"

export default async function StreamsPage({
  searchParams,
}: {
  searchParams: Promise<{ secret?: string }>
}) {
  const { secret } = await searchParams
  const editorSecret = process.env.EDITOR_SECRET
  if (editorSecret && secret !== editorSecret) notFound()

  const streams = await getStreamsDetailed()

  return (
    <div className="px-6 py-8 max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Стримы</h1>
        <span className="rounded-full border px-3 py-1 text-xs text-muted-foreground">
          {streams.length} {streamPlural(streams.length)}
        </span>
      </div>

      {streams.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">
          Стримы не найдены в базе данных.
        </div>
      ) : (
        <StreamsTable streams={streams} />
      )}
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
