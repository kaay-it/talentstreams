import { isSheetsConfigured } from "@/lib/sheets"
import { AlertCircle, Sheet, ShieldCheck, Zap } from "lucide-react"

export default function HomePage() {
  const configured = isSheetsConfigured()

  return (
    <main className="min-h-svh bg-background">
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

        {!configured && (
          <div className="mt-10">
            <SetupNotice />
          </div>
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
            <li>GOOGLE_SERVICE_ACCOUNT_JSON</li>
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
