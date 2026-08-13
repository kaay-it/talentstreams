import type { Metadata } from "next"
import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, CalendarDays, MapPin } from "lucide-react"
import { getMailingList, getEmployerByToken, filterCandidatesForEmployer, isSheetsConfigured, type MailingListEntry } from "@/lib/sheets"
import { getStreamsDetailed } from "@/lib/db/streams"
import { ContactButton } from "@/components/contact-button"
import { GeneralInquiryButton } from "@/components/general-inquiry-button"

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
  searchParams,
}: {
  params: Promise<{ listId: string }>
  searchParams: Promise<{ e?: string; secret?: string }>
}) {
  const [{ listId }, { e: employerToken, secret }] = await Promise.all([params, searchParams])

  const editorSecret = process.env.EDITOR_SECRET
  const isEditor = editorSecret && secret === editorSecret

  if (!employerToken && !isEditor) notFound()

  if (!isSheetsConfigured()) notFound()

  const [streams, mailingList] = await Promise.all([
    getStreamsDetailed(),
    getMailingList(listId).catch(() => null),
  ])

  if (!mailingList) notFound()

  const streamTypes = new Map(streams.map((s) => [s.name.trim().toLowerCase(), s.type]))

  let entries: MailingListEntry[] = mailingList.entries
  const { date } = mailingList

  if (!isEditor && employerToken) {
    const employer = await getEmployerByToken(employerToken)
    if (!employer) notFound()
    const filtered = filterCandidatesForEmployer(entries.map((e) => e.profile), employer)
    const filteredIds = new Set(filtered.map((p) => p.id))
    entries = entries.filter((e) => filteredIds.has(e.profile.id))
  }

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
            <EntryCard key={entry.profile.id} entry={entry} listId={listId} employerToken={employerToken} streamTypes={streamTypes} />
          ))}
        </div>

        {employerToken && (
          <div className="mt-8 rounded-2xl border bg-card p-6">
            <h2 className="text-base font-semibold text-card-foreground">Не нашли подходящих кандидатов?</h2>
            <p className="mt-1 mb-4 text-sm text-muted-foreground">
              Оставьте запрос — мы подберём кандидатов специально под ваши требования.
            </p>
            <GeneralInquiryButton listId={listId} employerToken={employerToken} />
          </div>
        )}
      </div>
    </main>
  )
}

function EntryCard({
  entry,
  listId,
  employerToken,
  streamTypes,
}: {
  entry: MailingListEntry
  listId: string
  employerToken?: string
  streamTypes: Map<string, string>
}) {
  const { profile } = entry

  // Industry/Function tags are derived from the candidate's Stream membership
  // (TASK-27) via each stream's type, rather than separate Profile fields.
  const industryTags = profile.stream.filter((s) => streamTypes.get(s.trim().toLowerCase()) === "Industry")
  const funcTags = profile.stream.filter((s) => streamTypes.get(s.trim().toLowerCase()) === "Functional")
  const tags = [profile.level, ...industryTags, ...funcTags].filter(Boolean)

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
        <ContactButton candidateId={profile.id} listId={listId} employerToken={employerToken} />
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
