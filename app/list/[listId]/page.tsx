import type { Metadata } from "next"
import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, CalendarDays, Send } from "lucide-react"
import { getMailingList, resolveMailingListForEmployer, type MailingListEntry } from "@/lib/db/mailing-lists"
import { getEmployerByToken, filterCandidatesForEmployer } from "@/lib/db/employers"
import { getStreamsDetailed } from "@/lib/db/streams"
import { telegramConnectUrl } from "@/lib/sendpulse"
import { CandidateEntryCard } from "@/components/candidate-entry-card"
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

  const [streams, mailingList] = await Promise.all([
    getStreamsDetailed(),
    getMailingList(listId).catch(() => null),
  ])

  if (!mailingList) notFound()

  const streamTypes = new Map(streams.map((s) => [s.name.trim().toLowerCase(), s.type]))
  const { date } = mailingList

  // A real employer token ALWAYS resolves "as that employer" — personal selection unfiltered if
  // one targets them, else the default with the usual geo/exclusion filter — regardless of
  // whether ?secret= is also present. secret alone (no token) is the editor's own baseline view:
  // the default selection, unfiltered, or the "подборка не готова" state if there isn't one.
  let entries: MailingListEntry[] = []
  let ready = true

  if (employerToken) {
    const employer = await getEmployerByToken(employerToken)
    if (!employer) notFound()
    const resolved = resolveMailingListForEmployer(mailingList, employerToken)
    if (!resolved) {
      ready = false
    } else if (resolved.isPersonal) {
      entries = resolved.entries
    } else {
      const filtered = filterCandidatesForEmployer(resolved.entries.map((e) => e.profile), employer)
      const filteredIds = new Set(filtered.map((p) => p.id))
      entries = resolved.entries.filter((e) => filteredIds.has(e.profile.id))
    }
  } else if (mailingList.default) {
    entries = mailingList.default.entries
  } else {
    ready = false
  }

  // Shown only to an identified employer — the link binds their bot subscription to their token.
  const telegramUrl = !isEditor && employerToken ? telegramConnectUrl(employerToken) : null

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
          {ready && (
            <>
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
            </>
          )}
        </header>

        {!ready ? (
          <div className="rounded-2xl border border-dashed p-10 text-center text-muted-foreground">
            Подборка для вас пока не готова — загляните чуть позже.
          </div>
        ) : (
          <>
            <p className="mb-6 rounded-xl border bg-muted/40 px-4 py-3 text-sm leading-relaxed text-muted-foreground">
              Контакты кандидатов не публикуются напрямую. Если вас заинтересовал кандидат, нажмите
              кнопку «Хочу связаться». Мы уточним у кандидата его интерес — и только после его
              подтверждения передадим вам контакты.
            </p>

            <div className="grid gap-4">
              {entries.map((entry) => (
                <CandidateEntryCard key={entry.profile.id} entry={entry} listId={listId} employerToken={employerToken} streamTypes={streamTypes} />
              ))}
            </div>
          </>
        )}

        {employerToken && (
          <div className="mt-8 rounded-2xl border bg-card p-6">
            <h2 className="text-base font-semibold text-card-foreground">Не нашли подходящих кандидатов?</h2>
            <p className="mt-1 mb-4 text-sm text-muted-foreground">
              Оставьте запрос — мы подберём кандидатов специально под ваши требования.
            </p>
            <GeneralInquiryButton listId={listId} employerToken={employerToken} />
          </div>
        )}

        {telegramUrl && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-card p-6">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-card-foreground">Подборки в Telegram</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Подключите нашего бота — будем присылать новые выпуски и уведомления в Telegram.
              </p>
            </div>
            <a
              href={telegramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-[#229ED9] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              <Send className="size-4" />
              Подключить Telegram
            </a>
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
