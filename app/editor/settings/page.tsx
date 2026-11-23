import { notFound } from "next/navigation"
import { isSheetsConfigured } from "@/lib/sheets"
import { isGeminiConfigured } from "@/lib/gemini"
import { isWhatsAppConfigured } from "@/lib/sendpulse"
import { ImportCandidatesButton } from "@/components/import-candidates-button"
import { CandidateDigestToggle } from "@/components/candidate-digest-toggle"
import { ReleaseFollowUpToggle } from "@/components/release-follow-up-toggle"
import { WhatsAppPushToggle } from "@/components/whatsapp-push-toggle"
import { DuplicatesSection } from "@/components/duplicates-section"
import { McpAccessSection } from "@/components/mcp-access-section"
import { ReferenceListEditor } from "@/components/reference-list-editor"
import { getCandidateDigestSettings, getReleaseFollowUpSettings, getWhatsAppPushSettings, getDuplicateThreshold, addIndustry, updateIndustryName, deleteIndustry, addCompanySize, updateCompanySizeRecord, deleteCompanySize } from "@/app/actions"
import { getIndustries } from "@/lib/db/industries"
import { getCompanySizes } from "@/lib/db/company-sizes"

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

  const [digestSettings, followUpSettings, whatsappSettings, duplicateThreshold, industries, companySizes] = await Promise.all([
    getCandidateDigestSettings(),
    getReleaseFollowUpSettings(),
    getWhatsAppPushSettings(),
    getDuplicateThreshold(),
    getIndustries(),
    getCompanySizes(),
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

      <div className="mt-10 space-y-3">
        <h2 className="text-sm font-semibold text-card-foreground">WhatsApp-пуш «новый выпуск готов»</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          При отправке выпуска — то же уведомление, что уже уходит в Telegram, но по
          одобренному Meta-шаблону тем работодателям, кто выбрал WhatsApp предпочитаемым
          каналом. Выключено по умолчанию — проверьте тестовой отправкой, что шаблон
          действительно доставляется и ссылка в кнопке собирается правильно, прежде чем включать.
        </p>
        {isWhatsAppConfigured() ? (
          <WhatsAppPushToggle initialEnabled={whatsappSettings.enabled} />
        ) : (
          <p className="text-sm text-muted-foreground">
            WhatsApp не настроен в этом окружении (нет шаблона, одобренного Meta, либо не задан
            SENDPULSE_WA_TEMPLATE_NAME).
          </p>
        )}
      </div>

      <div className="mt-10 space-y-3">
        <h2 className="text-sm font-semibold text-card-foreground">Поиск дублей кандидатов</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Семантический поиск через эмбеддинги (Google AI Studio) — ловит того же человека,
          зарегистрированного второй раз с другим email/телефоном или опечаткой в имени, в
          отличие от точного совпадения контактов. Объединение — вручную, с выбором исходного
          значения для каждого поля.
        </p>
        {isGeminiConfigured() ? (
          <DuplicatesSection initialThresholdPercent={Math.round(duplicateThreshold * 100)} />
        ) : (
          <p className="text-sm text-muted-foreground">Gemini не настроен в этом окружении.</p>
        )}
      </div>

      <div className="mt-10 space-y-3">
        <h2 className="text-sm font-semibold text-card-foreground">MCP-сервер — доступ ИИ-ассистента</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Позволяет подключить Claude Desktop (или другой MCP-совместимый клиент) по адресу{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">/api/mcp</code> — найти, посмотреть
          и отредактировать кандидата, подтвердить/отклонить/поставить на паузу, прочитать резюме
          для суммаризации. Вход — тот же код доступа редактора, что и в ссылках `?secret=`, но
          через настоящий OAuth-логин, а не вставленный один раз токен: доступ можно отозвать
          в любой момент кнопкой ниже.
        </p>
        <McpAccessSection />
      </div>

      <div className="mt-10 space-y-6">
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-card-foreground">Справочники — «О компании» в регистрации работодателя</h2>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Отрасль и размер компании работодатель выбирает только из этих списков при регистрации —
            пополняются здесь (отрасль можно добавить и прямо со страницы «Стримы», галочкой при
            создании индустриального стрима). Удаление записи не меняет уже сохранённые анкеты
            работодателей — только убирает вариант из формы для новых регистраций.
          </p>
        </div>

        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Отрасли</h3>
          <ReferenceListEditor
            items={industries.map((i) => ({ id: i.id, label: i.name }))}
            showHint={false}
            addAction={addIndustry}
            updateAction={updateIndustryName}
            deleteAction={deleteIndustry}
            addButtonLabel="Добавить отрасль"
            labelPlaceholder="Название отрасли"
          />
        </div>

        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Размер компании</h3>
          <ReferenceListEditor
            items={companySizes.map((s) => ({ id: s.id, label: s.label, hint: s.rangeHint }))}
            showHint
            addAction={addCompanySize}
            updateAction={updateCompanySizeRecord}
            deleteAction={deleteCompanySize}
            addButtonLabel="Добавить категорию"
            labelPlaceholder="Название категории"
            hintPlaceholder="Подсказка, например «до 50 человек в штате»"
          />
        </div>
      </div>
    </div>
  )
}
