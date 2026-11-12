import { notFound } from "next/navigation"
import { isSheetsConfigured } from "@/lib/sheets"
import { ImportCandidatesButton } from "@/components/import-candidates-button"
import { CandidateDigestToggle } from "@/components/candidate-digest-toggle"
import { ReleaseFollowUpToggle } from "@/components/release-follow-up-toggle"
import { getCandidateDigestSettings, getReleaseFollowUpSettings } from "@/app/actions"

export const dynamic = "force-dynamic"

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ secret?: string }>
}) {
  const { secret } = await searchParams
  const editorSecret = process.env.EDITOR_SECRET

  if (editorSecret && secret !== editorSecret) {
    notFound()
  }

  const [digestSettings, followUpSettings] = await Promise.all([
    getCandidateDigestSettings(),
    getReleaseFollowUpSettings(),
  ])

  return (
    <div className="px-6 py-8">
      <div className="mb-6">
        <h1 className="text-lg font-semibold">Настройки</h1>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-card-foreground">Импорт кандидатов из Google-таблицы</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Заполните таблицу вручную (ссылка — в менеджерской инструкции) и нажмите «Проверить» —
          сайт покажет, кого добавит, прежде чем что-либо записать. Уже существующие в базе
          кандидаты (совпадение по id, email или телефону) пропускаются — таблицу можно проверять
          и импортировать повторно без риска задвоить запись.
        </p>
        {isSheetsConfigured() ? (
          <ImportCandidatesButton />
        ) : (
          <p className="text-sm text-muted-foreground">Google Sheets не настроен в этом окружении.</p>
        )}
      </div>

      <div className="mt-10 space-y-3">
        <h2 className="text-sm font-semibold text-card-foreground">Ежемесячный дайджест кандидатам</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          «Сколько работодателей увидели ваше резюме» — письмо всем подтверждённым кандидатам
          с email. Плановая отправка — первый понедельник каждого месяца, если включена ниже;
          ручная отправка с предпросмотром — в разделе «Коммуникации».
        </p>
        <CandidateDigestToggle initialAutoSendEnabled={digestSettings.autoSendEnabled} />
      </div>

      <div className="mt-10 space-y-3">
        <h2 className="text-sm font-semibold text-card-foreground">Фоллоу-ап после рассылки работодателям</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Через 2–14 дней после отправки каждого выпуска: тем, кто открыл письмо, но не оставил
          заявку — просьба дать обратную связь по подборке; тем, кто письмо вообще не открыл —
          персональное напоминание со ссылкой на тот же выпуск. Каждому работодателю по каждому
          выпуску — не больше одного решения, повторно не напоминаем. Ручная отправка с
          предпросмотром — в разделе «Коммуникации».
        </p>
        <ReleaseFollowUpToggle initialAutoSendEnabled={followUpSettings.autoSendEnabled} />
      </div>
    </div>
  )
}
