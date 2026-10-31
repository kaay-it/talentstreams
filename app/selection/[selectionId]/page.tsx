import type { Metadata } from "next"
import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, CalendarDays, Users } from "lucide-react"
import { getSelectionById } from "@/lib/db/mailing-lists"
import { getEmployerByToken, type Employer } from "@/lib/db/employers"
import { getStreamsDetailed } from "@/lib/db/streams"
import { CandidateEntryCard } from "@/components/candidate-entry-card"

export const dynamic = "force-dynamic"

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Подборка", robots: { index: false, follow: false } }
}

/**
 * Direct, editor-only view of ONE selection ("подборка") — default or personal, part of an
 * unsent or already-sent release alike. Unlike /list/[listId], there's no employer resolution
 * here and filterCandidatesForEmployer is never applied: this is a raw inspection tool (what
 * exactly is in this подборка), not a simulation of what any particular employer would see.
 * Gated by ?secret= only, same as /editor/* — no employer ever links here directly, they always
 * go through /list/[listId]?e=..., which resolves to the right selection on its own.
 */
export default async function SelectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ selectionId: string }>
  searchParams: Promise<{ secret?: string }>
}) {
  const [{ selectionId }, { secret }] = await Promise.all([params, searchParams])

  const editorSecret = process.env.EDITOR_SECRET
  if (editorSecret && secret !== editorSecret) notFound()

  const [streams, selection] = await Promise.all([
    getStreamsDetailed(),
    getSelectionById(selectionId).catch(() => null),
  ])
  if (!selection) notFound()

  const streamTypes = new Map(streams.map((s) => [s.name.trim().toLowerCase(), s.type]))
  const isPersonal = selection.employerTokens.length > 0

  const employers = isPersonal
    ? (await Promise.all(selection.employerTokens.map((t) => getEmployerByToken(t)))).filter((e): e is Employer => Boolean(e))
    : []

  return (
    <main className="min-h-svh bg-background">
      <div className="mx-auto w-full max-w-3xl px-4 py-8 md:py-12">
        <Link
          href={`/editor?secret=${secret ?? ""}`}
          className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          К выпускам
        </Link>

        <header className="mb-8">
          <p className="text-sm font-medium uppercase tracking-wide text-primary">Talent Stream · Подборка</p>
          <h1 className="mt-2 text-balance text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            {selection.stream || "—"} {isPersonal ? "— личная подборка" : "— подборка по умолчанию"}
          </h1>
          <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            {selection.date && (
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="size-4" />
                {selection.date}
              </span>
            )}
            <span>
              {selection.entries.length} {plural(selection.entries.length, "кандидат", "кандидата", "кандидатов")}
            </span>
          </div>
          {isPersonal && (
            <div className="mt-4 rounded-xl border bg-muted/40 px-4 py-3">
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Users className="size-3.5" />
                Видна только этим работодателям
              </p>
              <p className="text-sm text-foreground">
                {employers.length ? employers.map((e) => `${e.name} (${e.company})`).join(", ") : "работодатели больше не найдены"}
              </p>
            </div>
          )}
        </header>

        {selection.entries.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-10 text-center text-muted-foreground">
            В этой подборке пока нет кандидатов.
          </div>
        ) : (
          <div className="grid gap-4">
            {selection.entries.map((entry) => (
              <CandidateEntryCard key={entry.profile.id} entry={entry} streamTypes={streamTypes} showContactButton={false} />
            ))}
          </div>
        )}
      </div>
    </main>
  )
}

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 19) return many
  if (mod10 === 1) return one
  if (mod10 >= 2 && mod10 <= 4) return few
  return many
}
