import { notFound } from "next/navigation"
import { isSheetsConfigured } from "@/lib/sheets"
import { ImportCandidatesButton } from "@/components/import-candidates-button"

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
    </div>
  )
}
