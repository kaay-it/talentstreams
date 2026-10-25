import "server-only"
import { eq, inArray, and, isNotNull, ne } from "drizzle-orm"
import { db } from "./index"
import { mailingLists, mailingListEntries, mailingListRecipients, streams } from "./schema"
import { getStreamIdByName } from "./streams"
import { getActiveCandidates, type Candidate } from "./candidates"

export type MailingListEntry = {
  profile: Candidate
  /** Stream value from the mailing list, same for every entry in one list. */
  mailingStream: string
}

export type MailingList = {
  listId: string
  stream: string
  /** ru-RU text, e.g. "21.07.2026" — matches the display format used in SendPulse campaign names. */
  date: string
  entries: MailingListEntry[]
}

export type MailingListSummary = {
  listId: string
  streamId: number | null
  stream: string
  date: string
  recipientLabel: string
  sentCampaignId: number | null
  candidateCount: number
  candidateIds: string[]
}

/** Formats an ISO "YYYY-MM-DD" date as ru-RU text ("21.07.2026") — the display format everywhere
 * this app already shows a mailing-list date (SendPulse campaign names, email body, editor UI). */
export function isoToRu(iso: string): string {
  const [y, m, d] = iso.split("-")
  return `${d}.${m}.${y}`
}

/** Extracts the ru-RU date from a full "YYYY-MM-DDTHH:MM:SS..." timestamp string, ignoring the
 * time component — this app doesn't surface mailing-list time anywhere yet (UI picks a date
 * only); see isoToRu() for the date-only formatter this wraps. */
function timestampToRu(timestamp: string): string {
  return isoToRu(timestamp.slice(0, 10))
}

/** Display name for a release's SendPulse campaign (dashboard, editor UI) — NOT the source of
 * truth for "was this release sent" (that's mailingLists.sentCampaignId, written once on first
 * real send). Empty recipientLabel — ordinary whole-stream release, name as always; non-empty —
 * narrowed release, company names suffixed so it's distinguishable from another narrowed release
 * of the same stream on the same day. Plain helper, not a Server Action — lives here (not
 * app/actions.ts, which is "use server" and would force it to be async) since both
 * app/actions.ts and app/editor/page.tsx need it. */
export function campaignNameFor(stream: string, date: string, recipientLabel: string): string {
  return recipientLabel ? `${stream} — ${date} — ${recipientLabel}` : `${stream} — ${date}`
}

/**
 * Fetch a mailing list by its ID, preserving per-entry stream and the list date.
 * Returns null if the list does not exist or contains no candidates.
 */
export async function getMailingList(listId: string): Promise<MailingList | null> {
  const header = await db
    .select({ streamName: streams.name, targetDate: mailingLists.targetDate })
    .from(mailingLists)
    .leftJoin(streams, eq(mailingLists.streamId, streams.id))
    .where(eq(mailingLists.id, listId))
    .limit(1)
  const h = header[0]
  if (!h) return null

  const entryRows = await db
    .select({ candidateId: mailingListEntries.candidateId })
    .from(mailingListEntries)
    .where(eq(mailingListEntries.listId, listId))
  const candidateIds = new Set(entryRows.map((r) => r.candidateId))
  if (!candidateIds.size) return null

  const allProfiles = await getActiveCandidates()
  const entries: MailingListEntry[] = allProfiles
    .filter((p) => candidateIds.has(p.id))
    .map((p) => ({ profile: p, mailingStream: h.streamName ?? "" }))

  return { listId, stream: h.streamName ?? "", date: timestampToRu(h.targetDate), entries }
}

/** Lightweight metadata-only lookup — no candidate/Profile join. Use this instead of
 * getMailingList() wherever only the stream/date are needed (campaign naming, sent-release checks). */
export async function getMailingListMeta(
  listId: string,
): Promise<{ listId: string; stream: string; date: string; recipientLabel: string; sentCampaignId: number | null } | null> {
  const rows = await db
    .select({
      streamName: streams.name,
      targetDate: mailingLists.targetDate,
      recipientLabel: mailingLists.recipientLabel,
      sentCampaignId: mailingLists.sentCampaignId,
    })
    .from(mailingLists)
    .leftJoin(streams, eq(mailingLists.streamId, streams.id))
    .where(eq(mailingLists.id, listId))
    .limit(1)
  const row = rows[0]
  return row
    ? {
        listId,
        stream: row.streamName ?? "",
        date: timestampToRu(row.targetDate),
        recipientLabel: row.recipientLabel,
        sentCampaignId: row.sentCampaignId,
      }
    : null
}

/** Candidate IDs of a single release, no join/date formatting — used by publishMailingList() to
 * apply the publication-pause rule (TASK-05) to exactly the candidates just sent, without pulling
 * every release's candidates via getMailingLists(). */
