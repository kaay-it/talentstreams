import { isSheetsConfigured } from "@/lib/sheets"
import {
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  Eye,
  Handshake,
  Lock,
  Search,
  ShieldCheck,
  UserCheck,
  Users,
  Zap,
} from "lucide-react"

export default function HomePage() {
  const configured = isSheetsConfigured()

  return (
    <main className="min-h-svh bg-background">
      {/* Hero */}
      <section className="relative overflow-hidden border-b">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-20%,oklch(0.94_0.03_195),transparent)]"
          aria-hidden="true"
        />
        <div className="relative mx-auto w-full max-w-5xl px-4 pt-16 pb-20 md:pt-24 md:pb-28">
          <div className="flex items-center gap-2 text-sm font-medium text-primary">
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Zap className="size-4" />
            </span>
            TalentStreams
          </div>

          <h1 className="mt-8 max-w-3xl text-balance text-4xl font-semibold tracking-tight text-foreground md:text-6xl">
            Проверенные кандидаты для работодателей Центральной Азии
          </h1>
          <p className="mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-muted-foreground md:text-xl">
            Еженедельные подборки релевантных специалистов — с предварительной проверкой опыта
            и уважением к приватности каждого кандидата.
          </p>

          <div className="mt-10 flex flex-wrap gap-3">
            <Pill icon={CalendarDays} text="Еженедельные подборки" />
            <Pill icon={BadgeCheck} text="Ручная верификация" />
            <Pill icon={Lock} text="Контакты по согласию" />
          </div>
        </div>
      </section>

      {/* Общая логика */}
      <section className="mx-auto w-full max-w-5xl px-4 py-16 md:py-24">
        <SectionHeading
          eyebrow="Общая логика сервиса"
          title="Качественный talent pipeline без спама и холодных контактов"
          description="Сервис предоставляет работодателям Центральной Азии еженедельные подборки проверенных кандидатов."
        />

        <div className="mt-12 grid gap-4 md:grid-cols-3">
          <FeatureCard
            icon={Users}
            title="Кураторский отбор"
            text="Кандидаты собираются вручную из открытых источников, профессиональных сетей, рекомендаций и входящих заявок."
          />
          <FeatureCard
            icon={UserCheck}
            title="Предварительная проверка"
            text="Каждый кандидат проходит верификацию опыта и готовности рассматривать предложения до попадания в подборку."
          />
          <FeatureCard
            icon={ShieldCheck}
            title="Приватность по умолчанию"
            text="Работодатель видит только анонимизированное summary — контакты передаются после явного согласия кандидата."
          />
        </div>
      </section>

      {/* Источники и проверка */}
      <section className="border-y bg-muted/40">
        <div className="mx-auto grid w-full max-w-5xl gap-12 px-4 py-16 md:grid-cols-2 md:py-24">
          <div>
            <SectionHeading
              eyebrow="Источники"
              title="Откуда берутся кандидаты"
              description="Мы не парсим базы ради количества. Каждый профиль добавляется осознанно — из проверенных каналов, где специалисты реально открыты к диалогу."
            />
            <ul className="mt-8 space-y-3">
              <SourceItem icon={Search} text="Открытые источники и публичные профили" />
              <SourceItem icon={Users} text="Профессиональные сети и сообщества" />
              <SourceItem icon={Handshake} text="Рекомендации от партнёров и клиентов" />
              <SourceItem icon={ArrowRight} text="Входящие заявки от самих кандидатов" />
            </ul>
          </div>

          <div className="rounded-2xl border bg-card p-6 shadow-sm md:p-8">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <BadgeCheck className="size-5" />
              </span>
              <h3 className="text-lg font-semibold text-card-foreground">Что проверяем до публикации</h3>
            </div>
            <ul className="mt-6 space-y-4">
              <CheckItem text="Подтверждение релевантного опыта" />
              <CheckItem text="Проверка соответствия заявленного опыта" />
              <CheckItem text="Готовность рассматривать предложения или быть открытым к диалогу" />
            </ul>
          </div>
        </div>
      </section>

      {/* Как работает связь */}
      <section className="mx-auto w-full max-w-5xl px-4 py-16 md:py-24">
        <SectionHeading
          eyebrow="Как это работает"
          title="Связь только по взаимному интересу"
          description="Работодатель не получает прямой доступ к контактам кандидата. Контакты передаются только после того, как кандидат подтвердил интерес к конкретной компании."
        />

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          <StepCard
            step={1}
            icon={Eye}
            title="Анонимизированное summary"
            text="Работодатель видит обезличенный профиль кандидата: опыт, навыки и контекст — без имён и контактов."
          />
          <StepCard
            step={2}
            icon={Handshake}
            title="«Хочу связаться»"
            text="Если профиль заинтересовал, работодатель отправляет запрос на контакт через сервис."
          />
          <StepCard
            step={3}
            icon={Lock}
            title="Контакты по согласию"
            text="Кандидат рассматривает предложение и только после подтверждения интереса получает работодатель доступ к контактам."
          />
        </div>
      </section>

      {!configured && (
        <section className="border-t bg-muted/30">
          <div className="mx-auto w-full max-w-5xl px-4 py-12 md:py-16">
            <SetupNotice />
          </div>
        </section>
      )}
    </main>
  )
}

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string
  title: string
  description: string
}) {
  return (
    <div className="max-w-3xl">
      <p className="text-sm font-medium tracking-wide text-primary uppercase">{eyebrow}</p>
      <h2 className="mt-3 text-balance text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
        {title}
      </h2>
      <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">{description}</p>
    </div>
  )
}

function Pill({ icon: Icon, text }: { icon: typeof Zap; text: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-sm text-card-foreground shadow-sm">
      <Icon className="size-4 text-primary" />
      {text}
    </span>
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
    <div className="rounded-2xl border bg-card p-6 shadow-sm">
      <span className="flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
        <Icon className="size-5" />
      </span>
      <h3 className="mt-5 font-semibold text-card-foreground">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{text}</p>
    </div>
  )
}

function SourceItem({ icon: Icon, text }: { icon: typeof Zap; text: string }) {
  return (
    <li className="flex items-start gap-3 text-sm leading-relaxed text-muted-foreground">
      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
        <Icon className="size-3.5" />
      </span>
      {text}
    </li>
  )
}

function CheckItem({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <BadgeCheck className="size-3" />
      </span>
      <span className="text-sm leading-relaxed text-card-foreground">{text}</span>
    </li>
  )
}

function StepCard({
  step,
  icon: Icon,
  title,
  text,
}: {
  step: number
  icon: typeof Zap
  title: string
  text: string
}) {
  return (
    <div className="relative rounded-2xl border bg-card p-6 shadow-sm">
      <span className="absolute -top-3 left-6 flex size-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
        {step}
      </span>
      <span className="mt-2 flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <Icon className="size-5" />
      </span>
      <h3 className="mt-5 font-semibold text-card-foreground">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{text}</p>
    </div>
  )
}

function SetupNotice() {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm md:p-8">
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
            Рекомендуемые колонки:{" "}
            <span className="font-mono text-xs">id, name, title, bio, email, phone, website, location, stream</span>
          </p>
        </div>
      </div>
    </div>
  )
}
