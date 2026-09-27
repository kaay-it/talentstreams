"use client"

import { EmployerRegistrationModal } from "@/components/employer-registration-modal"
import { CandidateRegistrationModal } from "@/components/candidate-registration-modal"
import { LanguageToggle } from "@/components/language-toggle"
import { useLocale } from "@/components/language-provider"
import { homeDict } from "@/lib/i18n/home"
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

export function HomePageContent({ configured, streams }: { configured: boolean; streams: string[] }) {
  const { locale } = useLocale()
  const t = homeDict[locale]

  return (
    <main className="min-h-svh bg-background">
      {/* Sticky header */}
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-medium text-primary">
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Zap className="size-4" />
            </span>
            TalentStreams
          </div>
          <div className="flex items-center gap-2">
            <LanguageToggle />
            <CandidateRegistrationModal />
            <EmployerRegistrationModal streams={streams} />
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden border-b">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-20%,oklch(0.94_0.03_195),transparent)]"
          aria-hidden="true"
        />
        <div className="relative mx-auto w-full max-w-5xl px-4 pt-16 pb-20 md:pt-24 md:pb-28">
          <h1 className="max-w-3xl text-balance text-4xl font-semibold tracking-tight text-foreground md:text-6xl">
            {t.hero.title}
          </h1>
          <p className="mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-muted-foreground md:text-xl">
            {t.hero.subtitle}
          </p>

          <div className="mt-10 flex flex-wrap gap-3">
            <Pill icon={CalendarDays} text={t.hero.pills.weekly} />
            <Pill icon={BadgeCheck} text={t.hero.pills.verified} />
            <Pill icon={Lock} text={t.hero.pills.consent} />
          </div>
        </div>
      </section>

      {/* Общая логика */}
      <section className="mx-auto w-full max-w-5xl px-4 py-16 md:py-24">
        <SectionHeading eyebrow={t.logic.eyebrow} title={t.logic.title} description={t.logic.description} />

        <div className="mt-12 grid gap-4 md:grid-cols-3">
          <FeatureCard icon={Users} title={t.logic.features[0].title} text={t.logic.features[0].text} />
          <FeatureCard icon={UserCheck} title={t.logic.features[1].title} text={t.logic.features[1].text} />
          <FeatureCard icon={ShieldCheck} title={t.logic.features[2].title} text={t.logic.features[2].text} />
        </div>
      </section>

      {/* Источники и проверка */}
      <section className="border-y bg-muted/40">
        <div className="mx-auto grid w-full max-w-5xl gap-12 px-4 py-16 md:grid-cols-2 md:py-24">
          <div>
            <SectionHeading eyebrow={t.sources.eyebrow} title={t.sources.title} description={t.sources.description} />
            <ul className="mt-8 space-y-3">
              <SourceItem icon={Search} text={t.sources.items[0]} />
              <SourceItem icon={Users} text={t.sources.items[1]} />
              <SourceItem icon={Handshake} text={t.sources.items[2]} />
              <SourceItem icon={ArrowRight} text={t.sources.items[3]} />
            </ul>
          </div>

          <div className="rounded-2xl border bg-card p-6 shadow-sm md:p-8">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <BadgeCheck className="size-5" />
              </span>
              <h3 className="text-lg font-semibold text-card-foreground">{t.sources.checklistTitle}</h3>
            </div>
            <ul className="mt-6 space-y-4">
              <CheckItem text={t.sources.checklist[0]} />
              <CheckItem text={t.sources.checklist[1]} />
              <CheckItem text={t.sources.checklist[2]} />
            </ul>
          </div>
        </div>
      </section>

      {/* Как работает связь */}
      <section className="mx-auto w-full max-w-5xl px-4 py-16 md:py-24">
        <SectionHeading
          eyebrow={t.howItWorks.eyebrow}
          title={t.howItWorks.title}
          description={t.howItWorks.description}
        />

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          <StepCard step={1} icon={Eye} title={t.howItWorks.steps[0].title} text={t.howItWorks.steps[0].text} />
          <StepCard step={2} icon={Handshake} title={t.howItWorks.steps[1].title} text={t.howItWorks.steps[1].text} />
          <StepCard step={3} icon={Lock} title={t.howItWorks.steps[2].title} text={t.howItWorks.steps[2].text} />
        </div>
      </section>

      {!configured && (
        <section className="border-t bg-muted/30">
          <div className="mx-auto w-full max-w-5xl px-4 py-12 md:py-16">
            <SetupNotice
              title={t.setup.title}
              description={t.setup.description}
              columnsLabel={t.setup.columnsLabel}
              recommendedColumnsLabel={t.setup.recommendedColumnsLabel}
            />
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

function SetupNotice({
  title,
  description,
  columnsLabel,
  recommendedColumnsLabel,
}: {
  title: string
  description: string
  columnsLabel: string
  recommendedColumnsLabel: string
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm md:p-8">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 size-5 shrink-0 text-primary" />
        <div className="space-y-3 text-sm">
          <p className="font-medium text-card-foreground">{title}</p>
          <p className="text-muted-foreground">{description}</p>
          <ul className="grid gap-1 font-mono text-xs text-muted-foreground">
            <li>GOOGLE_SERVICE_ACCOUNT_JSON</li>
            <li>GOOGLE_SHEET_ID</li>
          </ul>
          <p className="text-muted-foreground">
            {columnsLabel} <span className="font-mono text-xs">{recommendedColumnsLabel}</span>
          </p>
        </div>
      </div>
    </div>
  )
}
