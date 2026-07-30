import { notFound } from "next/navigation"
import { CalendarDays, Users, Layers, CheckCircle2, UserCheck } from "lucide-react"
import { getMailingLists, getEmployers } from "@/lib/sheets"
import { getCampaigns, getToken, getBookEmailCount, type Campaign } from "@/lib/sendpulse"
import { PublishButton } from "@/components/publish-button"
import { CampaignHistory } from "@/components/campaign-history"
import { AddColumnsButton } from "@/components/add-columns-button"
import { EmployerSection } from "@/components/employer-section"

export const dynamic = "force-dynamic"

export default async function EditorPage({
  searchParams,
}: {
  searchParams: Promise<{ secret?: string }>
}) {
  const { secret } = await searchParams
  const editorSecret = process.env.EDITOR_SECRET

  if (editorSecret && secret !== editorSecret) {
    notFound()
  }

  const [lists, campaigns, employers] = await Promise.all([getMailingLists(), getCampaigns(), getEmployers()])

  const campaignsByTitle = new Map<string, Campaign[]>()
  for (const c of campaigns) {
    const arr = campaignsByTitle.get(c.name) ?? []
    arr.push(c)
    campaignsByTitle.set(c.name, arr)
  }

  const token = await getToken()
  const streamBookCounts = new Map<string, number>()
  if (token) {
    const uniqueStreams = [...new Set(lists.map((l) => l.stream).filter(Boolean))]
    await Promise.all(
      uniqueStreams.map(async (stream) => {
        streamBookCounts.set(stream, await getBookEmailCount(stream, token))
      }),
    )
  }


  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card px-6 py-4">
        <div className="mx-auto max-w-4xl flex items-center justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">TalentStreams</p>
            <h1 className="text-lg font-semibold text-card-foreground">Редактор выпусков</h1>
          </div>
          <span className="rounded-full border px-3 py-1 text-xs text-muted-foreground">
            {lists.length} {mailingPlural(lists.length)}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        {lists.length === 0 ? (
          <div className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">
            Подборок пока нет. Добавьте строки в лист «Mailing lists» в Google Sheets.
          </div>
        ) : (
          <div className="space-y-3">
            {lists.map((list) => {
              const campaignTitle = `${list.stream} — ${list.date}`
              const matchedCampaigns = campaignsByTitle.get(campaignTitle) ?? []
              const alreadySent = matchedCampaigns.length > 0
              const bookEmpty = (streamBookCounts.get(list.stream) ?? 0) === 0
              return (
                <div
                  key={list.listId}
                  className="rounded-xl border bg-card overflow-hidden"
                >
                  <div className="flex items-center gap-4 px-5 py-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                          {list.stream || "—"}
                        </span>
                        {list.date && (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <CalendarDays className="size-3" />
                            {list.date}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Users className="size-3" />
                          {list.candidateCount} {candidatePlural(list.candidateCount)}
                        </span>
                        {alreadySent && (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                            <CheckCircle2 className="size-3" />
                            Отправлено
                          </span>
                        )}
                      </div>
                      <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                        <a
                          href={`/list/${list.listId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-foreground hover:underline"
                        >
                          /list/{list.listId}
                        </a>
                      </p>
                    </div>

                    <PublishButton listId={list.listId} alreadySent={alreadySent} bookEmpty={bookEmpty} />
                  </div>

                  <CampaignHistory campaigns={matchedCampaigns} />
                </div>
              )
            })}
          </div>
        )}

        <section className="mt-8">
          <div className="mb-3 flex items-center gap-2">
            <UserCheck className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Работодатели</h2>
          </div>
          <EmployerSection employers={employers} />
        </section>

        <div className="mt-8 rounded-xl border bg-muted/30 px-5 py-4 text-sm text-muted-foreground">
          <div className="flex items-start gap-2">
            <Layers className="mt-0.5 size-4 shrink-0" />
            <div className="space-y-1">
              <p>Кнопка «Отправить» рассылает письмо всем работодателям, подписанным на стрим этого выпуска.</p>
              <p>Убедитесь, что в переменных окружения заданы <code>APP_URL</code>, <code>SENDPULSE_FROM_EMAIL</code> и <code>SENDPULSE_FROM_NAME</code>.</p>
              <div className="pt-1 border-t border-border/50">
                <AddColumnsButton />
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

function mailingPlural(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return "выпуск"
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "выпуска"
  return "выпусков"
}

function candidatePlural(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return "кандидат"
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "кандидата"
  return "кандидатов"
}