export async function getMailingListCandidateIds(listId: string): Promise<string[]> {
  const rows = await db
    .select({ candidateId: mailingListEntries.candidateId })
    .from(mailingListEntries)
    .where(eq(mailingListEntries.listId, listId))
  return [...new Set(rows.map((r) => r.candidateId))]
}

/** Fetch all mailing lists grouped by List ID (no profile data, fast), newest date first. */
export async function getMailingLists(): Promise<MailingListSummary[]> {
  try {
    const headers = await db
      .select({
        listId: mailingLists.id,
        streamId: mailingLists.streamId,
        streamName: streams.name,
        targetDate: mailingLists.targetDate,
        recipientLabel: mailingLists.recipientLabel,
        sentCampaignId: mailingLists.sentCampaignId,
      })
      .from(mailingLists)
      .leftJoin(streams, eq(mailingLists.streamId, streams.id))

    const entryRows = await db
      .select({ listId: mailingListEntries.listId, candidateId: mailingListEntries.candidateId })
      .from(mailingListEntries)
    const candidateIdsByList = new Map<string, Set<string>>()
    for (const row of entryRows) {
      if (!candidateIdsByList.has(row.listId)) candidateIdsByList.set(row.listId, new Set())
      candidateIdsByList.get(row.listId)!.add(row.candidateId)
    }

    return headers
      .map((h) => {
        const candidateIds = Array.from(candidateIdsByList.get(h.listId) ?? [])
        return {
          listId: h.listId,
          streamId: h.streamId,
          stream: h.streamName ?? "",
          targetDate: h.targetDate,
          recipientLabel: h.recipientLabel,
          sentCampaignId: h.sentCampaignId,
          candidateCount: candidateIds.length,
          candidateIds,
        }
      })
      .sort((a, b) => b.targetDate.localeCompare(a.targetDate))
      .map(({ listId, streamId, stream, targetDate, recipientLabel, sentCampaignId, candidateCount, candidateIds }) => ({
        listId,
        streamId,
        stream,
        date: timestampToRu(targetDate),
        recipientLabel,
        sentCampaignId,
        candidateCount,
        candidateIds,
      }))
  } catch {
    return []
  }
}

/**
 * Creates a new mailing list ("release"): a header row + one mailingListEntries row per
 * candidate. Two separate inserts (neon-http doesn't give convenient multi-statement
 * transactions) — a failure between them could leave an orphaned empty header with no entries;
 * getMailingList()/getMailingListsForCandidate() simply won't show such a release (0 candidates),
 * no more dangerous than other non-transactional multi-step writes in this file (e.g.
 * registerCandidate + addResumeVersion). `date` is ISO "YYYY-MM-DD" (straight from an
 * <input type="date">). `recipientLabel` — company names of a narrowed release's recipients,
 * "" or omitted = whole stream (the default).
 */
export async function createMailingListRows(data: {
  stream: string
  date: string
  candidateIds: string[]
  recipientLabel?: string
}): Promise<{ listId: string }> {
  if (!data.candidateIds.length) throw new Error("Выберите хотя бы одного кандидата")

  const streamId = await getStreamIdByName(data.stream)
  if (streamId === null) throw new Error(`Стрим не найден: ${data.stream}`)

  const listId = crypto.randomUUID()
  await db.insert(mailingLists).values({
    id: listId,
    streamId,
    targetDate: `${data.date}T00:00:00`,
    recipientLabel: data.recipientLabel ?? "",
  })
  await db.insert(mailingListEntries).values(data.candidateIds.map((candidateId) => ({ listId, candidateId })))

  return { listId }
}

/** Snaps a release's planned date/time to the actual moment of first send (see
 * publishMailingList()) — the plan is not an obligation, the manager may send later/earlier and
 * at a different time of day; now a full timestamp, not just a date. `timestamp` is an ISO string. */
export async function updateMailingListTimestamp(listId: string, timestamp: string): Promise<void> {
  await db.update(mailingLists).set({ targetDate: timestamp }).where(eq(mailingLists.id, listId))
}

/** Records that a release was actually sent — written once, right after the first successful
 * createCampaign() (publishMailingList() only calls this inside its !alreadySent branch, so a
 * resend never overwrites it with a newer campaignId — "was this release sent" means "sent at
 * least once", not "what was the most recent campaignId"). */
export async function markMailingListSent(listId: string, campaignId: number): Promise<void> {
  await db.update(mailingLists).set({ sentCampaignId: campaignId }).where(eq(mailingLists.id, listId))
}

/** Deletes a release's header row — ON DELETE CASCADE on both mailingListEntries.listId and
 * mailingListRecipients.listId takes care of their rows too, no separate cleanup needed. Callers
 * must ensure the release was never sent (app/actions.ts checks mailingLists.sentCampaignId). */
export async function deleteMailingListRows(listId: string): Promise<void> {
  await db.delete(mailingLists).where(eq(mailingLists.id, listId))
}

export type CandidateMailingHistoryEntry = { listId: string; stream: string; date: string; sentCampaignId: number | null }

