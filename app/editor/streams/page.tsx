import { notFound } from "next/navigation"
import { getStreamsDetailed } from "@/lib/sheets"
import { Layers } from "lucide-react"

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
    <div className="px-6 py-8 max-w-3xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Стримы</h1>
        <span className="rounded-full border px-3 py-1 text-xs text-muted-foreground">
          {streams.length} {streamPlural(streams.length)}
        </span>
      </div>

      {streams.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">
          Стримы не найдены. Добавьте строки в лист «Streams» в Google Sheets
          (колонки: Stream, Type, Description).
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-5 py-3 text-left font-medium text-muted-foreground">Название</th>
                <th className="px-5 py-3 text-left font-medium text-muted-foreground">Тип</th>
                <th className="px-5 py-3 text-left font-medium text-muted-foreground">Описание</th>
              </tr>
            </thead>
            <tbody>
              {streams.map((stream) => (
                <tr key={stream.name} className="border-b last:border-b-0 hover:bg-muted/20 transition-colors">
                  <td className="px-5 py-3.5 font-medium text-card-foreground whitespace-nowrap">
                    <span className="inline-flex items-center gap-2">
                      <Layers className="size-3.5 text-primary shrink-0" />
                      {stream.name}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-muted-foreground whitespace-nowrap">
                    {stream.type || <span className="text-muted-foreground/40">—</span>}
                  </td>
                  <td className="px-5 py-3.5 text-muted-foreground">
                    {stream.description || <span className="text-muted-foreground/40">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
