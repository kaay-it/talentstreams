import { notFound } from "next/navigation"

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

      <p className="text-sm text-muted-foreground">Пока здесь нечего настраивать.</p>
    </div>
  )
}
