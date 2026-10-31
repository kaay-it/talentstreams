import { MapPin } from "lucide-react"
import type { MailingListEntry } from "@/lib/db/mailing-lists"
import { ContactButton } from "@/components/contact-button"

/** One candidate card — shared by /list/[listId] (a release's resolved selection, "Хочу
 * связаться" active) and /selection/[selectionId] (inspecting one подборка directly, no contact
 * flow — there's no employer context on that page, just the editor looking at raw content). */
export function CandidateEntryCard({
  entry,
  listId,
  employerToken,
  streamTypes,
  showContactButton = true,
}: {
  entry: MailingListEntry
  listId?: string
  employerToken?: string
  streamTypes: Map<string, string>
  showContactButton?: boolean
}) {
  const { profile } = entry

  // Industry/Function tags are derived from the candidate's Stream membership
  // (TASK-27) via each stream's type, rather than separate Profile fields.
  const industryTags = profile.stream.filter((s) => streamTypes.get(s.trim().toLowerCase()) === "Industry")
  const funcTags = profile.stream.filter((s) => streamTypes.get(s.trim().toLowerCase()) === "Functional")

  const country = [
    profile.countryPrimary,
    profile.countryDesired ? `→ ${profile.countryDesired}` : "",
  ]
    .filter(Boolean)
    .join("  ")

  return (
    <article className="rounded-2xl border bg-card p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {(profile.title || profile.level) && (
            <div className="flex flex-wrap items-center gap-2">
              {profile.title && (
                <p className="font-semibold text-card-foreground">{profile.title}</p>
              )}
              {profile.level && (
                <span className="inline-flex items-center rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-medium text-teal-700 dark:bg-teal-900/20 dark:text-teal-400">
                  {profile.level}
                </span>
              )}
            </div>
          )}
          {country && (
            <p className="mt-1 inline-flex items-center gap-1 text-sm text-muted-foreground">
              <MapPin className="size-3.5 shrink-0" />
              {country}
            </p>
          )}
        </div>

        {(industryTags.length > 0 || funcTags.length > 0) && (
          <div className="flex flex-wrap gap-1.5">
            {industryTags.map((tag) => (
              <span
                key={`industry-${tag}`}
                className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
              >
                {tag}
              </span>
            ))}
            {funcTags.map((tag) => (
              <span
                key={`func-${tag}`}
                className="inline-flex items-center rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-medium text-violet-700 dark:bg-violet-900/30 dark:text-violet-400"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {profile.summary && (
        <p className="mt-4 text-sm leading-relaxed text-card-foreground whitespace-pre-line">
          {profile.summary}
        </p>
      )}

      {showContactButton && listId && (
        <div className="mt-5 border-t pt-4">
          <ContactButton candidateId={profile.id} listId={listId} employerToken={employerToken} />
        </div>
      )}
    </article>
  )
}
