import type { Metadata } from "next"
import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, ArrowRight, CalendarDays } from "lucide-react"
import { getMailingList, isSheetsConfigured, type MailingListEntry } from "@/lib/sheets"

export const dynamic = "force-dynamic"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ listId: string }>
}): Promise<Metadata> {
  const { listId } = await params
  return {
    title: `Подборка ${listId}`,
    description: `Кандидаты из подборки ${listId}`,
  }
}

export default async function MailingListPage({
  params,
}: {
  params: Promise<{ listId: string }>
}) {
  const { listId } = await params

  if (!isSheetsConfigured()) {
    notFound()
  }

  let mailingList = null
  try {
    mailingList = await getMailingList(listId)
  } catch {
    mailingList = null
  }

  if (!mailingList) {
    notFound()
  }

  const { date, entries } = mailingList

  return (
    <main className="min-h-svh bg-background">
      <div className="mx-auto w-full max-w-3xl px-4 py-8 md:py-12">
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          На главную
        </Link>

        <header className="mb-8">
          <p className="text-sm font-medium uppercase tracking-wide text-primary">Talent Stream</p>
          <h1 className="mt-2 text-balance text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            {mailingList.stream ? (
              <>Выпуск {mailingList.stream} Talent Stream подготовлен специально для вас.</>
            ) : (
              <>Выпуск Talent Stream подготовлен специально для вас.</>
            )}
          </h1>
          <p className="mt-3 text-pretty leading-relaxed text-muted-foreground">
            В него вошли проверенные кандидаты, отобранные нашей редакцией за последнюю неделю.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            {date && (
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="size-4" />
                {date}
              </span>
            )}
            <span>
              {entries.length} {plural(entries.length, "кандидат", "кандидата", "кандидатов")}
            </span>
          </div>
        </header>

        <div className="grid gap-4">
          {entries.map((entry) => (
            <EntryCard key={entry.profile.id} entry={entry} listId={mailingList.listId} />
          ))}
        </div>
      </div>
    </main>
  )
}

function EntryCard({ entry, listId }: { entry: MailingListEntry; listId: string }) {
  const { profile, mailingStream } = entry
  return (
    <Link
      href={`/${profile.id}?back=/list/${listId}`}
      className="group block rounded-2xl border bg-card p-6 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-card-foreground">
              {profile.name || profile.id}
            </h2>
            {mailingStream && (
              <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                {mailingStream}
              </span>
            )}
          </div>
          {profile.title && (
            <p className="mt-1 text-sm text-muted-foreground">{profile.title}</p>
          )}
          {profile.bio && (
            <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-card-foreground">
              {profile.bio}
            </p>
          )}
          {profile.stream.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {profile.stream.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
        <ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </div>
    </Link>
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
