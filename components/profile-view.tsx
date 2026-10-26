import Link from "next/link"
import type { Candidate } from "@/lib/db/candidates"
import type { ResumeVersion } from "@/lib/db/resumes"
import { withDownloadFilename } from "@/lib/blob"
import {
  ArrowLeft,
  Mail,
  Phone,
  FileText,
  Link as LinkIcon,
} from "lucide-react"

/** A single contact/resume row — real (clickable) when editor, blurred placeholder otherwise. */
function InfoRow({
  icon: Icon,
  label,
  href,
  blurred,
}: {
  icon: typeof Mail
  label: string
  href?: string
  blurred?: boolean
}) {
  const content = (
    <span className="flex items-center gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="size-4" />
      </span>
      <span className={`min-w-0 truncate text-sm text-card-foreground ${blurred ? "select-none blur-sm" : ""}`}>
        {label}
      </span>
    </span>
  )
  return href ? (
    <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer" className="rounded-lg px-2 py-1.5 transition-colors hover:bg-muted">
      {content}
    </a>
  ) : (
    <div className="pointer-events-none rounded-lg px-2 py-1.5">{content}</div>
  )
}

export function ProfileView({
  profile,
  resumes,
  isEditor,
  backUrl = "/",
}: {
  profile: Candidate
  resumes: ResumeVersion[]
  isEditor: boolean
  backUrl?: string
}) {
  const contacts = [
    profile.email && { icon: Mail, label: profile.email, href: `mailto:${profile.email}` },
    profile.phone && { icon: Phone, label: profile.phone, href: `tel:${profile.phone}` },
  ].filter(Boolean) as { icon: typeof Mail; label: string; href: string }[]

  const hasHiddenInfo = contacts.length > 0 || resumes.length > 0
  const displayName = isEditor ? (profile.name || profile.id) : "Имя Фамилия"

  return (
    <main className="min-h-svh bg-background">
      <div className="mx-auto w-full max-w-2xl px-4 py-8 md:py-12">
        <Link
          href={backUrl}
          className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {backUrl === "/" ? "На главную" : "К подборке"}
        </Link>

        <article className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="h-28 bg-primary md:h-32" aria-hidden="true" />
          <div className="px-6 pb-8 pt-6 md:px-8">
            <h1
              className={`text-balance text-2xl font-semibold tracking-tight text-card-foreground md:text-3xl ${!isEditor ? "select-none blur-sm" : ""}`}
            >
              {displayName}
            </h1>
            {profile.title && <p className="mt-1 text-pretty text-base text-muted-foreground">{profile.title}</p>}

            {profile.stream.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {profile.stream.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {contacts.length > 0 && (
              <div className="mt-8 grid gap-2">
                {contacts.map((c, i) => (
                  <InfoRow
                    key={i}
                    icon={c.icon}
                    label={isEditor ? c.label : "скрыто до запроса контакта"}
                    href={isEditor ? c.href : undefined}
                    blurred={!isEditor}
                  />
                ))}
              </div>
            )}

            {resumes.length > 0 && (
              <div className="mt-2 grid gap-2">
                {isEditor
                  ? resumes.map((r) => (
                      <InfoRow
                        key={r.id}
                        icon={r.kind === "file" ? FileText : LinkIcon}
                        label={r.kind === "file" ? (r.filename || "Файл") : r.url}
                        href={r.kind === "file" ? withDownloadFilename(r.url, r.filename) : r.url}
                      />
                    ))
                  : (
                      <InfoRow icon={FileText} label="резюме скрыто до запроса контакта" blurred />
                    )}
              </div>
            )}

            {!isEditor && hasHiddenInfo && (
              <p className="mt-4 text-xs text-muted-foreground">
                Контакты кандидатов не публикуются напрямую. Если вас заинтересовал кандидат,
                нажмите «Хочу связаться» на странице подборки — мы уточним у кандидата его
                интерес и передадим контакты после подтверждения.
              </p>
            )}
          </div>
        </article>
      </div>
    </main>
  )
}
