import type { Metadata } from "next"
import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, CalendarDays, MapPin } from "lucide-react"
import { getMailingList, isSheetsConfigured, type MailingListEntry } from "@/lib/sheets"
import { ContactButton } from "@/components/contact-button"

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
    robots: { index: false, follow: false },
  }
}

export default async function MailingListPage({
  params,
}: {
  params: Promise<{ listId: string }>
}) {
  const { listId } = await params

  if (!isSheetsConfigured()) notFound()

  let mailingList = null
  try {
    mailingList = await getMailingList(listId)
  } catch {
    mailingList = null
  }

  if (!mailingList) notFound()

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
            {mailingList.stream
              ? `Выпуск ${mailingList.stream} Talent Stream подготовлен специально для вас.`
              : "Выпуск Talent Stream подготовлен специально для вас."}
          </h1>
          <p className="mt-3 text-pretty leading-relaxed text-muted-foreground">
            В него вошли проверенные кандидаты, отобранные нашей командой за последнюю неделю.
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

        <p className="mb-6 rounded-xl border bg-muted/40 px-4 py-3 text-sm leading-relaxed text-muted-foreground">
          Контакты кандидатов не публикуются напрямую. Если вас заинтересовал кандидат, нажмите
          кнопку «Хочу связаться». Мы уточним у кандидата его интерес — и только после его
          подтверждения передадим вам контакты.
        </p>

        <div className="grid gap-4">
          {entries.map((entry) => (
            <EntryCard key={entry.profile.id} entry={entry} listId={listId} />
          ))}
        </div>
      </div>
    </main>
  )
}

function EntryCard({ entry, listId }: { entry: MailingListEntry; listId: string }) {
  const { profile } = entry

  const tags = [profile.level, profile.industry, profile.func].filter(Boolean)

  const country = [
    profile.countryPrimary,
    profile.countryDesired ? `→ ${profile.countryDesired}` : "",
  ]
    .filter(Boolean)
    .join("  ")

  return (
    <article className="rounded-2xl border bg-card p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {profile.title && (
            <p className="font-semibold text-card-foreground">{profile.title}</p>
          )}
          {country && (
            <p className="mt-1 inline-flex items-center gap-1 text-sm text-muted-foreground">
              <MapPin className="size-3.5 shrink-0" />
              {country}
            </p>
          )}
        </div>

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {profile.summary && (
        <p className="mt-4 text-sm leading-relaxed text-card-foreground whitespace-pre-line">
          {profile.summary}
        </p>
      )}

      <div className="mt-5 border-t pt-4">
        <ContactButton candidateId={profile.id} listId={listId} />
      </div>
    </article>
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