/** Every release a candidate has ever been included in, newest first (TASK-05 groundwork —
 * visibility into publication history before any pause-rule enforcement is built on top of it). */
export async function getMailingListsForCandidate(candidateId: string): Promise<CandidateMailingHistoryEntry[]> {
  if (!candidateId) return []

  const entryRows = await db
    .select({ listId: mailingListEntries.listId })
    .from(mailingListEntries)
    .where(eq(mailingListEntries.candidateId, candidateId))
  const listIds = [...new Set(entryRows.map((r) => r.listId))]
  if (!listIds.length) return []

  const headers = await db
    .select({
      listId: mailingLists.id,
      streamName: streams.name,
      targetDate: mailingLists.targetDate,
      sentCampaignId: mailingLists.sentCampaignId,
    })
    .from(mailingLists)
    .leftJoin(streams, eq(mailingLists.streamId, streams.id))
    .where(inArray(mailingLists.id, listIds))

  return headers
    .map((h) => ({ listId: h.listId, stream: h.streamName ?? "", targetDate: h.targetDate, sentCampaignId: h.sentCampaignId }))
    .sort((a, b) => b.targetDate.localeCompare(a.targetDate))
    .map(({ listId, stream, targetDate, sentCampaignId }) => ({ listId, stream, date: timestampToRu(targetDate), sentCampaignId }))
}

/** Every sent restricted (narrowed-recipient) release — the only ones that ever got a throwaway
 * SendPulse address book (`${stream} — ${date} — ${listId}`, see publishMailingList()). A
 * whole-stream release reuses the long-lived per-stream book and is never a candidate for this
 * cleanup. Used by the cleanup-adhoc-books cron — recipientLabel itself isn't needed there, just
 * enough to reconstruct the exact book name and know which campaign to check. */
export async function getSentRestrictedMailingLists(): Promise<
  { listId: string; stream: string; date: string; sentCampaignId: number }[]
> {
  const rows = await db
    .select({
      listId: mailingLists.id,
      streamName: streams.name,
      targetDate: mailingLists.targetDate,
      sentCampaignId: mailingLists.sentCampaignId,
    })
    .from(mailingLists)
    .leftJoin(streams, eq(mailingLists.streamId, streams.id))
    .where(and(isNotNull(mailingLists.sentCampaignId), ne(mailingLists.recipientLabel, "")))

  return rows.map((r) => ({
    listId: r.listId,
    stream: r.streamName ?? "",
    date: timestampToRu(r.targetDate),
    sentCampaignId: r.sentCampaignId as number,
  }))
}

/** Writes the hand-picked recipient-override rows for a release — one row per employer token.
 * Call only when employerTokens.length > 0; leaving this unwritten for a listId is exactly what
 * makes that release default to "whole stream" (see getMailingListRecipientTokens()). */
export async function createMailingListRecipientRows(listId: string, employerTokens: string[]): Promise<void> {
  const tokens = [...new Set(employerTokens)]
  if (!tokens.length) return
  await db.insert(mailingListRecipients).values(tokens.map((employerToken) => ({ listId, employerToken })))
}

/** Hand-picked recipient tokens for a release, or [] if it targets the whole stream (the
 * default — no override rows were ever written for this listId). */
export async function getMailingListRecipientTokens(listId: string): Promise<string[]> {
  const rows = await db
    .select({ employerToken: mailingListRecipients.employerToken })
    .from(mailingListRecipients)
    .where(eq(mailingListRecipients.listId, listId))
  return rows.map((r) => r.employerToken)
}

/** Fully replaces a release's candidate list — deletes all current mailingListEntries rows for
 * this listId and inserts the new set. Used to edit an unsent release (publishMailingList()/
 * deleteMailingList() never touch the entry set). */
export async function replaceMailingListEntries(listId: string, candidateIds: string[]): Promise<void> {
  if (!candidateIds.length) throw new Error("Выберите хотя бы одного кандидата")
  await db.delete(mailingListEntries).where(eq(mailingListEntries.listId, listId))
  await db.insert(mailingListEntries).values(candidateIds.map((candidateId) => ({ listId, candidateId })))
}

/** Fully replaces a release's recipient override and keeps the header's recipientLabel in sync
 * with it (the two must always agree) — switching back to "whole stream" also goes through this
 * (employerTokens: [], recipientLabel: "" clears the old rows and the label together). */
export async function replaceMailingListRecipients(
  listId: string,
  employerTokens: string[],
  recipientLabel: string,
): Promise<void> {
  await db.delete(mailingListRecipients).where(eq(mailingListRecipients.listId, listId))
  const tokens = [...new Set(employerTokens)]
  if (tokens.length) {
    await db.insert(mailingListRecipients).values(tokens.map((employerToken) => ({ listId, employerToken })))
  }
  await db.update(mailingLists).set({ recipientLabel }).where(eq(mailingLists.id, listId))
}
