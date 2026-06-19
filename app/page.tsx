import Link from "next/link"
import { getSheetTable, isSheetsConfigured, type SheetTable } from "@/lib/sheets"
import { ArrowRight, Sheet, ShieldCheck, Zap, AlertCircle, ExternalLink } from "lucide-react"

export const dynamic = "force-dynamic"

/** Heuristic: does this header/value look like a URL column? */
function isLink(value: string): boolean {
  return /^https?:\/\//i.test(value)
}

export default async function HomePage() {
  let table: SheetTable = { headers: [], rows: [] }
  let loadError: string | null = null
  const configured = isSheetsConfigured()

  if (configured) {
    try {
      table = await getSheetTable()
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

      {/* Полная таблица */}
      <section className="mx-auto w-full max-w-6xl px-4 py-16 md:py-24">
        <div className="mb-8 flex items-end justify-between">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">Данные таблицы</h2>
          {configured && !loadError && (
            <span className="text-sm text-muted-foreground">{table.rows.length} строк</span>
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

        {configured && !loadError && table.rows.length === 0 && (
          <p className="rounded-xl border bg-card p-6 text-muted-foreground">
            В таблице пока нет данных.
          </p>
        )}

        {configured && !loadError && table.rows.length > 0 && (
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left">
                  {table.headers.map((h, i) => (
                    <th
                      key={i}
                      className="whitespace-nowrap px-4 py-3 font-medium text-muted-foreground"
                    >
                      {h || `Колонка ${i + 1}`}
                    </th>
                  ))}
                  <th className="px-4 py-3 font-medium text-muted-foreground">Страница</th>
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, ri) => (
                  <tr key={row.id || ri} className="border-b last:border-0 hover:bg-muted/30">
                    {row.cells.map((cell, ci) => (
                      <td
                        key={ci}
                        className="px-4 py-3 align-top text-card-foreground"
                      >
                        {cell && isLink(cell) ? (
                          <a
                            href={cell}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                          >
                            Ссылка
                            <ExternalLink className="size-3.5" />
                          </a>
                        ) : (
                          <span className="block max-w-xs truncate" title={cell}>
                            {cell || "—"}
                          </span>
                        )}
                      </td>
                    ))}
                    <td className="px-4 py-3 align-top">
                      {row.id ? (
                        <Link
                          href={`/${row.id}`}
                          className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                        >
                          Открыть
                          <ArrowRight className="size-3.5" />
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
