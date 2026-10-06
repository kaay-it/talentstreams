import { notFound } from "next/navigation"
import { Info } from "lucide-react"
import { getEmployers, updateEmployerFields } from "@/lib/db/employers"
import { getStreams } from "@/lib/db/streams"
import { getTelegramConnectionInfo } from "@/lib/sendpulse"
import { EmployerSection } from "@/components/employer-section"

export const dynamic = "force-dynamic"

export default async function EmployersPage({
  searchParams,
}: {
  searchParams: Promise<{ secret?: string }>
}) {
  const { secret } = await searchParams
  const editorSecret = process.env.EDITOR_SECRET

  if (editorSecret && secret !== editorSecret) {
    notFound()
  }

  const employers = await getEmployers()
  const [streams, telegramInfo] = await Promise.all([
    getStreams(),
    getTelegramConnectionInfo(employers.map((e) => e.token)),
  ])

  // Sync-on-read: keeps employers.telegramId truthful to what SendPulse reports right now —
  // written when a connection is found, cleared when one we previously stored is gone (deleted
  // via deleteTelegramContact() on employer deletion, or removed by any other means). This is
  // the portability groundwork discussed for eventually moving off SendPulse to a self-hosted
  // bot: telegramId is Telegram's own user id, addressable directly via the Bot API.
  //
  // employers.telegram (the @username) is also corrected here, one-directionally: an employer
  // types a Telegram username at registration, but nothing stops them opening the connect link
  // from a *different* Telegram account — SendPulse's own report of who actually connected is
  // the only reliable source. Only overwritten when SendPulse reports a real username (never
  // cleared to null — a username is optional on Telegram, and the one the employer typed is
  // still better than nothing if the connected account simply doesn't have one).
  await Promise.all(
    employers.map((e) => {
      const info = telegramInfo.get(e.token)
      const foundTelegramId = info?.telegramId ?? null
      const updates: Partial<{ telegramId: string | null; telegram: string }> = {}
      if (foundTelegramId !== e.telegramId) updates.telegramId = foundTelegramId
      if (info?.username && info.username !== e.telegram) updates.telegram = info.username
      if (Object.keys(updates).length === 0) return undefined
      return updateEmployerFields(e.token, updates)
    }),
  )

  return (
    <div className="px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Работодатели</h1>
        <span className="rounded-full border px-3 py-1 text-xs text-muted-foreground">
          {employers.length} {employerPlural(employers.length)}
        </span>
      </div>

      <div className="mb-6 flex items-start gap-2 rounded-xl border bg-muted/30 px-5 py-4 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" />
        <p>
          Работодатели регистрируются через форму на главной странице или добавляются здесь вручную —
          в обоих случаях попадают в статус «На проверке». После подтверждения они добавляются
          в адресные книги SendPulse и начинают получать рассылки. Отклонённые заявки в рассылку не включаются.
        </p>
      </div>

      <EmployerSection employers={employers} streams={streams} telegramConnectedTokens={[...telegramInfo.keys()]} />
    </div>
  )
}

function employerPlural(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return "работодатель"
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "работодателя"
  return "работодателей"
}
