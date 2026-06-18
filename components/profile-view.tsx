import Link from "next/link"
import type { Profile } from "@/lib/sheets"
import {
  ArrowLeft,
  Mail,
  Phone,
  Globe,
  MapPin,
} from "lucide-react"

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("")
}

export function ProfileView({ profile }: { profile: Profile }) {
  const contacts = [
    profile.email && {
      icon: Mail,
      label: profile.email,
      href: `mailto:${profile.email}`,
    },
    profile.phone && {
      icon: Phone,
      label: profile.phone,
      href: `tel:${profile.phone}`,
    },
    profile.website && {
      icon: Globe,
      label: profile.website.replace(/^https?:\/\//, ""),
      href: profile.website.startsWith("http") ? profile.website : `https://${profile.website}`,
    },
    profile.location && {
      icon: MapPin,
      label: profile.location,
      href: null,
    },
  ].filter(Boolean) as { icon: typeof Mail; label: string; href: string | null }[]

  const extraEntries = Object.entries(profile.extra)

  return (
    <main className="min-h-svh bg-background">
      <div className="mx-auto w-full max-w-2xl px-4 py-8 md:py-12">
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          На главную
        </Link>

        <article className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="h-28 bg-primary md:h-32" aria-hidden="true" />
          <div className="px-6 pb-8 md:px-8">
            <div className="-mt-12 mb-6 flex items-end justify-between gap-4">
              {profile.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.avatar || "/placeholder.svg"}
                  alt={`Фото профиля ${profile.name}`}
                  className="size-24 rounded-2xl border-4 border-card object-cover shadow-sm"
                />
              ) : (
                <div className="flex size-24 items-center justify-center rounded-2xl border-4 border-card bg-accent text-2xl font-semibold text-accent-foreground shadow-sm">
                  {initials(profile.name)}
                </div>
              )}
            </div>

            <h1 className="text-balance text-2xl font-semibold tracking-tight text-card-foreground md:text-3xl">
              {profile.name}
            </h1>
            {profile.title && <p className="mt-1 text-pretty text-base text-muted-foreground">{profile.title}</p>}

            {profile.bio && (
              <p className="mt-6 text-pretty leading-relaxed text-card-foreground">{profile.bio}</p>
            )}

            {contacts.length > 0 && (
              <div className="mt-8 grid gap-2">
                {contacts.map((c, i) => {
                  const Icon = c.icon
                  const content = (
                    <span className="flex items-center gap-3">
                      <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                        <Icon className="size-4" />
                      </span>
                      <span className="text-sm text-card-foreground">{c.label}</span>
                    </span>
                  )
                  return c.href ? (
                    <a
                      key={i}
                      href={c.href}
                      className="rounded-lg px-2 py-1.5 transition-colors hover:bg-muted"
                    >
                      {content}
                    </a>
                  ) : (
                    <div key={i} className="px-2 py-1.5">
                      {content}
                    </div>
                  )
                })}
              </div>
            )}

            {extraEntries.length > 0 && (
              <dl className="mt-8 grid gap-4 border-t pt-6 sm:grid-cols-2">
                {extraEntries.map(([key, value]) => (
                  <div key={key}>
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{key}</dt>
                    <dd className="mt-1 text-sm text-card-foreground">{value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </article>
      </div>
    </main>
  )
}
