import { notFound } from "next/navigation"
import { AddColumnsButton } from "@/components/add-columns-button"

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
    <div className="px-6 py-8 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-lg font-semibold">Настройки</h1>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Google Sheets</h2>
        <div className="rounded-xl border bg-card px-5 py-4">
          <p className="text-sm font-medium mb-1">Колонки профилей кандидатов</p>
          <p className="text-sm text-muted-foreground mb-4">
            Добавляет в основной лист Google Sheets недостающие колонки дистрибуционных тегов:
            Level, Industry, Function, Country Primary, Country Desired, Summary.
            Операция идемпотентна — уже существующие колонки не затрагиваются.
          </p>
          <AddColumnsButton />
        </div>
      </section>
    </div>
  )
}
