import Link from "next/link"
import { getProfiles, isSheetsConfigured, type Profile } from "@/lib/sheets"
import { ArrowRight, Sheet, ShieldCheck, Zap, AlertCircle } from "lucide-react"

export const dynamic = "force-dynamic"

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("")
}

export default async function HomePage() {
  let profiles: Profile[] = []
  let loadError: string | null = null
  const configured = isSheetsConfigured()

  if (configured) {
    try {
      profiles = await getProfiles()
    } catch (e) {
      loadError = e instanceof Error ? e.message : "Не удалось загрузить данные."
    }
  }

  return (
    <main className="min-h-svh bg-background">
      {/* Hero / визитка */}
      <section className="mx-auto w-full max-w-5xl px-4 pt-16 md:pt-24">
        <div className="flex items-center gap-2 text-sm font-medium text-primary">
          <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Zap className="size-4" />
          </span>
          TalentStreams
        </div>

        <h1 className="mt-8 max-w-3xl text-balance text-4xl font-semibold tracking-tight text-foreground md:text-6xl">
          Персональные визитки, собираемые из ваших данных
        </h1>
        <p className="mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-muted-foreground">
          Каждая строка в вашей Google-таблице превращается в отдельную страницу-визитку с уникальным адресом.
          Обновляете таблицу — обновляются страницы.
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          <FeatureCard icon={Sheet} title="Источник — Google Sheets" text="Данные подтягиваются напрямую из таблицы через сервисный аккаунт." />
          <FeatureCard icon={Zap} title="Динамическая генерация" text="Страницы создаются по запросу из актуальных строк таблицы." />
          <FeatureCard icon={ShieldCheck} title="Приватные адреса" text="Каждая страница доступна по собственному пути /id." />
        </div>
      </section>

      {/* Directory */}
      <section className="mx-auto w-full max-w-5xl px-4 py-16 md:py-24">
        <div className="mb-8 flex items-end justify-between">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">Доступные страницы</h2>
          {configured && !loadError && (
            <span className="text-sm text-muted-foreground">{profiles.length} шт.</span>
          )}
        </div>

        {!configured && <SetupNotice />}

        {configured && loadError && (
          <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 text-sm text-card-foreground">
            <AlertCircle className="mt-0.5 size-5 shrink-0 text-primary" />
            <div>
              <p className="font-medium">Не удалось загрузить данные из таблицы</p>
              <p className="mt-1 text-muted-foreground">{loadError}</p>
            </div>
          </div>
        )}

        {configured && !loadError && profiles.length === 0 && (
          <p className="rounded-xl border bg-card p-6 text-muted-foreground">
            В таблице пока нет строк с профилями. Добавьте строки с колонками id и name.
          </p>
        )}

        {configured && !loadError && profiles.length > 0 && (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {profiles.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/${p.id}`}
                  className="group flex h-full flex-col rounded-xl border bg-card p-5 transition-colors hover:border-primary"
                >
                  <div className="flex items-center gap-3">
                    {p.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.avatar || "/placeholder.svg"}
                        alt={`Фото ${p.name}`}
                        className="size-12 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="flex size-12 items-center justify-center rounded-lg bg-accent text-sm font-semibold text-accent-foreground">
                        {initials(p.name)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="truncate font-medium text-card-foreground">{p.name}</p>
                      {p.title && <p className="truncate text-sm text-muted-foreground">{p.title}</p>}
                    </div>
                  </div>
                  {p.bio && <p className="mt-4 line-clamp-2 text-sm text-muted-foreground">{p.bio}</p>}
                  <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">
                    Открыть
                    <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}

function FeatureCard({
  icon: Icon,
  title,
  text,
}: {
  icon: typeof Zap
  title: string
  text: string
}) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
        <Icon className="size-4" />
      </span>
      <h3 className="mt-4 font-medium text-card-foreground">{title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{text}</p>
    </div>
  )
}

function SetupNotice() {
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 size-5 shrink-0 text-primary" />
        <div className="space-y-3 text-sm">
          <p className="font-medium text-card-foreground">Подключите Google Sheets, чтобы начать</p>
          <p className="text-muted-foreground">
            Добавьте переменные окружения в проект, затем создайте таблицу с заголовками в первой строке.
          </p>
          <ul className="grid gap-1 font-mono text-xs text-muted-foreground">
            <li>GOOGLE_SERVICE_ACCOUNT_EMAIL</li>
            <li>GOOGLE_PRIVATE_KEY</li>
            <li>GOOGLE_SHEET_ID</li>
          </ul>
          <p className="text-muted-foreground">
            Рекомендуемые колонки: <span className="font-mono text-xs">id, name, title, bio, email, phone, website, location, avatar</span>
          </p>
        </div>
      </div>
    </div>
  )
}
