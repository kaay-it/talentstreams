import Link from "next/link"
import { ArrowLeft } from "lucide-react"

export default function NotFound() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-4">
      <div className="text-center">
        <p className="font-mono text-sm font-medium text-primary">404</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">Страница не найдена</h1>
        <p className="mx-auto mt-2 max-w-sm text-pretty text-muted-foreground">
          Такого профиля нет в таблице, либо ссылка устарела.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          <ArrowLeft className="size-4" />
          На главную
        </Link>
      </div>
    </main>
  )
}
